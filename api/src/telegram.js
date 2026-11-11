import { q } from './db.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = String(process.env.TELEGRAM_CHAT_ID || '');
const API = `https://api.telegram.org/bot${TOKEN}`;
export const tgEnabled = () => !!TOKEN;

export const STATUS = { new: 'Yangi', in_work: 'Işda', kp_sent: 'KP yuborildi', won: 'Mijozga aylandi', lost: 'Rad etildi' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function call(method, body) {
  const r = await fetch(`${API}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

const buttons = (id) => ({ inline_keyboard: [[
  { text: 'Işga oldim', callback_data: `st:${id}:in_work` },
  { text: 'KP yuborildi', callback_data: `st:${id}:kp_sent` }
], [
  { text: 'Mijozga aylandi', callback_data: `st:${id}:won` },
  { text: 'Rad etildi', callback_data: `st:${id}:lost` }
]] });

export function leadText(l) {
  return `<b>Yangi zayavka #${l.id}</b>\n` +
    `Taşkilot: ${esc(l.org)}\nKontakt: ${esc(l.contact || '—')}\nTelefon: ${esc(l.phone)}\n` +
    `Faoliyat: ${esc(l.segment || '—')}\nTil: ${l.lang}\n\n<b>Tovarlar:</b>\n${esc(l.items || '—').slice(0, 3000)}\n\n` +
    `Holat: ${STATUS[l.status] || l.status}`;
}

export async function notifyLead(l) {
  if (!TOKEN || !CHAT) return;
  try { await call('sendMessage', { chat_id: CHAT, text: leadText(l), parse_mode: 'HTML', reply_markup: buttons(l.id) }); }
  catch (e) { console.error('[tg] xabar yuborilmadi:', e.message); }
}

/* Bot: long polling (webhook va oçiq port kerak emas) */
export async function startBot() {
  if (!TOKEN) { console.log('[tg] TELEGRAM_BOT_TOKEN yöq — bot öçiq'); return; }
  let offset = 0;
  console.log('[tg] bot işga tuşdi');
  for (;;) {
    try {
      const ups = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of ups) { offset = u.update_id + 1; await handle(u).catch(e => console.error('[tg]', e.message)); }
    } catch (e) { console.error('[tg] polling:', e.message); await new Promise(r => setTimeout(r, 5000)); }
  }
}

async function handle(u) {
  if (u.message) {
    const chatId = String(u.message.chat.id); const text = (u.message.text || '').trim();
    if (text.startsWith('/start')) {
      const msg = CHAT && chatId === CHAT
        ? 'ProSupply bot ulangan. Yangi zayavkalar şu yerga keladi.\n/zayavkalar — oxirgi 5 ta zayavka'
        : `Salom! Bu ProSupply ning iç boti.\nŞu çat ID si: <code>${chatId}</code>\nZayavkalar şu yerga kelişi uçun uni serverdagi .env faylida TELEGRAM_CHAT_ID ga yozing.`;
      return call('sendMessage', { chat_id: chatId, text: msg, parse_mode: 'HTML' });
    }
    if (text.startsWith('/zayavkalar')) {
      if (chatId !== CHAT) return call('sendMessage', { chat_id: chatId, text: 'Bu buyruq faqat ProSupply jamoasi uçun.' });
      const rows = (await q('SELECT id, org, phone, status, created_at FROM leads ORDER BY id DESC LIMIT 5')).rows;
      const t = rows.length ? rows.map(r => `#${r.id} · ${esc(r.org)} · ${esc(r.phone)} · ${STATUS[r.status]}`).join('\n') : 'Hali zayavka yöq.';
      return call('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML' });
    }
  }
  if (u.callback_query) {
    const cq = u.callback_query; const chatId = String(cq.message?.chat?.id || '');
    const m = /^st:(\d+):(\w+)$/.exec(cq.data || '');
    if (chatId !== CHAT || !m || !STATUS[m[2]]) return call('answerCallbackQuery', { callback_query_id: cq.id, text: 'Ruxsat yöq' });
    const who = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(' ') || cq.from.username || 'Telegram';
    const r = await q(`UPDATE leads SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`, [m[1], m[2]]);
    if (!r.rows[0]) return call('answerCallbackQuery', { callback_query_id: cq.id, text: 'Zayavka topilmadi' });
    await q('INSERT INTO lead_events(lead_id, action, detail) VALUES ($1,$2,$3)', [m[1], 'status', `${STATUS[m[2]]} (Telegram: ${who})`]);
    await call('editMessageText', { chat_id: chatId, message_id: cq.message.message_id, text: leadText(r.rows[0]) + `\n<i>${esc(who)} özgartirdi</i>`, parse_mode: 'HTML', reply_markup: buttons(r.rows[0].id) }).catch(() => {});
    return call('answerCallbackQuery', { callback_query_id: cq.id, text: `Holat: ${STATUS[m[2]]}` });
  }
}
