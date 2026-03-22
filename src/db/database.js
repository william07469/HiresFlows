import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sqliteDb;
let pgPool;
let usePostgres = false;

export function initDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (dbUrl) {
    initPostgres(dbUrl);
  } else {
    initSqlite();
  }
}

function initSqlite() {
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'hiresflows.db');
  
  try {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    
    sqliteDb.exec(`
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
    
    try { sqliteDb.exec('ALTER TABLE users ADD COLUMN password_hash TEXT'); } catch (e) {}
    
    sqliteDb.exec(`
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
    
    sqliteDb.exec(`
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
    
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value INTEGER DEFAULT 0
      )
    `);
    
    // Sessions tablosu - server-side session management
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    // Seed stats with 14,282 on first run
    const statsExists = sqliteDb.prepare("SELECT value FROM stats WHERE key = 'totalFixes'").get();
    if (!statsExists) {
      sqliteDb.prepare("INSERT INTO stats (key, value) VALUES ('totalFixes', 14282)").run();
    }
    
    console.log('✓ SQLite initialized at:', DB_PATH);
  } catch (error) {
    console.error('SQLite init failed:', error.message);
  }
}

async function initPostgres(connectionString) {
  try {
    pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
    
    const client = await pgPool.connect();
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        plan TEXT DEFAULT 'free',
        free_uses_left INTEGER DEFAULT 3,
        total_fixes INTEGER DEFAULT 0,
        purchased_at BIGINT,
        expires_at BIGINT,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS fixes (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        score_before INTEGER,
        score_after INTEGER,
        style TEXT,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS cv_versions (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        version INTEGER,
        score_before INTEGER,
        score_after INTEGER,
        style TEXT,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value INTEGER DEFAULT 0
      )
    `);
    
    // Sessions tablosu - server-side session management
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        expires_at BIGINT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    // Seed stats with 14,282 on first run
    await client.query(`INSERT INTO stats (key, value) VALUES ('totalFixes', 14282) ON CONFLICT (key) DO NOTHING`);
    
    client.release();
    usePostgres = true;
    console.log('✓ PostgreSQL connected (Supabase)');
  } catch (error) {
    console.error('PostgreSQL init failed:', error.message);
    console.log('Falling back to SQLite...');
    initSqlite();
  }
}

export async function query(sql, params = []) {
  if (usePostgres && pgPool) {
    const res = await pgPool.query(sql, params);
    return res.rows;
  }
  return [];
}

export function getDatabase() {
  if (usePostgres && pgPool) {
    return {
      prepare: (sql) => ({
        get: (...params) => query(sql, params).then(r => r[0]),
        run: (...params) => query(sql, params).then(() => ({ changes: 1 })),
        all: (...params) => query(sql, params)
      }),
      exec: (sql) => query(sql, [])
    };
  }
  
  if (!sqliteDb) {
    initSqlite();
  }
  return sqliteDb;
}

export function getUser(userId) {
  if (usePostgres) {
    return getUserPg(userId);
  }
  return getUserSqlite(userId);
}

async function getUserPg(userId) {
  let rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
  let user = rows[0];
  
  if (!user) {
    await query(
      'INSERT INTO users (id, plan, free_uses_left, total_fixes) VALUES ($1, $2, $3, $4)',
      [userId, 'free', 3, 0]
    );
    rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
    user = rows[0];
  }
  
  if (user.plan === 'pro' && user.expires_at && user.expires_at < Date.now()) {
    await query(
      `UPDATE users SET plan = 'free', free_uses_left = 0, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE id = $1`,
      [userId]
    );
    rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
    user = rows[0];
  }
  
  return {
    id: user.id,
    email: user.email,
    password_hash: user.password_hash,
    plan: user.plan,
    freeUsesLeft: user.free_uses_left,
    totalFixes: user.total_fixes,
    purchasedAt: user.purchased_at,
    expiresAt: user.expires_at,
    createdAt: user.created_at
  };
}

function getUserSqlite(userId) {
  const db = getDatabase();
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  
  if (!user) {
    db.prepare(`INSERT INTO users (id, plan, free_uses_left, total_fixes) VALUES (?, 'free', 3, 0)`).run(userId);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  
  if (user.plan === 'pro' && user.expires_at && user.expires_at < Date.now()) {
    db.prepare(`UPDATE users SET plan = 'free', free_uses_left = 0, updated_at = unixepoch() WHERE id = ?`).run(userId);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  
  return {
    id: user.id,
    email: user.email,
    password_hash: user.password_hash,
    plan: user.plan,
    freeUsesLeft: user.free_uses_left,
    totalFixes: user.total_fixes,
    purchasedAt: user.purchased_at,
    expiresAt: user.expires_at,
    createdAt: user.created_at
  };
}

export function getUserByEmail(email) {
  if (usePostgres) {
    return query('SELECT * FROM users WHERE email = $1', [email]).then(r => r[0]);
  }
  return getDatabase().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export async function createUser(userId, email = null, passwordHash = null) {
  if (usePostgres) {
    if (email) {
      const existing = await getUserByEmail(email);
      if (existing) {
        await query(`UPDATE users SET id = $1, password_hash = $2, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE email = $3`, [userId, passwordHash, email]);
        return getUser(userId);
      }
    }
    await query('INSERT INTO users (id, email, password_hash, plan, free_uses_left, total_fixes) VALUES ($1, $2, $3, $4, $5, $6)', [userId, email, passwordHash, 'free', 3, 0]);
    return getUser(userId);
  }
  
  const db = getDatabase();
  if (email) {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare(`UPDATE users SET id = ?, password_hash = ?, updated_at = unixepoch() WHERE email = ?`).run(userId, passwordHash, email);
      return getUserSqlite(userId);
    }
  }
  db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, plan, free_uses_left, total_fixes) VALUES (?, ?, ?, 'free', 3, 0)`).run(userId, email, passwordHash);
  return getUserSqlite(userId);
}

export async function updateUserEmail(userId, email) {
  if (usePostgres) {
    await query(`UPDATE users SET email = $1, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE id = $2`, [email, userId]);
    return;
  }
  getDatabase().prepare(`UPDATE users SET email = ?, updated_at = unixepoch() WHERE id = ?`).run(email, userId);
}

export async function updateUserPlan(userId, plan, expiresAt = null) {
  if (usePostgres) {
    await query(`UPDATE users SET plan = $1, expires_at = $2, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE id = $3`, [plan, expiresAt, userId]);
    return;
  }
  getDatabase().prepare(`UPDATE users SET plan = ?, expires_at = ?, updated_at = unixepoch() WHERE id = ?`).run(plan, expiresAt, userId);
}

export async function decrementUserCredits(userId) {
  if (usePostgres) {
    await query(`UPDATE users SET free_uses_left = GREATEST(0, free_uses_left - 1), updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE id = $1`, [userId]);
    return;
  }
  getDatabase().prepare(`UPDATE users SET free_uses_left = MAX(0, free_uses_left - 1), updated_at = unixepoch() WHERE id = ?`).run(userId);
}

export async function incrementUserFixes(userId) {
  if (usePostgres) {
    await query(`UPDATE users SET total_fixes = total_fixes + 1, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE id = $1`, [userId]);
    return;
  }
  getDatabase().prepare(`UPDATE users SET total_fixes = total_fixes + 1, updated_at = unixepoch() WHERE id = ?`).run(userId);
}

export async function addFixHistory(userId, scoreBefore, scoreAfter, style) {
  if (usePostgres) {
    await query('INSERT INTO fixes (user_id, score_before, score_after, style) VALUES ($1, $2, $3, $4)', [userId, scoreBefore, scoreAfter, style]);
    return;
  }
  getDatabase().prepare(`INSERT INTO fixes (user_id, score_before, score_after, style) VALUES (?, ?, ?, ?)`).run(userId, scoreBefore, scoreAfter, style);
}

export async function getFixHistory(userId, limit = 10) {
  if (usePostgres) {
    return query('SELECT * FROM fixes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
  }
  return getDatabase().prepare(`SELECT * FROM fixes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit);
}

export async function addCvVersion(userId, data) {
  if (usePostgres) {
    const rows = await query('SELECT MAX(version) as max_version FROM cv_versions WHERE user_id = $1', [userId]);
    const newVersion = (rows[0]?.max_version || 0) + 1;
    await query('INSERT INTO cv_versions (user_id, version, score_before, score_after, style) VALUES ($1, $2, $3, $4, $5)', [userId, newVersion, data.scoreBefore, data.scoreAfter, data.style]);
    return { version: newVersion };
  }
  
  const db = getDatabase();
  const lastVersion = db.prepare(`SELECT MAX(version) as max_version FROM cv_versions WHERE user_id = ?`).get(userId);
  const newVersion = (lastVersion?.max_version || 0) + 1;
  db.prepare(`INSERT INTO cv_versions (user_id, version, score_before, score_after, style) VALUES (?, ?, ?, ?, ?)`).run(userId, newVersion, data.scoreBefore, data.scoreAfter, data.style);
  return { version: newVersion };
}

export async function getCvVersions(userId) {
  if (usePostgres) {
    return query('SELECT * FROM cv_versions WHERE user_id = $1 ORDER BY version DESC', [userId]);
  }
  return getDatabase().prepare(`SELECT * FROM cv_versions WHERE user_id = ? ORDER BY version DESC`).all(userId);
}

export async function getStats() {
  if (usePostgres) {
    const fixes = await query('SELECT SUM(total_fixes) as count FROM users');
    const users = await query('SELECT COUNT(*) as count FROM users');
    return { totalFixes: fixes[0]?.count || 0, totalUsers: users[0]?.count || 0 };
  }
  const db = getDatabase();
  const totalFixes = db.prepare('SELECT SUM(total_fixes) as count FROM users').get();
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return { totalFixes: totalFixes?.count || 0, totalUsers: totalUsers?.count || 0 };
}

export async function incrementGlobalFixes() {
  if (usePostgres) {
    // Start from 14282 on first insert
    await query(`INSERT INTO stats (key, value) VALUES ('totalFixes', 14282) ON CONFLICT (key) DO UPDATE SET value = stats.value + 1`);
    return;
  }
  const db = getDatabase();
  const exists = db.prepare("SELECT value FROM stats WHERE key = 'totalFixes'").get();
  if (exists) {
    db.prepare("UPDATE stats SET value = value + 1 WHERE key = 'totalFixes'").run();
  } else {
    // Start from 14282 on first insert
    db.prepare("INSERT INTO stats (key, value) VALUES ('totalFixes', 14282)").run();
  }
}

export async function getGlobalStats() {
  if (usePostgres) {
    const rows = await query("SELECT value FROM stats WHERE key = 'totalFixes'");
    return { totalFixes: rows[0]?.value || 0 };
  }
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM stats WHERE key = 'totalFixes'").get();
  return { totalFixes: row?.value || 0 };
}

export async function getAllUsers(limit = 100) {
  if (usePostgres) {
    return query('SELECT * FROM users ORDER BY created_at DESC LIMIT $1', [limit]);
  }
  return getDatabase().prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ?').all(limit);
}

export async function cleanupExpiredSubscriptions() {
  if (usePostgres) {
    await query(`UPDATE users SET plan = 'free', free_uses_left = 0, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT WHERE plan = 'pro' AND expires_at < $1`, [Date.now()]);
    return;
  }
  const db = getDatabase();
  db.prepare(`UPDATE users SET plan = 'free', free_uses_left = 0, updated_at = unixepoch() WHERE plan = 'pro' AND expires_at < ?`).run(Date.now());
}

export async function closeDatabase() {
  if (pgPool) {
    await pgPool.end();
  }
  if (sqliteDb) {
    sqliteDb.close();
  }
}

// ═══════════════════════════════════════════════════════
// SESSION MANAGEMENT - Server-side session validation
// ═══════════════════════════════════════════════════════

// Session oluştur
export async function createSession(userId, sessionId, expiresAt) {
  if (usePostgres) {
    await query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, userId, expiresAt]
    );
    return;
  }
  const db = getDatabase();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
}

// Session doğrula ve kullanıcı bilgilerini döndür
export async function validateSession(sessionId) {
  if (usePostgres) {
    const rows = await query(
      'SELECT * FROM sessions WHERE id = $1 AND expires_at > $2',
      [sessionId, Date.now()]
    );
    return rows[0] || null;
  }
  const db = getDatabase();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').get(sessionId, Date.now());
  return session || null;
}

// Session sil (logout)
export async function deleteSession(sessionId) {
  if (usePostgres) {
    await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return;
  }
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// Kullanıcının tüm session'larını sil
export async function deleteAllUserSessions(userId) {
  if (usePostgres) {
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return;
  }
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Eski session'ları temizle
export async function cleanupExpiredSessions() {
  if (usePostgres) {
    await query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
    return;
  }
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
