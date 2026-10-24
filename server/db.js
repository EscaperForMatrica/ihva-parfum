import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS orders (
      order_no     TEXT PRIMARY KEY,
      client_id    TEXT NOT NULL UNIQUE,
      created_at   TEXT NOT NULL,
      name         TEXT NOT NULL,
      phone        TEXT NOT NULL,
      city         TEXT NOT NULL,
      method       TEXT NOT NULL,
      contact      TEXT NOT NULL DEFAULT '',
      comment      TEXT NOT NULL DEFAULT '',
      items        TEXT NOT NULL,
      total        INTEGER NOT NULL,
      tg_status    TEXT NOT NULL DEFAULT 'pending',
      tg_attempts  INTEGER NOT NULL DEFAULT 0,
      tg_error     TEXT,
      tg_sent_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS orders_tg_status ON orders (tg_status);
  `);
  return db;
}
