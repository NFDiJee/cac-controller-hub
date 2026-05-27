import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DB_DIR, 'cac-hub.db');

let db;

export function initDatabase() {
  mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      room TEXT DEFAULT '',
      model TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Default settings
  const defaults = {
    hub_port: '4000',
    hub_name: 'CAC Hub',
    language: 'auto',
    reconnect_interval: '10000',
    health_check_interval: '30000',
  };

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value);
  }
}

// ── Settings ──

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

// ── Nodes ──

export function getAllNodes() {
  return db.prepare('SELECT * FROM nodes ORDER BY sort_order, id').all();
}

export function getNode(id) {
  return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
}

export function addNode({ name, url, api_key, room, model }) {
  // Normalize URL (remove trailing slash)
  url = url.replace(/\/+$/, '');
  const result = db.prepare(
    'INSERT INTO nodes (name, url, api_key, room, model) VALUES (?, ?, ?, ?, ?)'
  ).run(name || '', url, api_key || '', room || '', model || '');
  return getNode(result.lastInsertRowid);
}

export function updateNode(id, data) {
  const node = getNode(id);
  if (!node) return null;

  const fields = ['name', 'url', 'api_key', 'room', 'model', 'enabled', 'sort_order'];
  for (const field of fields) {
    if (data[field] !== undefined) {
      let value = data[field];
      if (field === 'url') value = String(value).replace(/\/+$/, '');
      db.prepare(`UPDATE nodes SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`).run(value, id);
    }
  }
  return getNode(id);
}

export function deleteNode(id) {
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
}
