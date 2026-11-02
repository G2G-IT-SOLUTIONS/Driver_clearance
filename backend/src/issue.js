import { renderLetterHtml, cleanElements } from "./letters.js";
import { todayInEthiopia } from "./ethiopian.js";

// Records one downloaded letter. Call inside a transaction (client) and generate the PDF before COMMIT.
export async function issueLetter(client, { source, template, baseData, scenario, phone, plate, contractorId, driverName, paymentId = null, tokenId = null, reason = null, issuedBy = null }) {
  const serial = (await client.query("SELECT nextval('letter_serial_seq') AS n")).rows[0].n;
  const letterRef = `G2G-${todayInEthiopia().et.year}-${String(serial).padStart(6, "0")}`;
  const data = { ...baseData, letter_ref: letterRef };
  const elements = cleanElements(template.elements);
  const html = renderLetterHtml(template.body_html, elements, data);
  const { rows } = await client.query(
    `INSERT INTO downloaded_letters(letter_ref,source,payment_id,token_id,template_id,template_name,tpl_body_html,tpl_elements,scenario,phone,plate,contractor_id,driver_name,data,rendered_html,reason,issued_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id, letter_ref`,
    [letterRef, source, paymentId, tokenId, template.id, template.name, template.body_html, JSON.stringify(elements), scenario, phone, plate, contractorId, driverName, JSON.stringify(data), html, reason, issuedBy]
  );
  return { id: rows[0].id, letterRef, html };
}
