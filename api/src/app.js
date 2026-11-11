import express from 'express';
import { q } from './db.js';
import { verifyPassword, makeToken, requireAuth, hashPassword } from './auth.js';
import { rateLimit } from './ratelimit.js';
import { notifyLead, STATUS } from './telegram.js';

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const SEGMENTS = ['Ofis', 'Ishlab chiqarish', 'Maktab / bogʻcha', 'Restoran / kafe', 'Boshqa', 'Офис', 'Производство', 'Школа / детсад', 'Ресторан / кафе', 'Другое'];

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', async (req, res) => {
    try { await q('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  /* ---------- Sayt formasi ---------- */
  app.post('/api/leads', rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true }); // bot tuzog'i: odam bu maydonni körmaydi
    const lead = {
      org: clean(b.org, 200), contact: clean(b.contact, 120), phone: clean(b.phone, 40),
      segment: SEGMENTS.includes(b.segment) ? b.segment : '', items: clean(b.items, 5000),
      lang: b.lang === 'ru' ? 'ru' : 'uz'
    };
    const digits = lead.phone.replace(/\D/g, '');
    if (lead.org.length < 2) return res.status(400).json({ error: 'org', message: 'Tashkilot nomini kiriting' });
    if (digits.length < 9 || digits.length > 15) return res.status(400).json({ error: 'phone', message: 'Telefon raqamini toʻgʻri kiriting' });
    if (!b.consent) return res.status(400).json({ error: 'consent', message: 'Maʼlumotlarni qayta ishlashga rozilik kerak' });
    const r = await q(`INSERT INTO leads(org, contact, phone, segment, items, lang) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [lead.org, lead.contact, lead.phone, lead.segment, lead.items, lead.lang]);
    await q('INSERT INTO lead_events(lead_id, action, detail) VALUES ($1,$2,$3)', [r.rows[0].id, 'created', 'sayt formasi']);
    notifyLead(r.rows[0]);
    res.status(201).json({ ok: true, id: r.rows[0].id });
  });

  /* ---------- Kiriş ---------- */
  app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
    const email = clean(req.body?.email, 200).toLowerCase(); const pw = String(req.body?.password || '');
    const u = (await q('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    if (!u || !verifyPassword(pw, u.pass_hash)) return res.status(401).json({ error: 'Email yoki parol notöğri' });
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `ps_session=${makeToken(u)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${7 * 24 * 3600}${secure ? '; Secure' : ''}`);
    res.json({ id: u.id, email: u.email, name: u.name, role: u.role });
  });
  app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', 'ps_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'); res.json({ ok: true }); });
  app.get('/api/auth/me', requireAuth(), (req, res) => res.json(req.user));

  /* ---------- Panel: zayavkalar ---------- */
  app.get('/api/leads', requireAuth(), async (req, res) => {
    const where = []; const p = [];
    if (STATUS[req.query.status]) { p.push(req.query.status); where.push(`status=$${p.length}`); }
    if (req.query.q) { p.push(`%${clean(req.query.q, 100)}%`); where.push(`(org ILIKE $${p.length} OR phone ILIKE $${p.length} OR contact ILIKE $${p.length})`); }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50)); const offset = Math.max(0, Number(req.query.offset) || 0);
    const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = (await q(`SELECT * FROM leads ${sqlWhere} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, p)).rows;
    const total = Number((await q(`SELECT count(*)::int AS n FROM leads ${sqlWhere}`, p)).rows[0].n);
    res.json({ rows, total });
  });
  app.get('/api/leads/stats', requireAuth(), async (req, res) => {
    const r = await q(`SELECT status, count(*)::int AS n FROM leads GROUP BY status`);
    const week = await q(`SELECT count(*)::int AS n FROM leads WHERE created_at > now() - interval '7 days'`);
    res.json({ byStatus: Object.fromEntries(r.rows.map(x => [x.status, x.n])), last7: week.rows[0].n });
  });
  app.get('/api/leads/:id', requireAuth(), async (req, res) => {
    const l = (await q('SELECT * FROM leads WHERE id=$1', [Number(req.params.id)])).rows[0];
    if (!l) return res.status(404).json({ error: 'Topilmadi' });
    const ev = (await q(`SELECT e.*, u.name AS user_name FROM lead_events e LEFT JOIN users u ON u.id=e.user_id WHERE lead_id=$1 ORDER BY e.id`, [l.id])).rows;
    res.json({ ...l, events: ev });
  });
  app.patch('/api/leads/:id', requireAuth(['owner', 'manager']), async (req, res) => {
    const id = Number(req.params.id); const b = req.body || {};
    const cur = (await q('SELECT * FROM leads WHERE id=$1', [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Topilmadi' });
    const status = STATUS[b.status] ? b.status : cur.status; const note = b.note !== undefined ? clean(b.note, 2000) : cur.note;
    const r = await q('UPDATE leads SET status=$2, note=$3, updated_at=now() WHERE id=$1 RETURNING *', [id, status, note]);
    if (status !== cur.status) await q('INSERT INTO lead_events(lead_id, user_id, action, detail) VALUES ($1,$2,$3,$4)', [id, req.user.id, 'status', STATUS[status]]);
    if (note !== cur.note) await q('INSERT INTO lead_events(lead_id, user_id, action, detail) VALUES ($1,$2,$3,$4)', [id, req.user.id, 'note', note.slice(0, 200)]);
    res.json(r.rows[0]);
  });

  /* ---------- Panel: foydalanuvçilar (faqat asoschi) ---------- */
  app.get('/api/users', requireAuth(['owner']), async (req, res) => {
    res.json((await q('SELECT id, email, name, role, created_at FROM users ORDER BY id')).rows);
  });
  app.post('/api/users', requireAuth(['owner']), async (req, res) => {
    const email = clean(req.body?.email, 200).toLowerCase(); const name = clean(req.body?.name, 120);
    const role = ['manager', 'viewer'].includes(req.body?.role) ? req.body.role : 'manager'; const pw = String(req.body?.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 12) return res.status(400).json({ error: 'Email va kamida 12 belgili parol kerak' });
    try { const r = await q('INSERT INTO users(email, name, role, pass_hash) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role', [email, name, role, hashPassword(pw)]); res.status(201).json(r.rows[0]); }
    catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Bu email band' }); throw e; }
  });
  app.delete('/api/users/:id', requireAuth(['owner']), async (req, res) => {
    const id = Number(req.params.id); if (id === req.user.id) return res.status(400).json({ error: 'Özingizni öçira olmaysiz' });
    await q("DELETE FROM users WHERE id=$1 AND role<>'owner'", [id]); res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Topilmadi' }));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server xatosi' }); });
  return app;
}
