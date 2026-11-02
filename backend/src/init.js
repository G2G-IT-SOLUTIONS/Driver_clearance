// npm run db:init  - creates tables, default settings/messages/templates and the first admin
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { pool, q } from "./db.js";
import { cfg } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
await q(fs.readFileSync(path.join(here, "../db/schema.sql"), "utf8"));

for (const [k, v] of [["clearance_amount", "100"], ["currency", "ETB"], ["support_phone", "+251 900 000 000"]])
  await q("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING", [k, v]);

const MSGS = [
  ["PHONE_NOT_FOUND", "Phone number not found in the fleet", "We could not find this phone number in our records. You can continue with the payment to receive your letter."],
  ["PLATE_MISMATCH", "Plate number does not match any driver with this phone", "Provide correct license plate number."],
  ["OTP_WRONG", "Wrong OTP code", "Incorrect code."],
  ["OTP_EXPIRED", "OTP expired or not requested", "This code has expired. Please request a new one."],
  ["TOKEN_INVALID", "Token not found / not for this driver", "Invalid token. Please check it and try again."],
  ["TOKEN_USED", "Token already used", "This token has expired. A token can only be used for one download."],
];
for (const [c, d, m] of MSGS) await q("INSERT INTO error_messages(code,description,message) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [c, d, m]);

const admin = await q("SELECT 1 FROM users LIMIT 1");
if (!admin.rowCount) {
  await q("INSERT INTO users(username,full_name,password_hash,role) VALUES($1,$2,$3,'admin')", [cfg.admin.username.toLowerCase(), cfg.admin.name, await bcrypt.hash(cfg.admin.password, 10)]);
  console.log(`Created admin user "${cfg.admin.username}" - change the password after the first login.`);
}

const head = `<p style="text-align:center"><strong style="font-size:22px">G2G</strong></p><p style="text-align:center"><strong>CLEARANCE LETTER</strong></p><p style="text-align:right">Ref: {{letter_ref}}<br>Date: {{letter_date_et}} ({{letter_date_gc}})</p><p>To whom it may concern,</p>`;
const foot = `<p>For any support please contact G2G on {{support_phone}}.</p><p><br></p><p>Sincerely,<br><strong>G2G</strong></p>`;
const OLD_ND = `${head}<p>This is to confirm that no driver record was found in our fleet registry for the phone number <strong>{{driver_phone}}</strong> and plate number <strong>{{plate_number}}</strong> as of {{letter_date_gc}}.</p><p>Clearance fee of {{payment_amount}} was received on {{payment_date}} (payment ref. {{payment_reference}}).</p>${foot}`;
const TPL = {
  with_transactions: ["Default - with transactions", `${head}<p>This is to confirm that <strong>{{driver_name}}</strong> (phone {{driver_phone}}, driver license {{license_number}}), operating the vehicle {{vehicle_brand}} {{vehicle_model}} {{vehicle_year}} with plate number <strong>{{plate_number}}</strong>, collected a total of <strong>{{total_cash_collected}} {{currency}}</strong> in cash across {{transaction_count}} transaction(s) between {{date_from_et}} ({{date_from_gc}}) and {{date_to_et}} ({{date_to_gc}}).</p><p>Clearance fee of {{payment_amount}} was received on {{payment_date}} (payment ref. {{payment_reference}}).</p>${foot}`],
  no_transactions: ["Default - no transactions", `${head}<p>This is to confirm that <strong>{{driver_name}}</strong> (phone {{driver_phone}}, driver license {{license_number}}), operating the vehicle {{vehicle_brand}} {{vehicle_model}} with plate number <strong>{{plate_number}}</strong>, has <strong>no cash collected transactions</strong> between {{date_from_et}} ({{date_from_gc}}) and {{date_to_et}} ({{date_to_gc}}).</p><p>Clearance fee of {{payment_amount}} was received on {{payment_date}} (payment ref. {{payment_reference}}).</p>${foot}`],
  no_driver: ["Default - customer not found", `${head}<p>This is to confirm that no driver record was found in our fleet registry for <strong>{{driver_name}}</strong> (phone {{driver_phone}}) with plate number <strong>{{plate_number}}</strong> for the period between {{date_from_et}} ({{date_from_gc}}) and {{date_to_et}} ({{date_to_gc}}), as of {{letter_date_gc}}.</p><p>Clearance fee of {{payment_amount}} was received on {{payment_date}} (payment ref. {{payment_reference}}).</p>${foot}`],
};
for (const [sc, [name, html]] of Object.entries(TPL)) {
  const has = await q("SELECT 1 FROM letter_templates WHERE default_for=$1", [sc]);
  if (!has.rowCount) await q("INSERT INTO letter_templates(name,default_for,body_html) VALUES($1,$2,$3)", [name, sc, html]);
}
// the "customer not found" letter now carries the typed name and the period: upgrade the old default text if nobody edited it
await q("UPDATE letter_templates SET body_html=$1 WHERE default_for='no_driver' AND body_html=$2", [TPL.no_driver[1], OLD_ND]);
console.log("Database ready.");
await pool.end();