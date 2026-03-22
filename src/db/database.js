import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Railway'de /tmp dizinini kullan (persist için)
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'hiresflows.db');

let db;

export function initDatabase() {
  try {
    // Dizini oluştur
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    
    // WAL mode - daha hızlı
    db.pragma('journal_mode = WAL');
    
    // Kullanıcılar tablosu
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        plan TEXT DEFAULT 'free',
        free_uses_left INTEGER DEFAULT 3,
        total_fixes INTEGER DEFAULT 0,
        purchased_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // Fix geçmişi tablosu
    db.exec(`
      CREATE TABLE IF NOT EXISTS fixes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        score_before INTEGER,
        score_after INTEGER,
        style TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    // CV versiyonları tablosu
    db.exec(`
      CREATE TABLE IF NOT EXISTS cv_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        version INTEGER,
        score_before INTEGER,
        score_after INTEGER,
        style TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    // Stats tablosu
    db.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value INTEGER DEFAULT 0
      )
    `);
    
    console.log('✓ Database initialized at:', DB_PATH);
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    // Fallback to in-memory if database fails
    db = null;
  }
}

export function getDatabase() {
  if (!db) {
    initDatabase();
  }
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Kullanıcı işlemleri
export function getUser(userId) {
  const database = getDatabase();
  let user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  
  if (!user) {
    // Yeni kullanıcı oluştur
    database.prepare(`
      INSERT INTO users (id, plan, free_uses_left, total_fixes)
      VALUES (?, 'free', 3, 0)
    `).run(userId);
    
    user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  
  // Subscription süresi kontrolü
  if (user.plan === 'pro' && user.expires_at && user.expires_at < Date.now()) {
    database.prepare(`
      UPDATE users SET plan = 'free', free_uses_left = 0, updated_at = unixepoch()
      WHERE id = ?
    `).run(userId);
    user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    freeUsesLeft: user.free_uses_left,
    totalFixes: user.total_fixes,
    purchasedAt: user.purchased_at,
    expiresAt: user.expires_at,
    createdAt: user.created_at
  };
}

export function getUserByEmail(email) {
  const database = getDatabase();
  return database.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function createUser(userId, email = null) {
  const database = getDatabase();
  
  // Email ile kullanıcı ara
  if (email) {
    const existing = getUserByEmail(email);
    if (existing) {
      // Güncelle
      database.prepare(`
        UPDATE users SET id = ?, updated_at = unixepoch() WHERE email = ?
      `).run(userId, email);
      return getUser(userId);
    }
  }
  
  // Yeni kullanıcı oluştur
  database.prepare(`
    INSERT OR REPLACE INTO users (id, email, plan, free_uses_left, total_fixes)
    VALUES (?, ?, 'free', 3, 0)
  `).run(userId, email);
  
  return getUser(userId);
}

export function updateUserEmail(userId, email) {
  const database = getDatabase();
  database.prepare(`
    UPDATE users SET email = ?, updated_at = unixepoch() WHERE id = ?
  `).run(email, userId);
}

export function updateUserPlan(userId, plan, expiresAt = null) {
  const database = getDatabase();
  database.prepare(`
    UPDATE users SET plan = ?, expires_at = ?, updated_at = unixepoch() WHERE id = ?
  `).run(plan, expiresAt, userId);
}

export function decrementUserCredits(userId) {
  const database = getDatabase();
  database.prepare(`
    UPDATE users SET free_uses_left = MAX(0, free_uses_left - 1), updated_at = unixepoch()
    WHERE id = ?
  `).run(userId);
}

export function incrementUserFixes(userId) {
  const database = getDatabase();
  database.prepare(`
    UPDATE users SET total_fixes = total_fixes + 1, updated_at = unixepoch()
    WHERE id = ?
  `).run(userId);
}

// Fix geçmişi
export function addFixHistory(userId, scoreBefore, scoreAfter, style) {
  const database = getDatabase();
  database.prepare(`
    INSERT INTO fixes (user_id, score_before, score_after, style)
    VALUES (?, ?, ?, ?)
  `).run(userId, scoreBefore, scoreAfter, style);
}

export function getFixHistory(userId, limit = 10) {
  const database = getDatabase();
  return database.prepare(`
    SELECT * FROM fixes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

// CV versiyonları
export function addCvVersion(userId, data) {
  const database = getDatabase();
  
  // Mevcut versiyon numarasını al
  const lastVersion = database.prepare(`
    SELECT MAX(version) as max_version FROM cv_versions WHERE user_id = ?
  `).get(userId);
  
  const newVersion = (lastVersion?.max_version || 0) + 1;
  
  database.prepare(`
    INSERT INTO cv_versions (user_id, version, score_before, score_after, style)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, newVersion, data.scoreBefore, data.scoreAfter, data.style);
  
  return { version: newVersion };
}

export function getCvVersions(userId) {
  const database = getDatabase();
  return database.prepare(`
    SELECT * FROM cv_versions WHERE user_id = ? ORDER BY version DESC
  `).all(userId);
}

// İstatistikler
export function getStats() {
  const database = getDatabase();
  const totalFixes = database.prepare('SELECT SUM(total_fixes) as count FROM users').get();
  const totalUsers = database.prepare('SELECT COUNT(*) as count FROM users').get();
  
  return {
    totalFixes: totalFixes?.count || 0,
    totalUsers: totalUsers?.count || 0
  };
}

export function incrementGlobalFixes() {
  // Stats tablosu yoksa oluştur
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value INTEGER DEFAULT 0
    )
  `);
  
  const exists = database.prepare('SELECT value FROM stats WHERE key = ?').get('totalFixes');
  if (exists) {
    database.prepare('UPDATE stats SET value = value + 1 WHERE key = ?').run('totalFixes');
  } else {
    database.prepare('INSERT INTO stats (key, value) VALUES (?, 1)').run('totalFixes');
  }
}

export function getGlobalStats() {
  const database = getDatabase();
  const row = database.prepare('SELECT value FROM stats WHERE key = ?').get('totalFixes');
  return { totalFixes: row?.value || 0 };
}

// Tüm kullanıcıları listele (admin için)
export function getAllUsers(limit = 100) {
  const database = getDatabase();
  return database.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ?').all(limit);
}

// Abonelik süresi dolmuş kullanıcıları temizle
export function cleanupExpiredSubscriptions() {
  const database = getDatabase();
  const now = Date.now();
  
  database.prepare(`
    UPDATE users SET plan = 'free', free_uses_left = 0, updated_at = unixepoch()
    WHERE plan = 'pro' AND expires_at < ?
  `).run(now);
}
// Trigger redeploy
