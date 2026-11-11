import { renderLetterHtml, fillPlaceholders, cleanBody, cleanElements, cleanPage } from "./letters.js";
import { todayInEthiopia } from "./ethiopian.js";
import { logAct } from "./auth.js";

// Creates the letter of a PAID order. Call inside a transaction (client).
// It does not go to the driver: it waits in "Unsent letters" (status 'unsent') until staff check it and send the SMS link.
// `limits` = {max_edits, max_sends, edit_window_days} for this letter (copied from the Settings defaults; admin can change them per letter).
export async function issueLetter(client, { template, baseData, scenario, phone, plate, contractorId, driverName, paymentId, limits }) {
  const serial = (await client.query("SELECT nextval('letter_serial_seq') AS n")).rows[0].n;
  const letterRef = `G2G-${todayInEthiopia().et.year}-${String(serial).padStart(6, "0")}`;
  const data = { ...baseData, letter_ref: letterRef };
  const elements = cleanElements(template.elements);
  const body = cleanBody(fillPlaceholders(template.body_html, data)); // final text: staff edit this, not the {{placeholders}}
  const header = cleanBody(fillPlaceholders(template.header_html || "", data)), footer = cleanBody(fillPlaceholders(template.footer_html || "", data)), page = cleanPage(template.page);
  const html = renderLetterHtml(body, elements, data, { raw: true, header, footer, page });
  const { rows } = await client.query(
    `INSERT INTO downloaded_letters(letter_ref,source,payment_id,template_id,template_name,tpl_body_html,tpl_elements,scenario,phone,plate,contractor_id,driver_name,data,rendered_html,
                                    status,body_html,elements,max_edits,max_sends,edit_window_days,header_html,footer_html,page)
     VALUES($1,'payment',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'unsent',$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [letterRef, paymentId, template.id, template.name, template.body_html, JSON.stringify(elements), scenario, phone, plate, contractorId, driverName, JSON.stringify(data), html,
      body, JSON.stringify(elements), limits.max_edits, limits.max_sends, limits.edit_window_days, header, footer, JSON.stringify(page)]);
  await logAct({ staff: null, ip: null }, "LETTER_CREATED", "letter", rows[0].id, { letter_ref: letterRef, scenario, phone, plate, payment_id: paymentId, limits }, client);
  return { id: rows[0].id, letterRef };
}