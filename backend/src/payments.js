// Everything that happens to a payment after the driver paid: verify with Chapa, then create the letter for staff.
import { pool, q } from "./db.js";
import { HttpError } from "./util.js";
import { verifyPayment, paymentMatches } from "./chapa.js";
import { buildData } from "./letters.js";
import { issueLetter } from "./issue.js";
import { letterDefaults } from "./letterflow.js";

export const getSettings = async (c = pool) => Object.fromEntries((await c.query("SELECT key,value FROM settings")).rows.map((x) => [x.key, x.value]));

// verify with Chapa (GET /transaction/verify/<tx_ref>) and mark paid
export async function confirmPayment(p, { quiet = false } = {}) {
  if (p.status === "paid") return true;
  const v = await verifyPayment(p.merchant_reference, { quiet });
  if (!v.ok || !paymentMatches(v.data, p.merchant_reference, p.amount_cents, p.currency)) return false;
  await q("UPDATE payments SET status='paid', paid_at=COALESCE(paid_at,now()), chapa_reference=$3, verify_payload=$2 WHERE id=$1 AND status<>'paid'",
    [p.id, JSON.stringify(v.data), v.data?.data?.reference || null]);
  return true;
}

// Paid -> create the letter ONCE (it then waits in "Unsent letters" for staff). Safe to call many times / at the same time:
// the driver's return page, Chapa's callback and the background check may all arrive together.
// returns null while the payment is not confirmed, else { letterId, letterRef, created }
export async function fulfilPayment(p, { quiet = false } = {}) {
  if (!(await confirmPayment(p, { quiet }))) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [p.id])).rows[0];
    if (row.letter_id) {
      const l = (await client.query("SELECT letter_ref FROM downloaded_letters WHERE id=$1", [row.letter_id])).rows[0];
      await client.query("COMMIT");
      return { letterId: row.letter_id, letterRef: l?.letter_ref, created: false };
    }
    const tpl = (await client.query("SELECT * FROM letter_templates WHERE default_for=$1", [row.scenario])).rows[0];
    if (!tpl) throw new HttpError(500, "The letter template is not configured. Please contact support.");
    const s = await getSettings(client), sn = row.snapshot;
    const baseData = buildData({ driver: sn.driver, phone: row.phone, plate: sn.plate || row.plate, range: sn.range, cash: sn.cash, payment: row, settings: s });
    const letter = await issueLetter(client, {
      template: tpl, baseData, scenario: row.scenario, phone: row.phone, plate: baseData.plate_number,
      contractorId: row.contractor_id, driverName: baseData.driver_name, paymentId: row.id, limits: await letterDefaults(client),
    });
    await client.query("UPDATE payments SET consumed_at=now(), letter_id=$2 WHERE id=$1", [row.id, letter.id]);
    await client.query("COMMIT");
    return { letterId: letter.id, letterRef: letter.letterRef, created: true };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}