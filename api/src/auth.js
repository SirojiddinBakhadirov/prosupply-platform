import crypto from 'node:crypto';
import { q } from './db.js';

const SECRET = process.env.SESSION_SECRET || '';
const TTL_MS = 7 * 24 * 3600 * 1000; // sessiya 7 kun

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const ref = Buffer.from(keyHex, 'hex');
  return ref.length === key.length && crypto.timingSafeEqual(ref, key);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function makeToken(user) {
  const body = b64(JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + TTL_MS }));
  return `${body}.${sign(body)}`;
}
export function readToken(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

export function cookieOf(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export function requireAuth(roles) {
  return async (req, res, next) => {
    const p = readToken(cookieOf(req, 'ps_session'));
    if (!p) return res.status(401).json({ error: 'Tizimga kiring' });
    const u = (await q('SELECT id, email, name, role FROM users WHERE id=$1', [p.uid])).rows[0];
    if (!u) return res.status(401).json({ error: 'Foydalanuvçi topilmadi' });
    if (roles && !roles.includes(u.role)) return res.status(403).json({ error: 'Ruxsat yöq' });
    req.user = u; next();
  };
}

/* Birinçi işga tuşişda admin yaratiladi */
export async function seedOwner() {
  const n = Number((await q('SELECT count(*)::int AS n FROM users')).rows[0].n);
  if (n > 0) return;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!email || pw.length < 12) { console.warn('[auth] ADMIN_EMAIL / ADMIN_PASSWORD (12+ belgi) berilmagan — admin yaratilmadi'); return; }
  await q('INSERT INTO users(email, name, role, pass_hash) VALUES ($1,$2,$3,$4)', [email, 'Asoschi', 'owner', hashPassword(pw)]);
  console.log(`[auth] admin yaratildi: ${email}`);
}
