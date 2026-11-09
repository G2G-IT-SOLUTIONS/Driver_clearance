// The link the driver receives by SMS:  <PUBLIC_URL>/api/letter/<token>
// Tapping it downloads the PDF straight away (no page, no code to type). The current version of the letter is served.
import { Router } from "express";
import { q } from "../db.js";
import { ah, rateLimit, sha256 } from "../util.js";
import { htmlToPdf } from "../letters.js";
import { withSeal } from "../seal.js";
import { logAct } from "../auth.js";

const r = Router();
// chat apps / search engines fetch links to build a preview: they must not count as "opened" nor receive the letter
const PREVIEW_BOT = /(facebookexternalhit|whatsapp|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|embedly|vkshare|google-pagerenderer|headlesschrome|curl\/|wget\/)/i;

const page = (title, text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#f5f0ea;font-family:system-ui,sans-serif;padding:20px}
.c{max-width:420px;text-align:center;padding:34px 28px;border-radius:22px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}
h1{margin:0 0 10px;font-size:22px;background:linear-gradient(135deg,#e5401a,#f58a1f);-webkit-background-clip:text;background-clip:text;color:transparent}p{margin:0;color:rgba(245,240,234,.7);line-height:1.55}</style></head>
<body><div class="c"><h1>G2G IT Solutions</h1><p>${text}</p></div></body></html>`;
const BAD = "This link is not valid or has been replaced by a newer one. Please use the latest SMS we sent you, or contact G2G.";

r.get("/:token", rateLimit(60, 3600e3, "/link"), ah(async (req, res) => {
  const ua = String(req.headers["user-agent"] || "");
  if (req.method === "HEAD" || PREVIEW_BOT.test(ua)) return res.status(200).type("html").send(page("G2G clearance letter", "Open this link in your phone or computer browser to download your clearance letter."));
  const t = String(req.params.token || "");
  const row = /^[a-f0-9]{32}$/.test(t) ? (await q("SELECT id, letter_ref, rendered_html FROM downloaded_letters WHERE link_token_hash=$1", [sha256(t)])).rows[0] : null;
  if (!row) return res.status(404).type("html").send(page("Link not valid", BAD));
  const pdf = await htmlToPdf(withSeal(row.rendered_html));
  const n = (await q("UPDATE downloaded_letters SET open_count=open_count+1, last_opened_at=now() WHERE id=$1 RETURNING open_count", [row.id])).rows[0].open_count;
  await logAct({ staff: null, ip: req.ip }, "LETTER_OPENED", "letter", row.id, { letter_ref: row.letter_ref, open_no: n, downloaded: true, user_agent: ua.slice(0, 200) });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${row.letter_ref}.pdf"`, "Cache-Control": "no-store" });
  res.send(pdf);
}));

export default r;