import { Router } from "express";
import crypto from "node:crypto";
import { pool, q } from "../db.js";
import { cfg } from "../config.js";
import { ah, HttpError, rateLimit, sha256, randomHex, cleanToken } from "../util.js";
import { normalizePhone, normalizePlate, findDriversByPhone, matchByPlate, driverSnapshot, getCashCollected } from "../yango.js";
import { sendSms } from "../sms.js";
import { initCheckout, verifyPayment, paymentMatches } from "../chapa.js";
import { buildData, renderLetterHtml, htmlToPdf } from "../letters.js";
import { issueLetter } from "../issue.js";
import { validEt, toApiRange } from "../ethiopian.js";

const r = Router();
const OTP_TTL = 5 * 60 * 1000, RESEND = 60 * 1000, MAX_OTP_TRIES = 5, MAX_PLATE_TRIES = 5, SESSION_TTL = 60 * 60 * 1000;

async function getSettings(c = pool) { const { rows } = await c.query("SELECT key,value FROM settings"); return Object.fromEntries(rows.map((x) => [x.key, x.value])); }
async function msg(code, c = pool) { const { rows } = await c.query("SELECT message FROM error_messages WHERE code=$1", [code]); return rows[0]?.message || code; }
async function logErr(req, code, phone, plate, details = {}) {
  const message = await msg(code);
  await q("INSERT INTO error_logs(code,message_shown,phone,plate,details,ip) VALUES($1,$2,$3,$4,$5,$6)", [code, message, phone || null, plate || null, JSON.stringify(details), req.ip]);
  return message;
}
const pricing = (s) => ({ amount: Number(s.clearance_amount), currency: s.currency || "ETB", supportPhone: s.support_phone || "" });

async function newSession({ phone, plate, status, contractorId = null, driver = null }) {
  const token = randomHex(32);
  await q("INSERT INTO driver_sessions(token_hash,phone,plate,status,contractor_id,driver,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [sha256(token), phone, plate, status, contractorId, driver ? JSON.stringify(driver) : null, new Date(Date.now() + SESSION_TTL)]);
  return token;
}
const requireSession = (...states) => ah(async (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { rows } = await q("SELECT * FROM driver_sessions WHERE token_hash=$1 AND expires_at>now()", [sha256(token)]);
  if (!rows[0]) throw new HttpError(401, "Your session has expired. Please start again.");
  if (states.length && !states.includes(rows[0].status)) throw new HttpError(403, "This step is not available.");
  req.ds = rows[0]; next();
});
async function pendingPayments(phone) {
  const { rows } = await q("SELECT merchant_reference, scenario, paid_at FROM payments WHERE phone=$1 AND status='paid' AND consumed_at IS NULL ORDER BY paid_at DESC LIMIT 5", [phone]);
  return rows;
}
function parseRange(body) {
  if (!validEt(body.etFrom) || !validEt(body.etTo)) throw new HttpError(400, "Please select valid dates.");
  const range = toApiRange(body.etFrom, body.etTo);
  if (range.days < 1) throw new HttpError(400, "'From' date must not be after 'To' date.");
  if (range.days > 366) throw new HttpError(400, "Please select a period of at most one year.");
  return range;
}
function sendPdf(res, pdf, name) {
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store", "Access-Control-Expose-Headers": "Content-Disposition" });
  res.send(pdf);
}

// ---- public config (fee + support phone) ----
r.get("/config", ah(async (req, res) => res.json(pricing(await getSettings()))));

// ---- 1. phone + plate -> OTP ----
r.post("/request-otp", rateLimit(10, 3600e3), ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const plate = String(req.body.plate || "").trim().toUpperCase();
  if (!phone) throw new HttpError(400, "Enter a valid Ethiopian mobile number, e.g. 0911 234 567.");
  if (normalizePlate(plate).length < 3) throw new HttpError(400, "Enter your vehicle plate number.");
  const { rows } = await q("SELECT last_sent FROM otp_codes WHERE phone=$1", [phone]);
  if (rows[0] && Date.now() - new Date(rows[0].last_sent).getTime() < RESEND) {
    const wait = Math.ceil((RESEND - (Date.now() - new Date(rows[0].last_sent).getTime())) / 1000);
    throw new HttpError(429, `Please wait ${wait}s before requesting a new code.`);
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const salt = randomHex(16);
  await sendSms(phone, `Your G2G verification code is ${code}. It expires in 5 minutes. Do not share it with anyone.`);
  await q(`INSERT INTO otp_codes(phone,plate,code_hash,salt,attempts,last_sent,expires_at) VALUES($1,$2,$3,$4,0,now(),$5)
           ON CONFLICT (phone) DO UPDATE SET plate=$2, code_hash=$3, salt=$4, attempts=0, last_sent=now(), expires_at=$5`,
    [phone, plate, sha256(salt + ":" + code), salt, new Date(Date.now() + OTP_TTL)]);
  res.json({ ok: true, phone, resendIn: RESEND / 1000 });
}));

// ---- 2. verify OTP, then look the phone up in the fleet ----
r.post("/verify-otp", rateLimit(30, 3600e3), ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const { rows } = await q("SELECT * FROM otp_codes WHERE phone=$1", [phone || ""]);
  const rec = rows[0];
  if (!rec || new Date(rec.expires_at) < new Date()) { await logErr(req, "OTP_EXPIRED", phone, null); throw new HttpError(400, await msg("OTP_EXPIRED")); }
  if (rec.attempts >= MAX_OTP_TRIES) { await q("DELETE FROM otp_codes WHERE phone=$1", [phone]); throw new HttpError(429, "Too many wrong attempts. Please request a new code."); }
  await q("UPDATE otp_codes SET attempts=attempts+1 WHERE phone=$1", [phone]);
  const good = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(sha256(rec.salt + ":" + code)), Buffer.from(rec.code_hash));
  if (!good) {
    const left = MAX_OTP_TRIES - rec.attempts - 1;
    await logErr(req, "OTP_WRONG", phone, rec.plate);
    throw new HttpError(400, `${await msg("OTP_WRONG")}${left > 0 ? ` (${left} attempt${left === 1 ? "" : "s"} left)` : ""}`);
  }
  await q("DELETE FROM otp_codes WHERE phone=$1", [phone]); // single use

  const s = await getSettings();
  const drivers = await findDriversByPhone(phone);
  if (!drivers.length) { // phone is not in the fleet -> paid "customer not found" letter
    const message = await logErr(req, "PHONE_NOT_FOUND", phone, rec.plate);
    const token = await newSession({ phone, plate: rec.plate, status: "no_driver" });
    return res.json({ token, state: "no_driver", message, phone, plate: rec.plate, ...pricing(s), pending: await pendingPayments(phone) });
  }
  const hit = matchByPlate(drivers, rec.plate);
  if (!hit) {
    const message = await logErr(req, "PLATE_MISMATCH", phone, rec.plate, { profiles_with_phone: drivers.length });
    const token = await newSession({ phone, plate: rec.plate, status: "plate_required" });
    return res.json({ token, state: "plate_required", message });
  }
  const driver = driverSnapshot(hit, phone);
  const token = await newSession({ phone, plate: driver.plate, status: "ready", contractorId: driver.contractor_id, driver });
  res.json({ token, state: "ready", driver, ...pricing(s), pending: await pendingPayments(phone) });
}));

// ---- 2b. wrong plate -> retry without a new OTP ----
r.post("/check-plate", rateLimit(30, 3600e3), requireSession("plate_required"), ah(async (req, res) => {
  const ds = req.ds, plate = String(req.body.plate || "").trim().toUpperCase();
  if (normalizePlate(plate).length < 3) throw new HttpError(400, "Enter your vehicle plate number.");
  if (ds.plate_attempts >= MAX_PLATE_TRIES) { await q("DELETE FROM driver_sessions WHERE token_hash=$1", [ds.token_hash]); throw new HttpError(429, "Too many attempts. Please start again."); }
  await q("UPDATE driver_sessions SET plate_attempts=plate_attempts+1 WHERE token_hash=$1", [ds.token_hash]);
  const hit = matchByPlate(await findDriversByPhone(ds.phone), plate);
  if (!hit) {
    const message = await logErr(req, "PLATE_MISMATCH", ds.phone, plate, { retry: true });
    return res.json({ state: "plate_required", message });
  }
  const driver = driverSnapshot(hit, ds.phone);
  await q("UPDATE driver_sessions SET status='ready', plate=$2, contractor_id=$3, driver=$4 WHERE token_hash=$1", [ds.token_hash, driver.plate, driver.contractor_id, JSON.stringify(driver)]);
  res.json({ state: "ready", driver, ...pricing(await getSettings()), pending: await pendingPayments(ds.phone) });
}));

// ---- 3. transactions for a period (Ethiopian dates in, converted on the server) ----
r.post("/transactions", requireSession("ready"), ah(async (req, res) => {
  const range = parseRange(req.body);
  const cash = await getCashCollected(req.ds.contractor_id, range.from, range.to);
  res.json({ ...cash, gcFrom: range.from.slice(0, 10), gcTo: range.to.slice(0, 10), ...pricing(await getSettings()) });
}));

// ---- 4. start Chapa payment ----
r.post("/pay", rateLimit(20, 3600e3), requireSession("ready", "no_driver"), ah(async (req, res) => {
  const ds = req.ds, s = await getSettings();
  const amountCents = Math.round(Number(s.clearance_amount) * 100);
  if (!(amountCents >= 100)) throw new HttpError(500, "Payment is not configured yet.");
  let scenario, snapshot;
  if (ds.status === "ready") {
    const range = parseRange(req.body);
    const cash = await getCashCollected(ds.contractor_id, range.from, range.to);
    scenario = cash.count > 0 ? "with_transactions" : "no_transactions";
    snapshot = { driver: ds.driver, range: { etFrom: range.etFrom, etTo: range.etTo, gcFrom: range.gcFrom, gcTo: range.gcTo }, cash: { total: cash.total, count: cash.count, currency: cash.currency } };
  } else { scenario = "no_driver"; snapshot = { driver: {}, plate: ds.plate }; }

  const ref = ("G2G" + Date.now().toString(36) + randomHex(3)).toUpperCase().slice(0, 20);
  const currency = s.currency || "ETB";
  const ins = await q(`INSERT INTO payments(merchant_reference,amount_cents,currency,phone,plate,contractor_id,scenario,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [ref, amountCents, currency, ds.phone, ds.plate, ds.contractor_id, scenario, JSON.stringify(snapshot)]);
  try {
    const out = await initCheckout({
      amountCents, currency, reference: ref, idempotencyKey: ins.rows[0].id,
      customer: { first_name: ds.driver?.first_name || "Driver", last_name: ds.driver?.last_name || "G2G", phone_number: ds.phone.replace("+", "") },
      callbackUrl: cfg.apiPublicUrl ? `${cfg.apiPublicUrl}/api/chapa/webhook` : undefined,
      returnUrl: `${cfg.publicUrl}/?ref=${ref}`, meta: { payment_id: ins.rows[0].id, scenario },
      title: "Clearance letter", description: "G2G clearance letter fee",
    });
    await q("UPDATE payments SET checkout_url=$2, chapa_reference=$3 WHERE id=$1", [ins.rows[0].id, out.checkoutUrl, out.chapaReference]);
    res.json({ checkoutUrl: out.checkoutUrl, reference: ref });
  } catch (e) { await q("UPDATE payments SET status='failed' WHERE id=$1", [ins.rows[0].id]); throw e; }
}));

// verify with Chapa and mark paid (used by claim + webhook)
export async function confirmPayment(p) {
  if (p.status === "paid") return true;
  const v = await verifyPayment(p.merchant_reference);
  if (!v.ok || !paymentMatches(v.data, p.amount_cents, p.currency)) return false;
  await q("UPDATE payments SET status='paid', paid_at=COALESCE(paid_at,now()), verify_payload=$2 WHERE id=$1 AND status<>'paid'", [p.id, JSON.stringify(v.data)]);
  return true;
}

// ---- 5. after payment: ONE download ----
r.post("/claim", requireSession("ready", "no_driver"), ah(async (req, res) => {
  const ref = String(req.body.reference || "");
  const { rows } = await q("SELECT * FROM payments WHERE merchant_reference=$1 AND phone=$2", [ref, req.ds.phone]);
  if (!rows[0]) throw new HttpError(404, "Payment not found.");
  if (rows[0].consumed_at) throw new HttpError(409, "This payment has already been used to download its letter.");
  if (!(await confirmPayment(rows[0]))) throw new HttpError(402, "Your payment has not been confirmed yet. If you have paid, wait a moment and try again.", { retry: true });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = (await client.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [rows[0].id])).rows[0];
    if (p.consumed_at) throw new HttpError(409, "This payment has already been used to download its letter.");
    const tpl = (await client.query("SELECT * FROM letter_templates WHERE default_for=$1", [p.scenario])).rows[0];
    if (!tpl) throw new HttpError(500, "The letter template is not configured. Please contact support.");
    const s = await getSettings(client), sn = p.snapshot;
    const baseData = buildData({ driver: sn.driver, phone: p.phone, plate: sn.plate || p.plate, range: sn.range, cash: sn.cash, payment: p, settings: s });
    const letter = await issueLetter(client, { source: "payment", template: tpl, baseData, scenario: p.scenario, phone: p.phone, plate: baseData.plate_number, contractorId: p.contractor_id, driverName: baseData.driver_name, paymentId: p.id });
    const pdf = await htmlToPdf(letter.html);
    await client.query("UPDATE payments SET consumed_at=now(), letter_id=$2 WHERE id=$1", [p.id, letter.id]);
    await client.query("COMMIT");
    sendPdf(res, pdf, letter.letterRef);
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}));

// ---- 6. staff-issued, single-use token ----
r.post("/redeem-token", rateLimit(15, 3600e3), requireSession("ready", "no_driver"), ah(async (req, res) => {
  const raw = cleanToken(req.body.token);
  if (raw.length < 12) throw new HttpError(400, await msg("TOKEN_INVALID"));
  const ds = req.ds, client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (await client.query("SELECT * FROM download_tokens WHERE token_hash=$1 FOR UPDATE", [sha256(raw)])).rows[0];
    if (!t || t.phone !== ds.phone || (t.contractor_id || null) !== (ds.contractor_id || null)) {
      await client.query("ROLLBACK"); const m = await logErr(req, "TOKEN_INVALID", ds.phone, ds.plate); throw new HttpError(404, m);
    }
    if (t.used_at) { await client.query("ROLLBACK"); const m = await logErr(req, "TOKEN_USED", ds.phone, ds.plate, { token_hint: t.token_hint }); throw new HttpError(410, m); }
    const tpl = (await client.query("SELECT * FROM letter_templates WHERE id=$1", [t.template_id])).rows[0];
    const src = (await client.query("SELECT * FROM downloaded_letters WHERE id=$1", [t.source_letter_id])).rows[0];
    const letter = await issueLetter(client, { source: "token", template: tpl, baseData: src.data, scenario: src.scenario, phone: t.phone, plate: t.plate, contractorId: t.contractor_id, driverName: t.driver_name, tokenId: t.id, reason: t.reason, issuedBy: t.created_by });
    const pdf = await htmlToPdf(letter.html);
    await client.query("UPDATE download_tokens SET used_at=now(), used_letter_id=$2 WHERE id=$1", [t.id, letter.id]);
    await client.query("COMMIT");
    sendPdf(res, pdf, letter.letterRef);
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}));

export default r;
