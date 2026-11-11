// Review workflow of a paid letter: staff edit it (limited), then send the driver an SMS link.
// Every step is written to the existing append-only activity_logs (entity_type='letter') in the SAME transaction as the change,
// so a change can never exist without its log entry.
import { pool, q } from "./db.js";
import { cfg } from "./config.js";
import { HttpError, randomHex, sha256 } from "./util.js";
import { logAct } from "./auth.js";
import { sendSms } from "./sms.js";
import { cleanBody, cleanElements, renderLetterHtml } from "./letters.js";
import { htmlToText, diffText, compactDiff, diffElements } from "./letterdiff.js";

const DAY = 864e5;
const int = (v, d) => (v !== undefined && v !== null && String(v).trim() !== "" && Number.isInteger(Number(v)) ? Number(v) : d);

// defaults for NEW letters (admin can change them in Settings, and per letter afterwards)
export async function letterDefaults(c = pool) {
  const s = Object.fromEntries((await c.query("SELECT key,value FROM settings WHERE key LIKE 'letter\\_%'")).rows.map((x) => [x.key, x.value]));
  return { max_edits: int(s.letter_max_edits, 2), edit_window_days: int(s.letter_edit_days, 2), max_sends: int(s.letter_max_sends, 2) };
}

// what may still be done with this letter, and why not
export function limitsOf(l, now = new Date()) {
  const editUntil = new Date(new Date(l.downloaded_at).getTime() + l.edit_window_days * DAY);
  const reviewable = l.source === "payment" && (l.status === "unsent" || l.status === "sent");
  let editBlock = null, sendBlock = null;
  if (!reviewable) editBlock = sendBlock = "This letter was issued before staff review existed and can no longer be changed or sent.";
  else {
    if (l.edit_count >= l.max_edits) editBlock = `This letter has used all of its ${l.max_edits} allowed edit${l.max_edits === 1 ? "" : "s"}.`;
    else if (now > editUntil) editBlock = `The editing period for this letter ended on ${editUntil.toISOString().slice(0, 10)}.`;
    if (l.send_count >= l.max_sends) sendBlock = `This letter has already been sent ${l.send_count} time${l.send_count === 1 ? "" : "s"} — the maximum allowed.`;
  }
  return {
    edit_until: editUntil.toISOString(), edits_left: Math.max(0, l.max_edits - l.edit_count), sends_left: Math.max(0, l.max_sends - l.send_count),
    can_edit: !editBlock, edit_block: editBlock, can_send: !sendBlock, send_block: sendBlock,
  };
}

const lockLetter = async (client, id) => {
  const l = (await client.query("SELECT * FROM downloaded_letters WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!l) throw new HttpError(404, "Letter not found.");
  return l;
};

// ---- staff saves an edit (only existing paid letters can be edited: there is no way to create a letter here) ----
export async function editLetter({ id, staff, ip, body_html, elements }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const l = await lockLetter(client, id), lim = limitsOf(l);
    if (!lim.can_edit) throw new HttpError(403, lim.edit_block);
    const body = cleanBody(body_html), els = cleanElements(elements), prevEls = l.elements || [];
    if (!htmlToText(body)) throw new HttpError(400, "The letter cannot be empty.");
    if (body === l.body_html && JSON.stringify(els) === JSON.stringify(prevEls)) throw new HttpError(400, "Nothing was changed, so no edit was used.");

    const { diff, summary } = diffText(htmlToText(l.body_html), htmlToText(body));
    const imageChanges = diffElements(prevEls, els), editNo = l.edit_count + 1;
    await client.query("UPDATE downloaded_letters SET body_html=$2, elements=$3, rendered_html=$4, edit_count=edit_count+1, last_edited_at=now() WHERE id=$1",
      [id, body, JSON.stringify(els), renderLetterHtml(body, els, {}, { raw: true, header: l.header_html, footer: l.footer_html, page: l.page })]);
    await logAct({ staff, ip }, "LETTER_EDIT", "letter", id,
      { letter_ref: l.letter_ref, edit_no: editNo, of: l.max_edits, edits_left: l.max_edits - editNo, ...summary, diff: compactDiff(diff), image_changes: imageChanges,
        formatting_only: !summary.added_words && !summary.removed_words && !imageChanges.length }, client);
    await client.query("COMMIT");
    return { edit_no: editNo, edits_left: l.max_edits - editNo };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// ---- staff sends the SMS link. The phone is the one the driver verified: staff cannot choose or type a number ----
export async function sendLetter({ id, staff, ip }) {
  const client = await pool.connect();
  let letterRef = null;
  try {
    await client.query("BEGIN");
    const l = await lockLetter(client, id), lim = limitsOf(l);
    letterRef = l.letter_ref;
    if (!lim.can_send) throw new HttpError(403, lim.send_block);
    const raw = randomHex(16); // 128-bit secret; only its hash is stored. A new send replaces the old link.
    await sendSms(l.phone, `G2G: your clearance letter ${l.letter_ref} is ready. Tap to download: ${cfg.publicUrl}/api/letter/${raw}`); // throws if PlaySMS refuses
    await client.query("UPDATE downloaded_letters SET status='sent', send_count=send_count+1, last_sent_at=now(), link_token_hash=$2, link_token_hint=$3 WHERE id=$1", [id, sha256(raw), raw.slice(-4)]);
    await logAct({ staff, ip }, "LETTER_SEND", "letter", id,
      { letter_ref: l.letter_ref, phone: l.phone, send_no: l.send_count + 1, of: l.max_sends, sends_left: l.max_sends - l.send_count - 1, edits_made: l.edit_count, token_hint: raw.slice(-4), earlier_link_replaced: !!l.link_token_hash }, client);
    await client.query("COMMIT");
    return { sends_left: l.max_sends - l.send_count - 1 };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (letterRef && (e.status === 502 || !e.status)) await logAct({ staff, ip }, "LETTER_SEND_FAILED", "letter", id, { letter_ref: letterRef, reason: e.message }).catch(() => {});
    throw e;
  } finally { client.release(); }
}

// ---- admin changes the limits of ONE letter ----
export async function setLimits({ id, staff, ip, max_edits, edit_window_days, max_sends }) {
  const chk = (v, lo, hi, what) => { const n = Number(v); if (v === "" || v === null || v === undefined || !Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${what} must be a whole number from ${lo} to ${hi}.`); return n; };
  const next = { max_edits: chk(max_edits, 0, 50, "Maximum edits"), edit_window_days: chk(edit_window_days, 0, 365, "Editing period (days)"), max_sends: chk(max_sends, 0, 50, "Maximum sends") };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const l = await lockLetter(client, id);
    if (l.source !== "payment" || !["unsent", "sent"].includes(l.status)) throw new HttpError(400, "Limits only apply to paid letters that staff review.");
    const from = { max_edits: l.max_edits, edit_window_days: l.edit_window_days, max_sends: l.max_sends };
    if (JSON.stringify(from) === JSON.stringify(next)) { await client.query("ROLLBACK"); return { unchanged: true }; }
    await client.query("UPDATE downloaded_letters SET max_edits=$2, edit_window_days=$3, max_sends=$4 WHERE id=$1", [id, next.max_edits, next.edit_window_days, next.max_sends]);
    await logAct({ staff, ip }, "LETTER_LIMITS", "letter", id, { letter_ref: l.letter_ref, from, to: next }, client);
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}