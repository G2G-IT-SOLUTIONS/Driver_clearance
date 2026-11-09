import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool, q } from "../db.js";
import { ah, HttpError, rateLimit } from "../util.js";
import { requireStaff, signStaff, logAct } from "../auth.js";
import { VARIABLES, SAMPLE_DATA, cleanBody, cleanElements, renderLetterHtml, htmlToPdf } from "../letters.js";
import { limitsOf, editLetter, sendLetter, setLimits, letterDefaults } from "../letterflow.js";
import { withSeal } from "../seal.js";

const r = Router();
const staff = requireStaff(), adminOnly = requireStaff("admin");
const SCENARIOS = ["no_driver", "no_transactions", "with_transactions"];

// ---------- auth ----------
r.post("/auth/login", rateLimit(20, 15 * 60e3), ah(async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const { rows } = await q("SELECT * FROM users WHERE lower(username)=$1", [username]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(String(req.body.password || ""), u.password_hash))) {
    await logAct(req, "LOGIN_FAILED", "user", null, { username });
    throw new HttpError(401, "Wrong username or password.");
  }
  req.staff = u; await logAct(req, "LOGIN", "user", u.id);
  res.json({ token: signStaff(u), user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role } });
}));
r.get("/me", staff, (req, res) => res.json(req.staff));
r.get("/variables", staff, (req, res) => res.json(VARIABLES));

// ---------- templates ----------
const tplList = `SELECT t.id,t.name,t.kind,t.default_for,t.body_html,t.elements,t.updated_at,t.created_at,t.for_contractor_id,
  cu.full_name AS created_by_name, uu.full_name AS updated_by_name
  FROM letter_templates t LEFT JOIN users cu ON cu.id=t.created_by LEFT JOIN users uu ON uu.id=t.updated_by`;
r.get("/templates", staff, ah(async (req, res) => {
  const { rows } = await q(`${tplList} ORDER BY t.kind, t.updated_at DESC`);
  res.json(rows.map((t) => ({ ...t, preview_html: renderLetterHtml(t.body_html, t.elements, SAMPLE_DATA) })));
}));
r.get("/templates/:id", staff, ah(async (req, res) => {
  const { rows } = await q(`${tplList} WHERE t.id=$1`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Template not found.");
  res.json(rows[0]);
}));
function tplBody(b) {
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) throw new HttpError(400, "Give the template a name.");
  return { name, body: cleanBody(b.body_html), elements: cleanElements(b.elements) };
}
r.post("/templates", staff, ah(async (req, res) => {
  const t = tplBody(req.body);
  const { rows } = await q("INSERT INTO letter_templates(name,body_html,elements,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id", [t.name, t.body, JSON.stringify(t.elements), req.staff.id]);
  await logAct(req, "TEMPLATE_CREATE", "template", rows[0].id, { name: t.name });
  res.json({ id: rows[0].id });
}));
r.put("/templates/:id", staff, ah(async (req, res) => {
  const t = tplBody(req.body);
  const { rows } = await q("UPDATE letter_templates SET name=$2, body_html=$3, elements=$4, updated_by=$5, updated_at=now() WHERE id=$1 RETURNING default_for", [req.params.id, t.name, t.body, JSON.stringify(t.elements), req.staff.id]);
  if (!rows[0]) throw new HttpError(404, "Template not found.");
  await logAct(req, "TEMPLATE_UPDATE", "template", req.params.id, { name: t.name, default_for: rows[0].default_for });
  res.json({ ok: true });
}));
r.post("/templates/:id/default", staff, ah(async (req, res) => {
  const sc = req.body.scenario;
  if (!SCENARIOS.includes(sc)) throw new HttpError(400, "Unknown letter type.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (await client.query("SELECT id,name,kind FROM letter_templates WHERE id=$1", [req.params.id])).rows[0];
    if (!t) throw new HttpError(404, "Template not found.");
    if (t.kind !== "standard") throw new HttpError(400, "Driver-only templates cannot be a default.");
    await client.query("UPDATE letter_templates SET default_for=NULL WHERE default_for=$1", [sc]);
    await client.query("UPDATE letter_templates SET default_for=$2 WHERE id=$1", [t.id, sc]);
    await client.query("COMMIT");
    await logAct(req, "TEMPLATE_SET_DEFAULT", "template", t.id, { name: t.name, scenario: sc });
    res.json({ ok: true });
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}));
// live preview (sample data, or the real data of a downloaded letter)
r.post("/preview", staff, ah(async (req, res) => {
  let data = SAMPLE_DATA;
  if (req.body.letterId) {
    const { rows } = await q("SELECT data FROM downloaded_letters WHERE id=$1", [req.body.letterId]);
    if (rows[0]) data = rows[0].data;
  }
  res.json({ html: renderLetterHtml(cleanBody(req.body.body_html), cleanElements(req.body.elements), data) });
}));

// ---------- letters of paid orders: waiting for staff / sent ----------
// There is no endpoint that creates a letter or chooses a phone number: staff only EDIT and SEND letters of customers who paid.
// how many paid letters are waiting for staff + the newest ones (the console polls this to show the notification)
r.get("/letters/unsent", staff, ah(async (req, res) => {
  const count = (await q("SELECT count(*)::int AS n FROM downloaded_letters WHERE source='payment' AND status='unsent'")).rows[0].n;
  const latest = (await q("SELECT id,letter_ref,driver_name,plate,downloaded_at FROM downloaded_letters WHERE source='payment' AND status='unsent' ORDER BY downloaded_at DESC LIMIT 5")).rows;
  res.json({ count, latest });
}));
const pickLimits = (l) => { const m = limitsOf(l); return { edits_left: m.edits_left, sends_left: m.sends_left, edit_until: m.edit_until, can_edit: m.can_edit, can_send: m.can_send }; };
r.get("/letters", staff, ah(async (req, res) => {
  const s = String(req.query.q || "").trim(), st = ["unsent", "sent", "downloaded"].includes(req.query.status) ? req.query.status : null;
  const { rows } = await q(`
    SELECT l.id,l.letter_ref,l.source,l.status,l.scenario,l.phone,l.plate,l.driver_name,l.contractor_id,l.downloaded_at,l.reason,l.template_name,
           l.edit_count,l.max_edits,l.send_count,l.max_sends,l.edit_window_days,l.last_sent_at,l.open_count,l.last_opened_at,
           p.merchant_reference, p.amount_cents, p.currency, p.status AS pay_status, p.paid_at, u.full_name AS issued_by_name
    FROM downloaded_letters l LEFT JOIN payments p ON p.id=l.payment_id LEFT JOIN users u ON u.id=l.issued_by
    WHERE ($1::text IS NULL OR l.phone ILIKE $1 OR l.plate ILIKE $1 OR l.driver_name ILIKE $1 OR l.letter_ref ILIKE $1 OR p.merchant_reference ILIKE $1)
      AND ($2::date IS NULL OR COALESCE(p.paid_at,l.downloaded_at) >= $2::date)
      AND ($3::date IS NULL OR COALESCE(p.paid_at,l.downloaded_at) < $3::date + 1)
      AND ($4::text IS NULL OR l.status = $4)
    ORDER BY (l.status='unsent') DESC, l.downloaded_at DESC LIMIT 300`,
    [s ? `%${s}%` : null, req.query.from || null, req.query.to || null, st]);
  res.json(rows.map((l) => ({ ...l, ...pickLimits(l) })));
}));
r.get("/letters/:id", staff, ah(async (req, res) => {
  const { rows } = await q(`
    SELECT l.*, p.merchant_reference, p.chapa_reference, p.amount_cents, p.currency, p.status AS pay_status, p.paid_at, p.created_at AS pay_created, p.snapshot,
           u.full_name AS issued_by_name
    FROM downloaded_letters l LEFT JOIN payments p ON p.id=l.payment_id LEFT JOIN users u ON u.id=l.issued_by WHERE l.id=$1`, [req.params.id]);
  const l = rows[0];
  if (!l) throw new HttpError(404, "Letter not found.");
  // the history of THIS letter = its rows in the activity log (created, edits with what was added/removed, sends, opens, limit changes ...)
  const history = (await q("SELECT id,staff_name,action,details,ip,created_at FROM activity_logs WHERE entity_type='letter' AND entity_id=$1 ORDER BY id", [l.id])).rows;
  res.json({ ...l, rendered_html: l.source === "payment" ? withSeal(l.rendered_html) : l.rendered_html, tpl_body_html: undefined, link_token_hash: undefined, limits: limitsOf(l), history });
}));
// the editable text of a letter (for the editor)
r.get("/letters/:id/editable", staff, ah(async (req, res) => {
  const l = (await q("SELECT id,letter_ref,driver_name,phone,plate,source,status,body_html,elements,downloaded_at,max_edits,max_sends,edit_window_days,edit_count,send_count FROM downloaded_letters WHERE id=$1", [req.params.id])).rows[0];
  if (!l) throw new HttpError(404, "Letter not found.");
  res.json({ ...l, limits: limitsOf(l) });
}));
r.put("/letters/:id", staff, ah(async (req, res) => {
  res.json(await editLetter({ id: req.params.id, staff: req.staff, ip: req.ip, body_html: req.body.body_html, elements: req.body.elements }));
}));
r.post("/letters/:id/send", staff, ah(async (req, res) => {
  res.json(await sendLetter({ id: req.params.id, staff: req.staff, ip: req.ip })); // no phone in the request: it always goes to the driver's verified number
}));
r.put("/letters/:id/limits", adminOnly, ah(async (req, res) => {
  res.json(await setLimits({ id: req.params.id, staff: req.staff, ip: req.ip, ...req.body }));
}));
r.get("/letters/:id/pdf", staff, ah(async (req, res) => {
  const { rows } = await q("SELECT letter_ref, source, rendered_html FROM downloaded_letters WHERE id=$1", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Letter not found.");
  await logAct(req, "LETTER_DOWNLOAD_ADMIN", "letter", req.params.id, { letter_ref: rows[0].letter_ref });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${rows[0].letter_ref}.pdf"`, "Access-Control-Expose-Headers": "Content-Disposition" });
  res.send(await htmlToPdf(rows[0].source === "payment" ? withSeal(rows[0].rendered_html) : rows[0].rendered_html));
}));

// ---------- payments / logs ----------
r.get("/payments", staff, ah(async (req, res) => {
  const { rows } = await q(`SELECT p.id,p.merchant_reference,p.chapa_reference,p.amount_cents,p.currency,p.status,p.phone,p.plate,p.scenario,p.created_at,p.paid_at,p.consumed_at,
    l.letter_ref, l.id AS letter_id, l.status AS letter_status, p.snapshot->'driver'->>'name' AS driver_name FROM payments p LEFT JOIN downloaded_letters l ON l.id=p.letter_id ORDER BY p.created_at DESC LIMIT 500`);
  res.json(rows);
}));
r.get("/logs/activity", staff, ah(async (req, res) => {
  const { rows } = await q("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 500"); res.json(rows);
}));
r.get("/logs/errors", staff, ah(async (req, res) => {
  const { rows } = await q("SELECT * FROM error_logs ORDER BY id DESC LIMIT 500"); res.json(rows);
}));

// ---------- settings (admin only) ----------
r.get("/settings", adminOnly, ah(async (req, res) => {
  const s = Object.fromEntries((await q("SELECT key,value FROM settings")).rows.map((x) => [x.key, x.value]));
  const messages = (await q("SELECT code,description,message,updated_at FROM error_messages WHERE code NOT LIKE 'TOKEN\\_%' ORDER BY code")).rows;
  const d = await letterDefaults();
  res.json({ clearance_amount: s.clearance_amount, currency: s.currency, support_phone: s.support_phone, letter_max_edits: d.max_edits, letter_edit_days: d.edit_window_days, letter_max_sends: d.max_sends, messages });
}));
r.put("/settings", adminOnly, ah(async (req, res) => {
  const amount = Number(req.body.clearance_amount);
  if (!(amount >= 1) || amount > 1000000) throw new HttpError(400, "Enter a valid payment amount (at least 1).");
  const phone = String(req.body.support_phone || "").trim().slice(0, 40);
  const whole = (v, lo, hi, what) => { const n = Number(v); if (v === "" || v == null || !Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${what} must be a whole number from ${lo} to ${hi}.`); return String(n); };
  const next = {
    clearance_amount: String(amount), support_phone: phone,
    letter_max_edits: whole(req.body.letter_max_edits, 0, 50, "Maximum edits"),
    letter_edit_days: whole(req.body.letter_edit_days, 0, 365, "Editing period (days)"),
    letter_max_sends: whole(req.body.letter_max_sends, 0, 50, "Maximum sends"),
  };
  const keys = Object.keys(next);
  const old = Object.fromEntries((await q("SELECT key,value FROM settings WHERE key = ANY($1)", [keys])).rows.map((x) => [x.key, x.value]));
  for (const k of keys)
    await q("INSERT INTO settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=now()", [k, next[k], req.staff.id]);
  await logAct(req, "SETTINGS_UPDATE", "settings", null, Object.fromEntries(keys.filter((k) => old[k] !== next[k]).map((k) => [k, { from: old[k], to: next[k] }])));
  res.json({ ok: true });
}));
r.put("/messages/:code", adminOnly, ah(async (req, res) => {
  const m = String(req.body.message || "").trim().slice(0, 400);
  if (!m) throw new HttpError(400, "The message cannot be empty.");
  const old = (await q("SELECT message FROM error_messages WHERE code=$1", [req.params.code])).rows[0];
  if (!old) throw new HttpError(404, "Unknown message.");
  await q("UPDATE error_messages SET message=$2, updated_by=$3, updated_at=now() WHERE code=$1", [req.params.code, m, req.staff.id]);
  await logAct(req, "MESSAGE_UPDATE", "message", req.params.code, { from: old.message, to: m });
  res.json({ ok: true });
}));

// ---------- staff users (admin only) ----------
r.get("/users", adminOnly, ah(async (req, res) => res.json((await q("SELECT id,username,full_name,role,active,created_at FROM users ORDER BY created_at")).rows)));
r.post("/users", adminOnly, ah(async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase(), full = String(req.body.full_name || "").trim();
  const role = req.body.role === "admin" ? "admin" : "staff", pw = String(req.body.password || "");
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !full || pw.length < 8) throw new HttpError(400, "Username (3+ chars), full name and a password of at least 8 characters are required.");
  try {
    const { rows } = await q("INSERT INTO users(username,full_name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id", [username, full, await bcrypt.hash(pw, 10), role]);
    await logAct(req, "USER_CREATE", "user", rows[0].id, { username, role });
    res.json({ id: rows[0].id });
  } catch (e) { if (e.code === "23505") throw new HttpError(409, "That username is already taken."); throw e; }
}));
r.post("/users/:id/active", adminOnly, ah(async (req, res) => {
  if (req.params.id === req.staff.id) throw new HttpError(400, "You cannot disable your own account.");
  const active = !!req.body.active;
  const { rows } = await q("UPDATE users SET active=$2 WHERE id=$1 RETURNING username", [req.params.id, active]);
  if (!rows[0]) throw new HttpError(404, "User not found.");
  await logAct(req, active ? "USER_ENABLE" : "USER_DISABLE", "user", req.params.id, { username: rows[0].username });
  res.json({ ok: true });
}));

export default r;