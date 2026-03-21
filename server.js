import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import PDFDocument from 'pdfkit';
import zlib from 'zlib';
import { Whop } from '@whop/sdk';
import { calculateATSScore, calculateKeywordMatch, extractSkills, generateImprovements } from './ats-analyzer.js';
import { selectRandomStyle } from './cv-styles.js';
import { StorageService } from './src/job-tracker/storage-service.js';
import { ApplicationTracker } from './src/job-tracker/application-tracker.js';
import { CVVersionManager } from './src/job-tracker/cv-version-manager.js';
import { PerformanceAnalyzer } from './src/job-tracker/performance-analyzer.js';
import { initDatabase, getUser, createUser, updateUserEmail, updateUserPlan, decrementUserCredits, incrementUserFixes, addFixHistory, addCvVersion, getStats, incrementGlobalFixes, getGlobalStats, getAllUsers, cleanupExpiredSubscriptions } from './src/db/database.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Veritabanını başlat
initDatabase();

const whop = new Whop({
  apiKey: process.env.WHOP_API_KEY || ''
});

const app = express();
const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════
// STATS COUNTER (real, persisted)
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// MAGIC LINK AUTHENTICATION
// ═══════════════════════════════════════════════════════
const TOKENS_FILE = path.join(__dirname, 'magic-tokens.json');
const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 dakika

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      // Expired tokenları temizle
      const now = Date.now();
      const clean = {};
      for (const [token, info] of Object.entries(data)) {
        if (info.expiresAt > now) {
          clean[token] = info;
        }
      }
      return clean;
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveTokens() {
  try {
    const tmp = TOKENS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(magicTokens, null, 2), 'utf8');
    fs.renameSync(tmp, TOKENS_FILE);
  } catch (e) { /* ignore */ }
}

let magicTokens = loadTokens();

function generateMagicToken(email) {
  const token = crypto.randomBytes(32).toString('hex');
  magicTokens[token] = {
    email: email.toLowerCase().trim(),
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_EXPIRY_MS
  };
  saveTokens();
  return token;
}

function verifyMagicToken(token) {
  const tokenInfo = magicTokens[token];
  if (!tokenInfo) return null;
  if (tokenInfo.expiresAt < Date.now()) {
    delete magicTokens[token];
    saveTokens();
    return null;
  }
  // Kullanıldıktan sonra sil (one-time use)
  delete magicTokens[token];
  saveTokens();
  return tokenInfo.email;
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ═══════════════════════════════════════════════════════
// APPLICATION TRACKER STORE
// ═══════════════════════════════════════════════════════
const APPS_FILE = path.join(__dirname, 'applications.json');

function loadApps() {
  try {
    if (fs.existsSync(APPS_FILE)) {
      return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveApps() {
  try {
    const tmp = APPS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(apps, null, 2), 'utf8');
    fs.renameSync(tmp, APPS_FILE);
  } catch (e) { /* ignore */ }
}

let apps = loadApps();

function getUserApps(userId) {
  if (!apps[userId]) apps[userId] = [];
  return apps[userId];
}

function addApp(userId, data) {
  const app = {
    id: crypto.randomUUID(),
    company: sanitizeText(data.company || '', 100),
    role: sanitizeText(data.role || '', 100),
    url: sanitizeText(data.url || '', 500),
    dateApplied: data.dateApplied || new Date().toISOString().slice(0, 10),
    status: ['applied', 'interview', 'offer', 'rejected', 'ghosted'].includes(data.status) ? data.status : 'applied',
    cvVersion: sanitizeText(data.cvVersion || '', 50),
    cvScore: typeof data.cvScore === 'number' ? data.cvScore : null,
    notes: sanitizeText(data.notes || '', 500),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  if (!apps[userId]) apps[userId] = [];
  apps[userId].push(app);
  saveApps();
  return app;
}

function updateAppStatus(userId, appId, newStatus) {
  const userApps = getUserApps(userId);
  const app = userApps.find(a => a.id === appId);
  if (!app) return null;
  app.status = newStatus;
  app.updatedAt = Date.now();
  saveApps();
  return app;
}

function deleteApp(userId, appId) {
  if (!apps[userId]) return false;
  const idx = apps[userId].findIndex(a => a.id === appId);
  if (idx === -1) return false;
  apps[userId].splice(idx, 1);
  saveApps();
  return true;
}

// ═══════════════════════════════════════════════════════
// CV VERSION TRACKER STORE
// ═══════════════════════════════════════════════════════
function getUserCvVersions(userId) {
  if (!apps._cvVersions) apps._cvVersions = {};
  if (!apps._cvVersions[userId]) apps._cvVersions[userId] = [];
  return apps._cvVersions[userId];
}

// AI MODEL FALLBACK with timeout
// ═══════════════════════════════════════════════════════
const AI_MODELS = [
  { name: 'gemini-2.5-flash-lite', config: { temperature: 1.3, topP: 0.95, topK: 50 } },
  { name: 'gemini-2.5-flash', config: { temperature: 1.3, topP: 0.95, topK: 50 } }
];

const AI_TIMEOUT_MS = 30000; // 30 seconds

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), ms))
  ]);
}

async function generateWithFallback(apiKey, prompt, modelList = AI_MODELS) {
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError;

  for (const m of modelList) {
    try {
      const model = genAI.getGenerativeModel({
        model: m.name,
        generationConfig: m.config
      });
      const result = await withTimeout(model.generateContent(prompt), AI_TIMEOUT_MS);
      const text = result.response.text();
      console.log(`  ✓ AI model: ${m.name}`);
      return text;
    } catch (err) {
      lastError = err;
      console.warn(`  ✗ AI model ${m.name} failed: ${err.message}`);
      if (!err.message?.includes('429') && 
          !err.message?.includes('503') && 
          !err.message?.includes('404') && 
          !err.message?.includes('overloaded') &&
          !err.message?.includes('timeout')) {
        throw err;
      }
    }
  }
  throw lastError || new Error('All AI models failed');
}

// ═══════════════════════════════════════════════════════
// USER & ACCESS STORE (SQLite Database)
// ═══════════════════════════════════════════════════════

const PLANS = {
  free: { freeUses: 3, name: 'Free', price: 0 },
  starter: { freeUses: 5, name: 'Starter', price: 9 },
  pro: { freeUses: Infinity, name: 'Pro', price: 19, isSubscription: true }
};

// Her saat başı süresi dolmuş abonelikleri temizle
setInterval(() => {
  cleanupExpiredSubscriptions();
  console.log('Expired subscriptions cleaned up');
}, 60 * 60 * 1000);

function grantAccess(whopUserId, planType, metadata = {}) {
  const plan = PLANS[planType];
  if (!plan) return false;

  updateUserPlan(whopUserId, planType, plan.isSubscription ? Date.now() + 30 * 24 * 60 * 60 * 1000 : null);
  console.log(`Access granted: ${whopUserId} → ${planType}`);
  return true;
}

// User identification: Session ID > Whop user ID > IP hash
function getUserId(req) {
  // Frontend-generated session ID (stays same across network changes)
  const sessionId = req.headers['x-session-id'];
  if (sessionId) return 'ses_' + sanitizeText(sessionId, 64);
  // Whop user ID
  const whopUserId = req.headers['x-whop-user-id'] || req.body?.whopUserId;
  if (whopUserId) return 'whop_' + sanitizeText(whopUserId, 50);
  // Last resort: IP hash
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return 'ip_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// ═══════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════

const allowedOrigins = [
  // Production
  'https://hiresflows-production.up.railway.app',
  // Development only
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:5500'
  ] : []),
  // Custom frontend URL
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log blocked origins for debugging
      console.warn('CORS blocked:', origin);
      callback(new Error('CORS policy: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-whop-user-id'],
  maxAge: 86400
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '1mb' }));

// ⚠️ Security: sadece belirli dosyaları serve et (.env, .cjs, server.js gibi dosyalar açığa çıkmaz)
const STATIC_FILES = ['index.html', 'HiresFlows.html', 'jobs.html', 'how-it-works.html', 'pricing.html', 'terms.html', 'privacy.html', 'favicon.ico', 'greenlogo.png', 'log.png', 'logo.png', 'login.html', 'auth-callback.html'];
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const reqPath = req.path === '/' ? '/index.html' : req.path;
  const fileName = reqPath.replace(/^\//, '');
  if (STATIC_FILES.includes(fileName)) {
    return res.sendFile(path.join(__dirname, fileName));
  }
  next();
});

// Rate limiting
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 20;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    entry = { windowStart: now, count: 1 };
    rateLimitMap.set(ip, entry);
    return next();
  }
  entry.count++;
  if (entry.count > RATE_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Input validation
function sanitizeText(text, maxLen = 10000) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
}

function validatePrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return false;
  if (prompt.length > 15000) return false;
  return true;
}

// ═══════════════════════════════════════════════════════
// JOB APPLICATION TRACKER INITIALIZATION
// ═══════════════════════════════════════════════════════

const APPLICATIONS_FILE = path.join(__dirname, 'applications.json');

// Initialize Job Application Tracker components
const storageService = new StorageService(APPLICATIONS_FILE);
const applicationTracker = new ApplicationTracker(storageService);
const cvVersionManager = new CVVersionManager(storageService);
const performanceAnalyzer = new PerformanceAnalyzer(applicationTracker, cvVersionManager);

console.log('✓ Job Application Tracker initialized');

// ═══════════════════════════════════════════════════════
// ROUTES: User Status & Auth
// ═══════════════════════════════════════════════════════

// Kullanıcı durumunu döndür (frontend bununla UI'ı günceller)
app.get('/api/me', rateLimit, (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const planConfig = PLANS[user.plan] || PLANS.free;
  const isPremium = user.plan === 'pro' || (user.plan === 'starter' && user.freeUsesLeft > 0);
  
  res.json({
    userId,
    plan: user.plan,
    planName: planConfig.name,
    freeUsesLeft: user.freeUsesLeft,
    totalFixes: user.totalFixes,
    canFix: user.freeUsesLeft > 0 || user.plan === 'pro',
    isPremium
  });
});

// Plan bilgilerini döndür
app.get('/api/plans', (req, res) => {
  res.json({
    plans: [
      { id: 'starter', name: 'Starter', price: 9, fixes: 5, description: '5 CV fixes, one-time' },
      { id: 'pro', name: 'Pro', price: 19, fixes: Infinity, description: 'Unlimited CV fixes, per month' }
    ]
  });
});
// ═══════════════════════════════════════════════════════
// ROUTES: User Status & Auth
// ═══════════════════════════════════════════════════════

// Kullanıcı oturum durumu
app.get('/api/auth/session', rateLimit, (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.json({ authenticated: false });
  }
  
  // Session'dan email bul
  // (Basit implementasyon - production'da Redis veya DB kullan)
  const userId = getUserId(req);
  const user = getUser(userId);
  
  res.json({
    authenticated: true,
    userId,
    plan: user.plan,
    freeUsesLeft: user.freeUsesLeft
  });
});

// ═══════════════════════════════════════════════════════
// ROUTES: Simple Auth (Email-based)
// ═══════════════════════════════════════════════════════

// Simple email login - frontend handles session creation
app.get('/api/auth/login', (req, res) => {
  // Redirect to login page
  res.redirect('/login.html');
});

// Auth callback - just redirect to main page
app.get('/api/auth/callback', (req, res) => {
  res.redirect('/');
});

// Session check endpoint
app.get('/api/auth/session', rateLimit, (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const userId = getUserId(req);
  const user = getUser(userId);
  
  res.json({
    authenticated: !!sessionId,
    userId,
    email: req.headers['x-user-email'] || null,
    plan: user.plan,
    freeUsesLeft: user.freeUsesLeft
  });
});

// Gerçek sayaç
app.get('/api/stats', (req, res) => {
  const dbStats = getGlobalStats();
  res.json({ totalFixes: dbStats.totalFixes });
});

// ═══════════════════════════════════════════════════════
// ROUTES: Free features (no payment needed)
// ═══════════════════════════════════════════════════════

function extractTextFromPDFBuffer(buffer) {
  const str = buffer.toString('latin1');
  let text = '';
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(str)) !== null) {
    const compressed = Buffer.from(match[1], 'latin1');
    try {
      const decompressed = zlib.inflateSync(compressed);
      const hexRegex = /<([0-9a-fA-F]+)>/g;
      let hexMatch;
      while ((hexMatch = hexRegex.exec(decompressed.toString())) !== null) {
        const hex = hexMatch[1];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          decoded += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
        text += decoded;
      }
      const textRegex = /\(([^)]+)\)/g;
      let textMatch;
      while ((textMatch = textRegex.exec(decompressed.toString())) !== null) {
        text += textMatch[1] + ' ';
      }
    } catch (e) { /* skip decompression errors */ }
  }
  return text.replace(/\s+/g, ' ').trim();
}

app.post('/api/parse-pdf', rateLimit, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });
    let text;
    try {
      const data = await pdfParse(req.file.buffer, { max: 50 });
      text = sanitizeText(data.text, 10000);
    } catch (parseErr) {
      console.warn('pdf-parse failed, using fallback extraction:', parseErr.message);
      text = sanitizeText(extractTextFromPDFBuffer(req.file.buffer), 10000);
    }
    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: 'PDF is empty or image-based. Please paste your CV text manually.' });
    }
    res.json({ text });
  } catch (error) {
    console.error('PDF parse error:', error.message);
    res.status(500).json({ error: 'Failed to read PDF. It may be encrypted or corrupted.' });
  }
});

// LinkedIn PDF parser - extracts structured data from LinkedIn profile PDFs
app.post('/api/parse-linkedin', rateLimit, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'LinkedIn PDF required' });
    
    const data = await pdfParse(req.file.buffer).catch(parseErr => {
      console.warn('pdf-parse failed for LinkedIn PDF, using fallback:', parseErr.message);
      return { text: extractTextFromPDFBuffer(req.file.buffer) };
    });
    const rawText = data.text;
    
    if (!rawText || rawText.trim().length < 50) {
      return res.status(400).json({ error: 'PDF is empty or unreadable' });
    }

    // Detect if it's a LinkedIn profile PDF
    const isLinkedIn = rawText.toLowerCase().includes('linkedin') || 
                       rawText.includes('linkedin.com') ||
                       rawText.toLowerCase().includes('experience') && rawText.toLowerCase().includes('education');

    // Extract sections from LinkedIn PDF
    const sections = {
      name: '',
      headline: '',
      summary: '',
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: []
    };

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Name is usually first line
    if (lines.length > 0) sections.name = lines[0];
    
    // Headline is usually second line
    if (lines.length > 1 && !lines[1].toLowerCase().includes('contact')) {
      sections.headline = lines[1];
    }

    // Parse sections
    let currentSection = '';
    let sectionContent = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (line === 'summary' || line === 'about') {
        currentSection = 'summary';
        sectionContent = [];
        continue;
      } else if (line === 'experience') {
        currentSection = 'experience';
        sectionContent = [];
        continue;
      } else if (line === 'education') {
        currentSection = 'education';
        sectionContent = [];
        continue;
      } else if (line === 'skills' || line === 'skills & endorsements') {
        currentSection = 'skills';
        sectionContent = [];
        continue;
      } else if (line === 'certifications' || line === 'licenses & certifications') {
        currentSection = 'certifications';
        sectionContent = [];
        continue;
      } else if (line === 'languages') {
        currentSection = 'languages';
        sectionContent = [];
        continue;
      } else if (['activity', 'recommendations', 'accomplishments', 'interests', 'contact'].includes(line)) {
        // End of relevant sections
        if (currentSection === 'summary' && sectionContent.length > 0) {
          sections.summary = sectionContent.join(' ');
        }
        currentSection = '';
        continue;
      }

      if (currentSection === 'summary') {
        sectionContent.push(lines[i]);
      } else if (currentSection === 'experience') {
        // LinkedIn PDF experience format: Title\nCompany\nDate\nLocation\nDescription
        if (lines[i] && !lines[i].match(/^(Present|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) {
          sectionContent.push(lines[i]);
        }
      } else if (currentSection === 'skills') {
        if (lines[i] && lines[i].length < 50) {
          sections.skills.push(lines[i]);
        }
      }
    }

    // Combine all text for CV format
    let cvText = '';
    if (sections.name) cvText += sections.name + '\n';
    if (sections.headline) cvText += sections.headline + '\n\n';
    if (sections.summary) cvText += 'SUMMARY\n' + sections.summary + '\n\n';
    
    if (sectionContent.length > 0) {
      cvText += 'EXPERIENCE\n' + sectionContent.join('\n') + '\n\n';
    }
    
    if (sections.skills.length > 0) {
      cvText += 'SKILLS\n' + sections.skills.join(', ') + '\n';
    }

    res.json({
      text: cvText || rawText,
      isLinkedIn,
      sections,
      rawText: rawText.slice(0, 5000)
    });

  } catch (error) {
    console.error('LinkedIn parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse LinkedIn PDF' });
  }
});

app.post('/api/scan-keywords', rateLimit, async (req, res) => {
  try {
    const { cvText, jdText } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'CV and job description required' });

    const safeCv = sanitizeText(cvText, 10000);
    const safeJd = sanitizeText(jdText, 5000);
    const atsScore = calculateATSScore(safeCv, safeJd);
    const keywordMatch = calculateKeywordMatch(safeCv, safeJd);
    const skills = extractSkills(safeCv);

    res.json({
      atsScore: atsScore.score,
      grade: atsScore.grade,
      keywordMatchScore: keywordMatch.score,
      missingKeywords: keywordMatch.criticalMissing.slice(0, 12),
      foundKeywords: keywordMatch.found.slice(0, 8),
      topIssues: atsScore.issues.slice(0, 5),
      detectedSkills: skills.slice(0, 10),
      passLikelihood: atsScore.score >= 70 ? 'High' : atsScore.score >= 50 ? 'Medium' : 'Low'
    });
  } catch (error) {
    console.error('Scan error:', error.message);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES: Job Suggestions (AI-powered)
// ═══════════════════════════════════════════════════════

const JOB_DATABASE = [
  { title: 'Frontend Developer', industry: 'Tech', keywords: ['javascript', 'react', 'css', 'html', 'vue', 'angular', 'typescript'], level: 'Mid', salary: '$60k-$100k' },
  { title: 'Backend Developer', industry: 'Tech', keywords: ['python', 'java', 'node', 'api', 'database', 'sql', 'postgresql', 'mongodb'], level: 'Mid', salary: '$70k-$120k' },
  { title: 'Full Stack Developer', industry: 'Tech', keywords: ['javascript', 'react', 'node', 'python', 'sql', 'api', 'aws', 'docker'], level: 'Mid', salary: '$75k-$130k' },
  { title: 'DevOps Engineer', industry: 'Tech', keywords: ['docker', 'kubernetes', 'aws', 'ci/cd', 'linux', 'terraform', 'jenkins', 'cloud'], level: 'Senior', salary: '$100k-$160k' },
  { title: 'Data Scientist', industry: 'Tech', keywords: ['python', 'machine learning', 'tensorflow', 'pandas', 'sql', 'statistics', 'ai', 'nlp'], level: 'Mid', salary: '$90k-$150k' },
  { title: 'Product Manager', industry: 'Tech', keywords: ['product', 'agile', 'scrum', 'roadmap', 'stakeholder', 'analytics', 'strategy'], level: 'Mid', salary: '$80k-$140k' },
  { title: 'UI/UX Designer', industry: 'Design', keywords: ['figma', 'sketch', 'adobe', 'ui', 'ux', 'prototyping', 'user research', 'wireframe'], level: 'Mid', salary: '$55k-$95k' },
  { title: 'Marketing Manager', industry: 'Marketing', keywords: ['marketing', 'seo', 'sem', 'content', 'social media', 'analytics', 'campaign', 'branding'], level: 'Mid', salary: '$50k-$90k' },
  { title: 'Sales Manager', industry: 'Sales', keywords: ['sales', 'crm', 'negotiation', 'b2b', 'leadership', 'strategy', 'revenue'], level: 'Senior', salary: '$60k-$120k' },
  { title: 'Project Manager', industry: 'Business', keywords: ['project management', 'agile', 'scrum', 'stakeholder', 'risk', 'timeline', 'budget'], level: 'Mid', salary: '$55k-$95k' },
  { title: 'Business Analyst', industry: 'Business', keywords: ['analysis', 'excel', 'sql', 'requirements', 'stakeholder', 'reporting', 'process'], level: 'Mid', salary: '$50k-$85k' },
  { title: 'Quality Assurance', industry: 'Tech', keywords: ['testing', 'selenium', 'automation', 'qa', 'jira', 'api testing', 'performance'], level: 'Mid', salary: '$45k-$80k' },
  { title: 'Mobile Developer', industry: 'Tech', keywords: ['swift', 'kotlin', 'react native', 'ios', 'android', 'flutter', 'mobile'], level: 'Mid', salary: '$70k-$120k' },
  { title: 'Cloud Engineer', industry: 'Tech', keywords: ['aws', 'azure', 'gcp', 'cloud', 'infrastructure', 'terraform', 'kubernetes'], level: 'Mid', salary: '$90k-$150k' },
  { title: 'Cybersecurity Analyst', industry: 'Tech', keywords: ['security', 'siem', 'penetration', 'firewall', 'network', 'compliance', 'incident'], level: 'Mid', salary: '$70k-$120k' },
  { title: 'Technical Writer', industry: 'Tech', keywords: ['documentation', 'technical writing', 'api docs', 'markdown', 'editing', 'clarity'], level: 'Entry', salary: '$45k-$75k' },
  { title: 'HR Manager', industry: 'HR', keywords: ['hr', 'recruiting', 'onboarding', 'compliance', 'employee relations', 'training'], level: 'Mid', salary: '$50k-$90k' },
  { title: 'Financial Analyst', industry: 'Finance', keywords: ['excel', 'financial analysis', 'modeling', 'reporting', 'accounting', 'forecasting'], level: 'Mid', salary: '$55k-$95k' },
  { title: 'Digital Marketing Specialist', industry: 'Marketing', keywords: ['digital marketing', 'seo', 'ppc', 'google ads', 'analytics', 'social media', 'content'], level: 'Entry', salary: '$40k-$70k' },
  { title: 'Scrum Master', industry: 'Tech', keywords: ['scrum', 'agile', 'kanban', 'facilitation', 'coaching', ' ceremonies', 'sprint'], level: 'Mid', salary: '$60k-$100k' },
  { title: 'Machine Learning Engineer', industry: 'Tech', keywords: ['python', 'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'ml ops', 'ai'], level: 'Senior', salary: '$120k-$200k' },
  { title: 'Solutions Architect', industry: 'Tech', keywords: ['architecture', 'aws', 'system design', 'cloud', 'microservices', 'api', 'enterprise'], level: 'Senior', salary: '$140k-$220k' },
  { title: 'Content Strategist', industry: 'Marketing', keywords: ['content', 'strategy', 'seo', 'copywriting', 'editorial', 'social media', 'blogging'], level: 'Mid', salary: '$50k-$85k' },
  { title: 'Account Manager', industry: 'Sales', keywords: ['account management', 'client relations', 'upselling', 'crm', 'communication', 'negotiation'], level: 'Mid', salary: '$50k-$90k' },
  { title: 'Database Administrator', industry: 'Tech', keywords: ['sql', 'postgresql', 'mysql', 'mongodb', 'database', 'backup', 'performance tuning'], level: 'Mid', salary: '$70k-$120k' },
];

app.post('/api/job-suggestions', rateLimit, async (req, res) => {
  try {
    const { cvText, preferredLevel, preferredIndustry } = req.body;
    
    if (!cvText) return res.status(400).json({ error: 'CV text required' });
    
    const safeCv = sanitizeText(cvText, 10000);
    const cvLower = safeCv.toLowerCase();
    
    // Extract skills from CV
    const skills = extractSkills(safeCv);
    
    // Score each job based on skill match
    const scoredJobs = JOB_DATABASE.map(job => {
      let matchScore = 0;
      const matchedSkills = [];
      const missingSkills = [];
      
      for (const skill of job.keywords) {
        if (cvLower.includes(skill.toLowerCase())) {
          matchScore += 10;
          matchedSkills.push(skill);
        }
      }
      
      // Bonus for industry match
      if (preferredIndustry && job.industry.toLowerCase() === preferredIndustry.toLowerCase()) {
        matchScore += 20;
      }
      
      // Bonus for level match
      if (preferredLevel && job.level.toLowerCase() === preferredLevel.toLowerCase()) {
        matchScore += 15;
      }
      
      // Calculate missing important skills
      for (const skill of job.keywords.slice(0, 5)) {
        if (!cvLower.includes(skill.toLowerCase())) {
          missingSkills.push(skill);
        }
      }
      
      return {
        ...job,
        matchScore,
        matchedSkills,
        missingSkills: missingSkills.slice(0, 3),
        matchPercentage: Math.min(100, Math.round((matchScore / (job.keywords.length * 10)) * 100))
      };
    });
    
    // Sort by match score and return top 8
    const suggestions = scoredJobs
      .filter(j => j.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 8);
    
    res.json({
      suggestions,
      extractedSkills: skills.slice(0, 15),
      totalJobsAnalyzed: JOB_DATABASE.length
    });
    
  } catch (error) {
    console.error('Job suggestions error:', error.message);
    res.status(500).json({ error: 'Failed to generate job suggestions' });
  }
});

// AI-powered job suggestions with Gemini
app.post('/api/job-suggestions-ai', rateLimit, async (req, res) => {
  try {
    const { cvText, preferredLevel, preferredIndustry, location } = req.body;
    
    if (!cvText) return res.status(400).json({ error: 'CV text required' });
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service configuration error' });
    
    const safeCv = sanitizeText(cvText, 5000);
    
    const prompt = `Based on this CV, suggest the best matching job positions and provide career advice.

CV:
"""
${safeCv}
"""

${preferredLevel ? `Preferred Level: ${preferredLevel}` : ''}
${preferredIndustry ? `Preferred Industry: ${preferredIndustry}` : ''}
${location ? `Location Preference: ${location}` : ''}

Analyze the skills, experience, and career trajectory. Then respond with JSON:

{
  "topJobs": [
    {
      "title": "Job Title",
      "industry": "Industry",
      "matchReason": "Why this is a good fit",
      "requiredSkills": ["skill1", "skill2", "skill3"],
      "missingSkills": ["skill to learn"],
      "salaryRange": "$X - $Y",
      "growthPotential": "High/Medium/Low",
      "difficulty": "Easy/Medium/Hard to land"
    }
  ],
  "careerAdvice": "2-3 sentence personalized career advice",
  "skillGaps": ["Skills to develop for next role"],
  "nextSteps": ["Actionable step 1", "Actionable step 2"]
}

Return ONLY valid JSON (no markdown, no explanation).`;

    const rawText = await generateWithFallback(apiKey, prompt);
    const clean = rawText.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
    const data = JSON.parse(clean);
    
    res.json(data);
    
  } catch (error) {
    console.error('AI job suggestions error:', error.message);
    res.status(500).json({ error: 'Failed to generate AI job suggestions' });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES: Paid features (require access check)
// ═══════════════════════════════════════════════════════

// Cover Letter — paid feature (TEMPORARILY FREE FOR TESTING)
app.post('/api/generate-cover-letter', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = getUser(userId);
    if (user.freeUsesLeft <= 0 && user.plan !== 'pro') {
      return res.status(402).json({ error: 'No credits remaining', code: 'NO_CREDITS', needsUpgrade: true });
    }

    const { cvText, jdText, companyName, roleName } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'CV and job description required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service configuration error' });

    const safeCv = sanitizeText(cvText, 2000);
    const safeJd = sanitizeText(jdText, 1500);
    const safeCompany = sanitizeText(companyName || 'the company', 100);
    const safeRole = sanitizeText(roleName || 'this position', 100);

    const keywordMatch = calculateKeywordMatch(safeCv, safeJd);
    const skills = extractSkills(safeCv);

    const prompt = `Generate a compelling cover letter.

CV: """${safeCv}"""
JOB DESCRIPTION: """${safeJd}"""
Company: ${safeCompany}
Role: ${safeRole}
Key Skills: ${skills.slice(0, 5).join(', ')}
Must Include Keywords: ${keywordMatch.criticalMissing.slice(0, 8).join(', ')}

RULES:
1. 3 paragraphs max (250-300 words)
2. Start with strong hook about the role
3. Paragraph 2: Match CV achievements to job requirements
4. Paragraph 3: Why this company + call to action
5. Use keywords naturally: ${keywordMatch.criticalMissing.slice(0, 5).join(', ')}
6. Quantify achievements from CV
7. Professional but conversational tone
8. No generic phrases like "I am writing to apply"

OUTPUT JSON:
{"coverLetter":"...","tone":"Professional/Enthusiastic/Technical","keywordsUsed":["kw1","kw2"],"wordCount":280,"strength":"Strong/Medium/Weak","tips":["tip1","tip2","tip3"]}`;

    const coverLetterModels = [
      { name: 'gemini-2.5-flash', config: { temperature: 1.1, topP: 0.9 } },
      { name: 'gemini-2.5-flash-lite', config: { temperature: 1.1, topP: 0.9 } },
      { name: 'gemini-2.5-pro', config: { temperature: 1.1, topP: 0.9 } }
    ];
    const rawText = await generateWithFallback(apiKey, prompt, coverLetterModels);
    const clean = rawText.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
    const jsonData = JSON.parse(clean);

    // Kredi düş
    if (user.plan !== 'pro') {
      decrementUserCredits(userId);
    }
    incrementUserFixes(userId);
    incrementGlobalFixes();

    res.json({ ...jsonData, creditsLeft: user.freeUsesLeft });
  } catch (error) {
    console.error('Cover letter error:', error.message);
    res.status(500).json({ error: 'Failed to generate cover letter' });
  }
});

// Interview Prep — paid feature
app.post('/api/generate-interview-prep', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = getUser(userId);
    if (user.freeUsesLeft <= 0 && user.plan !== 'pro') {
      return res.status(402).json({ error: 'No credits remaining', code: 'NO_CREDITS', needsUpgrade: true });
    }

    const { cvText, jdText, companyName, roleName } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'CV and job description required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service configuration error' });

    const safeCv = sanitizeText(cvText, 3000);
    const safeJd = sanitizeText(jdText, 1500);
    const safeCompany = sanitizeText(companyName || 'the company', 100);
    const safeRole = sanitizeText(roleName || 'this position', 100);

    const skills = extractSkills(safeCv);
    const keywordMatch = calculateKeywordMatch(safeCv, safeJd);

    const prompt = `Generate interview preparation based on CV and job description.

CV: """${safeCv}"""
JOB DESCRIPTION: """${safeJd}"""
Company: ${safeCompany}
Role: ${safeRole}
Key Skills: ${skills.slice(0, 8).join(', ')}

TASK: Generate 10 likely interview questions with sample answers based on the candidate's CV.

RULES:
1. Questions must be specific to this role and CV
2. Mix: 3 behavioral (STAR format), 4 technical/role-specific, 3 situational
3. Sample answers use ACTUAL achievements from CV
4. Answers follow STAR: Situation, Task, Action, Result
5. Include metrics and numbers from CV
6. Each answer 80-120 words
7. Add 1 "red flag" question they might ask

OUTPUT JSON:
{"questions":[{"question":"...","type":"Behavioral","difficulty":"Medium","sampleAnswer":"...","keyPoints":["..."],"cvReference":"..."}],"prepTips":["..."],"redFlags":["..."],"companyResearch":"..."}`;

    const interviewModels = [
      { name: 'gemini-2.5-flash', config: { temperature: 1.0, topP: 0.9 } },
      { name: 'gemini-2.5-flash-lite', config: { temperature: 1.0, topP: 0.9 } },
      { name: 'gemini-2.5-pro', config: { temperature: 1.0, topP: 0.9 } }
    ];
    const rawText = await generateWithFallback(apiKey, prompt, interviewModels);
    const clean = rawText.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
    const jsonData = JSON.parse(clean);

    // Kredi düş
    if (user.plan !== 'pro') decrementUserCredits(userId);
    incrementUserFixes(userId);
    incrementGlobalFixes();

    res.json({ ...jsonData, creditsLeft: user.freeUsesLeft });
  } catch (error) {
    console.error('Interview prep error:', error.message);
    res.status(500).json({ error: 'Failed to generate interview prep' });
  }
});

// CV Fix — paid feature (main product) (TEMPORARILY FREE FOR TESTING)
app.post('/api/fix-cv', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = getUser(userId);

    if (user.freeUsesLeft <= 0 && user.plan !== 'pro') {
      return res.status(402).json({
        error: 'No credits remaining. Upgrade required.',
        code: 'NO_CREDITS',
        needsUpgrade: true,
        plan: user.plan,
        creditsLeft: 0
      });
    }

    const { prompt } = req.body;
    if (!prompt || !validatePrompt(prompt)) {
      return res.status(400).json({ error: 'Invalid or missing prompt' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service configuration error' });

    const cvMatch = prompt.match(/CV:\s*"""([\s\S]*?)"""/);
    const jdMatch = prompt.match(/JOB DESCRIPTION:\s*"""([\s\S]*?)"""/);
    const cvText = cvMatch ? cvMatch[1].trim() : '';
    const jdText = jdMatch ? jdMatch[1].trim() : '';

    const beforeAnalysis = calculateATSScore(cvText, jdText);
    const keywordMatch = jdText ? calculateKeywordMatch(cvText, jdText) : null;
    const style = selectRandomStyle();

    // NaN safety
    const safeScore = isNaN(beforeAnalysis.score) ? 50 : beforeAnalysis.score;
    const safeGrade = beforeAnalysis.grade || 'D';

    const aiPrompt = `### STYLE: ${style.name}
Tone: ${style.tone}
Focus: ${style.focus}
Bullets: ${style.bulletStyle}
Example: "${style.example}"

### TASK: Rewrite CV
CV: """${cvText}"""
JD: """${jdText || 'None'}"""
Score: ${safeScore}/100
Missing Keywords: ${keywordMatch ? keywordMatch.criticalMissing.join(', ') : 'None'}

### RULES:
1. Google XYZ: "Accomplished [X] measured by [Y] by doing [Z]"
2. Power verbs: Spearheaded, Orchestrated, Engineered
3. Add keywords: ${keywordMatch ? keywordMatch.criticalMissing.slice(0, 8).join(', ') : 'leadership, strategic, data-driven'}
4. Quantify: Every bullet needs %, $, numbers
5. ATS format: Standard sections, bullets, no tables
6. MUST include keywordsInjected array with actual keywords you added to the CV

### JSON OUTPUT (REQUIRED FIELDS):
{"scoreBefore":${safeScore},"scoreAfter":92,"gradeBefore":"${safeGrade}","gradeAfter":"A+","improvedCV":"Full rewritten CV...","quickWins":[{"icon":"🎯","title":"Keywords","text":"Added ${keywordMatch ? keywordMatch.criticalMissing.length : 6} terms"},{"icon":"📈","title":"Impact","text":"XYZ formula applied"},{"icon":"✅","title":"ATS","text":"99% compatible"}],"rejectReasons":${JSON.stringify(beforeAnalysis.issues.slice(0, 4))},"keywordsInjected":${keywordMatch && keywordMatch.criticalMissing.length > 0 ? JSON.stringify(keywordMatch.criticalMissing.slice(0, 10)) : '["leadership","strategic","data-driven","cross-functional","optimization","collaboration"]'},"recruiterPov":"2-3 sentences"}`;

    const rawText = await generateWithFallback(apiKey, aiPrompt);
    const clean = rawText.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
    const jsonData = JSON.parse(clean);

    // Fallback doldurmalar
    if (!jsonData.rejectReasons?.length) {
      jsonData.rejectReasons = beforeAnalysis.issues.slice(0, 4) || ['ATS format could be improved', 'Keyword optimization needed', 'Add quantifiable metrics', 'Increase action verb usage'];
    }
    
    if (!jsonData.keywordsInjected?.length) {
      // Try to get keywords from keywordMatch first
      const missingKeywords = keywordMatch?.criticalMissing?.filter(k => k && k.trim()) || [];
      if (missingKeywords.length > 0) {
        jsonData.keywordsInjected = missingKeywords.slice(0, 10);
      } else {
        // Fallback to generic high-value keywords
        jsonData.keywordsInjected = ['leadership', 'cross-functional', 'data-driven', 'strategic', 'optimization', 'collaboration'];
      }
    }

    // Kredi düş
    if (user.plan !== 'pro') decrementUserCredits(userId);
    incrementUserFixes(userId);
    incrementGlobalFixes();

    // CV versiyonunu otomatik kaydet
    const cvVer = addCvVersion(userId, {
      scoreBefore: safeScore,
      scoreAfter: jsonData.scoreAfter || 92,
      style: style.name
    });
    jsonData.cvVersion = cvVer.version;

    jsonData._style = style.name;
    jsonData.creditsLeft = user.freeUsesLeft;
    res.json(jsonData);

  } catch (error) {
    console.error('Fix CV error:', error);
    res.status(500).json({ 
      error: 'Failed to fix CV',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message })
    });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES: Whop Payment Integration
// ═══════════════════════════════════════════════════════

// Checkout session oluştur
app.post('/api/create-checkout', rateLimit, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = getUserId(req);

    let price, planType;
    if (plan === 'pro') {
      price = 1900; // $19 in cents
      planType = 'pro';
    } else {
      price = 900; // $9 in cents
      planType = 'starter';
    }

    // Whop checkout URL oluştur
    const checkoutUrl = `https://whop.com/checkout/${planType === 'pro' ? 'pro' : 'starter'}?metadata[userId]=${userId}&metadata[plan]=${planType}`;

    res.json({
      sessionId: 'temp_' + Date.now(),
      checkoutUrl
    });

  } catch (error) {
    console.error('Checkout error:', error.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Whop Webhook signature verification
function verifyWhopWebhook(req) {
  const signature = req.headers['x-whop-signature'];
  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET;

  // Secret yoksa verification'ı atla (testing için)
  if (!webhookSecret || webhookSecret === 'YOUR_WHOP_WEBHOOK_SECRET_HERE') {
    console.warn('⚠️ WHOP_WEBHOOK_SECRET not configured - verification skipped');
    return;
  }

  if (!signature) {
    throw new Error('Missing x-whop-signature header');
  }

  // Parse t=timestamp,v1=signature format (Whop uses this)
  const parts = signature.split(',');
  let timestamp = '';
  let sigValue = '';

  for (const part of parts) {
    if (part.startsWith('t=')) {
      timestamp = part.slice(2);
    } else if (part.startsWith('v1=')) {
      sigValue = part.slice(3);
    }
  }

  if (!timestamp || !sigValue) {
    throw new Error('Invalid signature format');
  }

  // Get raw body
  const rawBody = req.rawBody || req.body;
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString() : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

  // Compute expected signature: HMAC(timestamp.body)
  const signedPayload = timestamp + '.' + bodyStr;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  const sigBuffer = Buffer.from(sigValue, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error('Invalid webhook signature');
  }
}

// Store raw body for webhook
app.use('/api/whop-webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  next();
});

// Webhook: Whop ödeme başarılı olduğunda çalışır
app.post('/api/whop-webhook', async (req, res) => {
  try {
    // Signature doğrulama
    verifyWhopWebhook(req);

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Ödeme başarılı — kullanıcıya erişim ver
    if (event.type === 'payment.succeeded' || event.type === 'checkout.session.completed') {
      const payment = event.data;
      const metadata = payment.metadata || {};
      const userId = metadata.userId;
      const plan = metadata.plan || 'starter';

      if (userId) {
        grantAccess(userId, plan, {
          paymentId: payment.id,
          amount: payment.final_amount || payment.amount
        });
        console.log(`Payment success: ${userId} → ${plan} ($${(payment.final_amount || 0) / 100})`);
      } else {
        console.error('Webhook: no userId in metadata', JSON.stringify(metadata));
      }
    }

    // Subscription renewed — extend access
    if (event.type === 'subscription.renewed' || event.type === 'subscription.updated') {
      const data = event.data;
      const metadata = data.metadata || {};
      const userId = metadata.userId || data.user_id;
      if (userId) {
        const user = getUser(userId);
        const expiresAt = user.expiresAt && user.expiresAt > Date.now() ? user.expiresAt + 30 * 24 * 60 * 60 * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000;
        updateUserPlan(userId, 'pro', expiresAt);
        console.log(`Subscription renewed: ${userId}`);
      }
    }

    // Abonelik iptali
    if (event.type === 'subscription.cancelled' || event.type === 'payment.failed') {
      const data = event.data;
      const metadata = data.metadata || {};
      const userId = metadata.userId;
      if (userId) {
        updateUserPlan(userId, 'free', null);
        console.log(`Subscription cancelled: ${userId}`);
      }
    }

    res.json({ received: true });

  } catch (error) {
    if (error.message.includes('signature') || error.message.includes('WHOP_WEBHOOK_SECRET')) {
      console.error('Webhook verification failed:', error.message);
      return res.status(401).json({ error: error.message });
    }
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// PDF Download — convert CV text to professional PDF
app.post('/api/download-pdf', rateLimit, async (req, res) => {
  try {
    const { text, filename } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text content required' });
    }

    const safeName = sanitizeText(filename || 'fixed-cv', 50).replace(/[^a-zA-Z0-9_-]/g, '') || 'fixed-cv';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    doc.pipe(res);

    // Header
    doc.fontSize(10).fillColor('#888888').text('Optimized with HiresFlows.com', { align: 'center' });
    doc.moveDown(0.5);

    // Main content
    doc.fontSize(11).fillColor('#333333');
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        doc.moveDown(0.3);
        continue;
      }
      // Section headers
      if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROJECTS|CERTIFICATIONS|CONTACT)/i.test(trimmed) || trimmed === trimmed.toUpperCase() && trimmed.length < 40) {
        doc.moveDown(0.5);
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text(trimmed);
        doc.fontSize(11).font('Helvetica').fillColor('#333333');
        doc.moveDown(0.3);
      } else if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        doc.text('  ' + trimmed, { indent: 10 });
      } else {
        doc.text(trimmed);
      }
    }

    doc.end();
  } catch (error) {
    console.error('PDF download error:', error.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// DEBUG endpoint - sadece development'ta, API key ile korumalı
if (process.env.NODE_ENV !== 'production') {
  const DEBUG_API_KEY = process.env.DEBUG_API_KEY || 'dev-debug-key';
  
  app.get('/api/debug/users', (req, res) => {
    const providedKey = req.headers['x-debug-key'];
    if (providedKey !== DEBUG_API_KEY) {
      return res.status(401).json({ error: 'Invalid debug key' });
    }
    const allUsers = getAllUsers();
    res.json({ count: allUsers.length, users: allUsers });
  });
}

// ═══════════════════════════════════════════════════════
// ROUTES: Job Application Tracker API
// ═══════════════════════════════════════════════════════

// POST /api/applications - Create new application
app.post('/api/applications', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { companyName, positionTitle, applicationDate, cvVersionId, jobDescription, interviewDate, interviewNotes } = req.body;

    // Validate required fields
    if (!companyName || !positionTitle || !applicationDate) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        code: 'MISSING_REQUIRED_FIELD',
        field: !companyName ? 'companyName' : !positionTitle ? 'positionTitle' : 'applicationDate'
      });
    }

    // Create application using ApplicationTracker
    const application = applicationTracker.createApplication(userId, {
      companyName: sanitizeText(companyName, 200),
      positionTitle: sanitizeText(positionTitle, 200),
      applicationDate,
      cvVersionId,
      jobDescription: jobDescription ? sanitizeText(jobDescription, 10000) : undefined,
      interviewDate,
      interviewNotes: interviewNotes ? sanitizeText(interviewNotes, 5000) : undefined
    }, sanitizeText);

    res.status(201).json(application);
  } catch (error) {
    console.error('Create application error:', error.message);
    
    // Return validation errors as 400
    if (error.message.includes('required') || 
        error.message.includes('empty') || 
        error.message.includes('must be') ||
        error.message.includes('cannot be') ||
        error.message.includes('invalid')) {
      return res.status(400).json({ 
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
    }
    
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// GET /api/applications - Get all applications with filters
app.get('/api/applications', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status, startDate, endDate, cvVersionId } = req.query;

    // Build filters object
    const filters = {};
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (cvVersionId) filters.cvVersionId = cvVersionId;

    // Get applications with filters
    const applications = applicationTracker.getAllApplications(userId, filters);

    res.status(200).json(applications);
  } catch (error) {
    console.error('Get applications error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve applications' });
  }
});

// GET /api/applications/:id - Get single application
app.get('/api/applications/:id', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const applicationId = req.params.id;

    const application = applicationTracker.getApplication(userId, applicationId);

    if (!application) {
      return res.status(404).json({ 
        error: 'Application not found',
        code: 'NOT_FOUND',
        resourceId: applicationId
      });
    }

    res.status(200).json(application);
  } catch (error) {
    console.error('Get application error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve application' });
  }
});

// PUT /api/applications/:id - Update application
app.put('/api/applications/:id', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const applicationId = req.params.id;
    const { companyName, positionTitle, status, jobDescription, interviewDate, interviewNotes, statusNotes } = req.body;

    // Build updates object with sanitized inputs
    const updates = {};
    if (companyName !== undefined) updates.companyName = sanitizeText(companyName, 200);
    if (positionTitle !== undefined) updates.positionTitle = sanitizeText(positionTitle, 200);
    if (status !== undefined) updates.status = status;
    if (jobDescription !== undefined) updates.jobDescription = sanitizeText(jobDescription, 10000);
    if (interviewDate !== undefined) updates.interviewDate = interviewDate;
    if (interviewNotes !== undefined) updates.interviewNotes = sanitizeText(interviewNotes, 5000);
    if (statusNotes !== undefined) updates.statusNotes = statusNotes;

    // Update application
    const application = applicationTracker.updateApplication(userId, applicationId, updates, sanitizeText);

    res.status(200).json(application);
  } catch (error) {
    console.error('Update application error:', error.message);
    
    // Return 404 for not found
    if (error.message === 'Application not found') {
      return res.status(404).json({ 
        error: 'Application not found',
        code: 'NOT_FOUND',
        resourceId: req.params.id
      });
    }
    
    // Return validation errors as 400
    if (error.message.includes('required') || 
        error.message.includes('empty') || 
        error.message.includes('must be') ||
        error.message.includes('cannot be') ||
        error.message.includes('invalid')) {
      return res.status(400).json({ 
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
    }
    
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// DELETE /api/applications/:id - Delete application
app.delete('/api/applications/:id', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const applicationId = req.params.id;

    const deleted = applicationTracker.deleteApplication(userId, applicationId);

    if (!deleted) {
      return res.status(404).json({ 
        error: 'Application not found',
        code: 'NOT_FOUND',
        resourceId: applicationId
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete application error:', error.message);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// GET /api/applications/stats - Get dashboard statistics
app.get('/api/applications/stats', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { startDate, endDate } = req.query;

    // Build date range filter
    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    // Get statistics from ApplicationTracker
    const stats = applicationTracker.getStatistics(userId, dateRange);

    // Get best performing CV version
    const bestPerformingCV = performanceAnalyzer.getBestPerformingVersion(userId);

    // Combine results into dashboard statistics
    const dashboardStats = {
      totalApplications: stats.totalApplications,
      byStatus: stats.byStatus,
      successRate: stats.successRate,
      bestPerformingCV: bestPerformingCV ? {
        id: bestPerformingCV.versionId,
        name: bestPerformingCV.versionName,
        successRate: bestPerformingCV.successRate
      } : null,
      rejectionCount: stats.rejectionCount,
      averageResponseTime: stats.averageResponseTime,
      trend: null // Trend calculation can be added later if needed
    };

    res.status(200).json(dashboardStats);
  } catch (error) {
    console.error('Get statistics error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

// GET /api/cv-versions - Get all CV versions
app.get('/api/cv-versions', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);

    const cvVersions = cvVersionManager.getAllVersions(userId);

    res.status(200).json(cvVersions);
  } catch (error) {
    console.error('Get CV versions error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve CV versions' });
  }
});

// POST /api/cv-versions - Create new CV version
app.post('/api/cv-versions', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description, atsScore, content, status } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ 
        error: 'Missing required field: name', 
        code: 'MISSING_REQUIRED_FIELD',
        field: 'name'
      });
    }

    // Create CV version using CVVersionManager
    const cvVersion = cvVersionManager.createVersion(userId, {
      name: sanitizeText(name, 200),
      description: description ? sanitizeText(description, 1000) : undefined,
      atsScore,
      content: content ? sanitizeText(content, 50000) : undefined,
      status
    }, sanitizeText);

    res.status(201).json(cvVersion);
  } catch (error) {
    console.error('Create CV version error:', error.message);
    
    // Return validation errors as 400
    if (error.message.includes('required') || 
        error.message.includes('empty') || 
        error.message.includes('must be') ||
        error.message.includes('cannot be') ||
        error.message.includes('invalid')) {
      return res.status(400).json({ 
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
    }
    
    res.status(500).json({ error: 'Failed to create CV version' });
  }
});

// GET /api/cv-versions/performance - Get CV performance analysis
app.get('/api/cv-versions/performance', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);

    const performanceAnalysis = performanceAnalyzer.compareVersions(userId);

    res.status(200).json(performanceAnalysis);
  } catch (error) {
    console.error('Get CV performance error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve CV performance analysis' });
  }
});

// Recruiter Heatmap Analyzer
app.post('/api/analyze-heatmap', rateLimit, async (req, res) => {
  try {
    const { cvText } = req.body;
    if (!cvText) return res.status(400).json({ error: 'CV required' });

    const safeCv = sanitizeText(cvText, 10000);
    const cv = safeCv.toLowerCase();

    const sections = {
      summary: { found: false, score: 0, strength: 'Missing', issues: [] },
      experience: { found: false, score: 0, strength: 'Missing', issues: [] },
      skills: { found: false, score: 0, strength: 'Missing', issues: [] },
      education: { found: false, score: 0, strength: 'Missing', issues: [] },
      projects: { found: false, score: 0, strength: 'Missing', issues: [] }
    };

    // Summary
    if (cv.includes('summary') || cv.includes('profile')) {
      sections.summary.found = true;
      const summaryMatch = safeCv.match(/(summary|profile)[\s\S]{0,500}/i);
      const summaryText = summaryMatch ? summaryMatch[0] : '';
      const hasMetrics = (summaryText.match(/\d+%|\$\d+/g) || []).length;
      const wordCount = summaryText.split(/\s+/).length;
      
      sections.summary.score = 40;
      if (wordCount >= 50 && wordCount <= 100) sections.summary.score += 30;
      if (hasMetrics >= 2) sections.summary.score += 30;
      if (wordCount < 50) sections.summary.issues.push('Too short');
      if (hasMetrics === 0) sections.summary.issues.push('Add metrics');
      sections.summary.strength = sections.summary.score >= 70 ? 'Strong' : sections.summary.score >= 50 ? 'Medium' : 'Weak';
    }

    // Experience
    if (cv.includes('experience')) {
      sections.experience.found = true;
      const bullets = (safeCv.match(/[•\-\*]\s/g) || []).length;
      const metrics = (safeCv.match(/\d+%|\$\d+/g) || []).length;
      const actionVerbs = ['led', 'managed', 'developed', 'increased'].filter(v => cv.includes(v)).length;
      
      sections.experience.score = 30;
      if (bullets >= 8) sections.experience.score += 25;
      if (metrics >= 6) sections.experience.score += 25;
      if (actionVerbs >= 5) sections.experience.score += 20;
      if (bullets < 5) sections.experience.issues.push('Add more bullets');
      if (metrics < 4) sections.experience.issues.push('Add metrics');
      sections.experience.strength = sections.experience.score >= 70 ? 'Strong' : sections.experience.score >= 50 ? 'Medium' : 'Weak';
    }

    // Skills
    if (cv.includes('skills')) {
      sections.skills.found = true;
      const skills = extractSkills(safeCv);
      sections.skills.score = Math.min(100, 40 + skills.length * 5);
      if (skills.length < 8) sections.skills.issues.push('Add more skills');
      sections.skills.strength = sections.skills.score >= 70 ? 'Strong' : sections.skills.score >= 50 ? 'Medium' : 'Weak';
    }

    // Education
    if (cv.includes('education')) {
      sections.education.found = true;
      const hasDegree = cv.includes('bachelor') || cv.includes('master');
      sections.education.score = hasDegree ? 85 : 60;
      if (!hasDegree) sections.education.issues.push('Add degree');
      sections.education.strength = sections.education.score >= 70 ? 'Strong' : 'Medium';
    }

    // Projects
    if (cv.includes('project')) {
      sections.projects.found = true;
      const projectCount = (safeCv.match(/project/gi) || []).length;
      sections.projects.score = Math.min(100, 40 + projectCount * 20);
      if (projectCount < 2) sections.projects.issues.push('Add 2+ projects');
      sections.projects.strength = sections.projects.score >= 70 ? 'Strong' : sections.projects.score >= 50 ? 'Medium' : 'Weak';
    }

    const avgScore = Object.values(sections).reduce((sum, s) => sum + s.score, 0) / Object.keys(sections).length;

    res.json({
      sections,
      overallScore: Math.round(avgScore),
      recruiterAttention: avgScore >= 70 ? 'High' : avgScore >= 50 ? 'Medium' : 'Low',
      topStrengths: Object.entries(sections).filter(([k, v]) => v.score >= 70).map(([k]) => k),
      topWeaknesses: Object.entries(sections).filter(([k, v]) => v.score < 50).map(([k]) => k)
    });

  } catch (error) {
    console.error('Heatmap error:', error.message);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES: Application Tracker
// ═══════════════════════════════════════════════════════

// GET applications
app.get('/api/tracker/applications', rateLimit, (req, res) => {
  const userId = getUserId(req);
  res.json({ applications: getUserApps(userId) });
});

// POST new application
app.post('/api/tracker/applications', rateLimit, (req, res) => {
  const userId = getUserId(req);
  const { company, role, url, dateApplied, status, cvVersion, cvScore, notes } = req.body;
  if (!company || !role) return res.status(400).json({ error: 'Company and role required' });
  const app = addApp(userId, { company, role, url, dateApplied, status, cvVersion, cvScore, notes });
  res.json(app);
});

// PATCH application status
app.patch('/api/tracker/applications/:id', rateLimit, (req, res) => {
  const userId = getUserId(req);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });
  const app = updateAppStatus(userId, req.params.id, status);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  res.json(app);
});

// DELETE application
app.delete('/api/tracker/applications/:id', rateLimit, (req, res) => {
  const userId = getUserId(req);
  const ok = deleteApp(userId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Application not found' });
  res.json({ success: true });
});

// GET tracker stats
app.get('/api/tracker/stats', rateLimit, (req, res) => {
  const userId = getUserId(req);
  const userApps = getUserApps(userId);
  const total = userApps.length;
  const byStatus = { applied: 0, interview: 0, offer: 0, rejected: 0, ghosted: 0 };
  userApps.forEach(a => { if (byStatus[a.status] !== undefined) byStatus[a.status]++; });

  const responses = byStatus.interview + byStatus.offer + byStatus.rejected;
  const positive = byStatus.interview + byStatus.offer;
  const responseRate = total > 0 ? Math.round((responses / total) * 100) : 0;
  const positiveRate = total > 0 ? Math.round((positive / total) * 100) : 0;

  // CV version performance
  const cvVersions = getUserCvVersions(userId);
  const versionStats = {};
  userApps.forEach(a => {
    if (!a.cvVersion) return;
    if (!versionStats[a.cvVersion]) versionStats[a.cvVersion] = { total: 0, responses: 0, score: a.cvScore };
    versionStats[a.cvVersion].total++;
    if (['interview', 'offer', 'rejected'].includes(a.status)) versionStats[a.cvVersion].responses++;
  });

  res.json({
    total,
    byStatus,
    responseRate,
    positiveRate,
    ghostedRate: total > 0 ? Math.round((byStatus.ghosted / total) * 100) : 0,
    cvVersionStats: Object.entries(versionStats).map(([v, s]) => ({
      version: v,
      total: s.total,
      responses: s.responses,
      responseRate: s.total > 0 ? Math.round((s.responses / s.total) * 100) : 0,
      score: s.score
    }))
  });
});

// GET CV versions
app.get('/api/tracker/cv-versions', rateLimit, (req, res) => {
  const userId = getUserId(req);
  res.json({ versions: getUserCvVersions(userId) });
});

// ═══════════════════════════════════════════════════════
// ROUTES: Behavioral Interview Simulation
// ═══════════════════════════════════════════════════════

// In-memory interview sessions (keyed by sessionId)
const interviewSessions = new Map();

// Start interview — generate questions from CV + JD
app.post('/api/interview/start', rateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = getUser(userId);
    if (user.freeUsesLeft <= 0 && user.plan !== 'pro') {
      return res.status(402).json({ error: 'No credits remaining', code: 'NO_CREDITS', needsUpgrade: true });
    }

    const { cvText, jdText, companyName, roleName, numQuestions } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'CV and job description required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service configuration error' });

    const safeCv = sanitizeText(cvText, 3000);
    const safeJd = sanitizeText(jdText, 1500);
    const safeCompany = sanitizeText(companyName || 'the company', 100);
    const safeRole = sanitizeText(roleName || 'this position', 100);
    const count = Math.min(parseInt(numQuestions) || 6, 10);

    const skills = extractSkills(safeCv);

    const prompt = `Generate ${count} behavioral interview questions for a candidate.

CV: """${safeCv}"""
JOB DESCRIPTION: """${safeJd}"""
Company: ${safeCompany}
Role: ${safeRole}
Key Skills: ${skills.slice(0, 8).join(', ')}

RULES:
1. Each question must test a specific competency from the JD
2. Mix: 40% leadership/teamwork, 30% problem-solving, 30% role-specific
3. Questions should probe real experiences from the CV
4. Progressive difficulty: easier first, harder last
5. Each question 15-30 words

OUTPUT JSON:
{"questions":[{"id":1,"question":"...","category":"Leadership","difficulty":"Medium","whatWeTest":"What this question evaluates","idealPoints":["...","..."]}],"intro":"Welcome message as the interviewer (2 sentences)","companyContext":"Brief company culture note"}`;

    const rawText = await generateWithFallback(apiKey, prompt);
    const clean = rawText.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
    const data = JSON.parse(clean);

    // Create session
    const sessionId = crypto.randomUUID();
    interviewSessions.set(sessionId, {
      userId,
      questions: data.questions || [],
      currentIndex: 0,
      answers: [],
      startedAt: Date.now(),
      cvText: safeCv,
      jdText: safeJd,
      companyName: safeCompany,
      roleName: safeRole
    });

    // Auto-expire after 30 minutes
    setTimeout(() => interviewSessions.delete(sessionId), 30 * 60 * 1000);

    // Don't deduct credit yet — deduct at finish
    res.json({
      sessionId,
      intro: data.intro || `Welcome! I'll be conducting your behavioral interview for the ${safeRole} role at ${safeCompany}.`,
      companyContext: data.companyContext || '',
      totalQuestions: data.questions?.length || 0,
      firstQuestion: data.questions?.[0] || null
    });

  } catch (error) {
    console.error('Interview start error:', error.message);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// Submit answer — get feedback + next question
app.post('/api/interview/answer', rateLimit, async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    if (!sessionId || !answer) return res.status(400).json({ error: 'Session ID and answer required' });

    const session = interviewSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session expired or not found' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service configuration error' });

    const currentQ = session.questions[session.currentIndex];
    if (!currentQ) return res.status(400).json({ error: 'No more questions' });

    const safeAnswer = sanitizeText(answer, 2000);

    // AI evaluation
    const prompt = `Evaluate this behavioral interview answer.

QUESTION: """${currentQ.question}"""
CATEGORY: ${currentQ.category}
WHAT WE TEST: ${currentQ.whatWeTest}
IDEAL POINTS: ${(currentQ.idealPoints || []).join(', ')}

CANDIDATE'S ANSWER: """${safeAnswer}"""

CANDIDATE'S CV: """${session.cvText.slice(0, 1500)}"""

EVALUATION CRITERIA:
1. STAR format (Situation, Task, Action, Result)
2. Specificity — real examples with details
3. Quantifiable results — numbers, percentages
4. Relevance to the role
5. Confidence and clarity

OUTPUT JSON:
{"score":<1-10>,"starCoverage":{"situation":<bool>,"task":<bool>,"action":<bool>,"result":<bool>},"strengths":["..."],"improvements":["..."],"rewrittenExample":"An improved version of their answer (if score < 8)","coaching":"1-2 sentence coaching tip for next time","encouragement":"Brief positive note"}`;

    const rawText = await generateWithFallback(apiKey, prompt);
    const clean = rawText.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
    const feedback = JSON.parse(clean);

    // Store answer
    session.answers.push({
      question: currentQ.question,
      answer: safeAnswer,
      score: feedback.score || 5,
      feedback
    });

    session.currentIndex++;

    // Next question or finish
    const nextQ = session.questions[session.currentIndex] || null;
    const isFinished = !nextQ;

    res.json({
      feedback,
      nextQuestion: nextQ,
      isFinished,
      progress: { current: session.currentIndex, total: session.questions.length }
    });

  } catch (error) {
    console.error('Interview answer error:', error.message);
    res.status(500).json({ error: 'Failed to evaluate answer' });
  }
});

// Finish interview — get summary + deduct credit
app.post('/api/interview/finish', rateLimit, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = interviewSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session expired or not found' });

    const userId = session.userId;
    const user = getUser(userId);

    // Kredi düş
    if (user.plan !== 'pro') decrementUserCredits(userId);
    incrementUserFixes(userId);
    incrementGlobalFixes();

    // Calculate summary
    const answers = session.answers;
    const avgScore = answers.length > 0 ? Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length) : 0;
    const starCounts = { situation: 0, task: 0, action: 0, result: 0 };
    answers.forEach(a => {
      if (a.feedback?.starCoverage) {
        Object.keys(starCounts).forEach(k => { if (a.feedback.starCoverage[k]) starCounts[k]++; });
      }
    });

    const allStrengths = answers.flatMap(a => a.feedback?.strengths || []);
    const allImprovements = answers.flatMap(a => a.feedback?.improvements || []);

    const apiKey = process.env.GEMINI_API_KEY;
    let finalAdvice = '';
    if (apiKey) {
      try {
        const advPrompt = `Based on this interview performance, give 3 concise tips for improvement.

Average Score: ${avgScore}/10
Questions: ${answers.length}
STAR Usage: S:${starCounts.situation} T:${starCounts.task} A:${starCounts.action} R:${starCounts.result}
Top Weaknesses: ${allImprovements.slice(0, 5).join(', ')}

Reply with a 2-3 sentence motivational summary + 3 specific action items. Plain text, no JSON.`;
        const advModels = [
          { name: 'gemini-2.0-flash', config: { temperature: 0.8 } },
          { name: 'gemini-1.5-flash', config: { temperature: 0.8 } }
        ];
        finalAdvice = await generateWithFallback(apiKey, advPrompt, advModels);
      } catch(e) { finalAdvice = 'Keep practicing STAR format and quantifying your results.'; }
    }

    // Clean up session
    interviewSessions.delete(sessionId);

    res.json({
      summary: {
        totalQuestions: answers.length,
        averageScore: avgScore,
        grade: avgScore >= 8 ? 'A' : avgScore >= 6 ? 'B' : avgScore >= 4 ? 'C' : 'D',
        starUsage: starCounts,
        starPercent: Math.round(((starCounts.situation + starCounts.task + starCounts.action + starCounts.result) / (answers.length * 4)) * 100),
        questionScores: answers.map((a, i) => ({ q: i + 1, score: a.score, category: session.questions[i]?.category })),
        topStrengths: [...new Set(allStrengths)].slice(0, 3),
        topImprovements: [...new Set(allImprovements)].slice(0, 3),
        finalAdvice,
        creditsLeft: user.freeUsesLeft
      }
    });

  } catch (error) {
    console.error('Interview finish error:', error.message);
    res.status(500).json({ error: 'Failed to finish interview' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ http://localhost:${PORT}`);
  console.log(`✓ Plans: Free(${PLANS.free.freeUses}) / Starter(${PLANS.starter.freeUses}) / Pro(∞)`);
  console.log(`✓ Security: CORS, Rate Limit, Input Validation, Access Control`);
  console.log(`✓ Whop: ${process.env.WHOP_COMPANY_ID ? 'Configured' : '⚠ Missing .env vars'}\n`);
});
