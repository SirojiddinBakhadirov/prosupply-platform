import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const q = (text, params) => pool.query(text, params);

const MIG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/* Migratsiyalar: har bir .sql fayl bir marta, tartib böyiça bajariladi */
export async function migrate() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await q('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const files = (await fs.readdir(MIG_DIR)).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await fs.readFile(path.join(MIG_DIR, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log(`[db] migratsiya bajarildi: ${f}`);
    } catch (e) { await c.query('ROLLBACK'); throw e; }
    finally { c.release(); }
  }
}
