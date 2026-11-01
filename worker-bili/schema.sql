-- Bilibili 扫码登录 Worker 数据库结构
-- 在 D1 控制台或 `wrangler d1 execute bili-login --file=schema.sql --remote` 执行

PRAGMA foreign_keys = ON;

-- 浏览器设备（用于隔离每个用户的扫码与 key）
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- 扫码票据：必须与发起扫码的设备匹配，防止别人轮询你的 qrcode_key
CREATE TABLE IF NOT EXISTS qr_tickets (
  qr_key TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qr_device ON qr_tickets(device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_qr_expires ON qr_tickets(expires_at);

-- 登录会话：Cookie 与 key 均加密存储
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_enc TEXT NOT NULL,
  cookie_enc TEXT NOT NULL,
  info_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
