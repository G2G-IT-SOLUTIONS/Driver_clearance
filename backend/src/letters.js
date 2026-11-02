import fs from "node:fs";
import sanitizeHtml from "sanitize-html";
import { cfg } from "./config.js";
import { fmtEt, fmtGc, todayInEthiopia } from "./ethiopian.js";

// Placeholders available in the editor. Same keys for every letter type.
export const VARIABLES = [
  { group: "Driver", key: "driver_name", label: "Driver full name", sample: "Abebe Kebede Tadesse" },
  { group: "Driver", key: "driver_first_name", label: "First name", sample: "Abebe" },
  { group: "Driver", key: "driver_last_name", label: "Last name", sample: "Tadesse" },
  { group: "Driver", key: "driver_phone", label: "Phone", sample: "+251911234567" },
  { group: "Driver", key: "license_number", label: "Driver license no.", sample: "AA0012345" },
  { group: "Driver", key: "contractor_id", label: "Contractor ID", sample: "9b17db0cb1f24a38a5c3c8b4f6e4f63b" },
  { group: "Vehicle", key: "plate_number", label: "Plate number", sample: "A12345" },
  { group: "Vehicle", key: "vehicle_brand", label: "Vehicle brand", sample: "Toyota" },
  { group: "Vehicle", key: "vehicle_model", label: "Vehicle model", sample: "Vitz" },
  { group: "Vehicle", key: "vehicle_year", label: "Vehicle year", sample: "2018" },
  { group: "Vehicle", key: "vehicle_color", label: "Vehicle color", sample: "White" },
  { group: "Vehicle", key: "vehicle_vin", label: "Vehicle VIN", sample: "JTDKW923X05123456" },
  { group: "Period", key: "date_from_et", label: "From (Ethiopian)", sample: "Meskerem 1, 2019" },
  { group: "Period", key: "date_to_et", label: "To (Ethiopian)", sample: "Meskerem 30, 2019" },
  { group: "Period", key: "date_from_gc", label: "From (Gregorian)", sample: "September 12, 2026" },
  { group: "Period", key: "date_to_gc", label: "To (Gregorian)", sample: "October 11, 2026" },
  { group: "Cash", key: "total_cash_collected", label: "Total cash collected", sample: "12,500.00" },
  { group: "Cash", key: "currency", label: "Currency", sample: "ETB" },
  { group: "Cash", key: "transaction_count", label: "Number of transactions", sample: "24" },
  { group: "Payment", key: "payment_amount", label: "Clearance fee paid", sample: "100.00 ETB" },
  { group: "Payment", key: "payment_reference", label: "Payment reference", sample: "G2GLXYZ12ABC34" },
  { group: "Payment", key: "payment_date", label: "Payment date", sample: "October 28, 2026" },
  { group: "Letter", key: "letter_date_et", label: "Letter date (Ethiopian)", sample: "Tikimt 17, 2019" },
  { group: "Letter", key: "letter_date_gc", label: "Letter date (Gregorian)", sample: "October 28, 2026" },
  { group: "Letter", key: "letter_ref", label: "Letter reference no.", sample: "G2G-2019-000123" },
  { group: "Contact", key: "support_phone", label: "G2G support phone", sample: "+251 900 000 000" },
];
export const SAMPLE_DATA = Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));
const money = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// scenario data -> placeholder values (letter_ref is added when the letter is issued)
export function buildData({ driver = {}, phone, plate, range, cash, payment, settings }) {
  const t = todayInEthiopia();
  return {
    driver_name: driver.name || "", driver_first_name: driver.first_name || "", driver_last_name: driver.last_name || "",
    driver_phone: phone, license_number: driver.license_number || "", contractor_id: driver.contractor_id || "",
    plate_number: driver.plate || plate || "", vehicle_brand: driver.vehicle_brand || "", vehicle_model: driver.vehicle_model || "",
    vehicle_year: driver.vehicle_year || "", vehicle_color: driver.vehicle_color || "", vehicle_vin: driver.vehicle_vin || "",
    date_from_et: range ? fmtEt(range.etFrom) : "", date_to_et: range ? fmtEt(range.etTo) : "",
    date_from_gc: range ? fmtGc(range.gcFrom) : "", date_to_gc: range ? fmtGc(range.gcTo) : "",
    total_cash_collected: cash ? money(cash.total) : "", currency: cash?.currency || settings.currency || "ETB",
    transaction_count: cash ? String(cash.count) : "",
    payment_amount: `${money(payment.amount_cents / 100)} ${payment.currency}`,
    payment_reference: payment.merchant_reference, payment_date: fmtGc(todayInEthiopia().gc),
    letter_date_et: fmtEt(t.et), letter_date_gc: fmtGc(t.gc), support_phone: settings.support_phone || "",
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const ALLOWED_STYLES = {
  "*": {
    "text-align": [/^(left|right|center|justify)$/], "font-size": [/^[\w.\-%]+$/], "font-weight": [/^[\w]+$/],
    "font-style": [/^[\w]+$/], "text-decoration": [/^[\w\s\-]+$/], color: [/^[#\w(),.\s%]+$/], "background-color": [/^[#\w(),.\s%]+$/],
    "font-family": [/^[\w\s,'"\-]+$/], "line-height": [/^[\d.]+(px|em|%)?$/], "margin-left": [/^[\d.]+(px|em)$/],
    "margin-top": [/^[\d.]+(px|em)$/], "margin-bottom": [/^[\d.]+(px|em)$/], "padding-left": [/^[\d.]+(px|em)$/],
    width: [/^[\d.]+(px|%)$/], height: [/^[\d.]+(px|%|auto)$/], "letter-spacing": [/^[\d.\-]+(px|em)$/],
  },
};
export const cleanBody = (html) => sanitizeHtml(String(html || ""), {
  allowedTags: ["p", "div", "span", "br", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "h4", "hr", "font", "table", "thead", "tbody", "tr", "td", "th", "img", "blockquote", "sub", "sup", "a"],
  allowedAttributes: { "*": ["style", "class", "align"], font: ["size", "color", "face"], img: ["src", "alt", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"], a: ["href"] },
  allowedStyles: ALLOWED_STYLES,
  allowedClasses: { "*": ["var"] },
  allowedSchemes: ["https", "http", "data"],
  allowedSchemesByTag: { img: ["https", "data"], a: ["https", "http"] },
});
export function cleanElements(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((e) => ({
    id: String(e.id || "").slice(0, 60), kind: ["logo", "signature", "stamp", "image"].includes(e.kind) ? e.kind : "image",
    src: /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,|https:\/\/)/i.test(e.src || "") ? e.src : "",
    x: num(e.x), y: num(e.y), w: Math.max(10, num(e.w, 120)), h: Math.max(10, num(e.h, 120)),
  })).filter((e) => e.src);
}

const CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
.page{position:relative;width:794px;min-height:1123px;background:#fff;color:#111;font-family:"Noto Sans Ethiopic","Nyala","Segoe UI",Arial,sans-serif;font-size:15px}
.body{padding:70px;line-height:1.55;word-wrap:break-word}
.body p,.body div{margin:0 0 .6em}.body h1{font-size:26px;margin:.4em 0}.body h2{font-size:21px;margin:.4em 0}.body h3{font-size:17px;margin:.4em 0}
.body ul,.body ol{margin:0 0 .6em 1.4em;padding:0}.body table{border-collapse:collapse;width:100%}.body td,.body th{border:1px solid #999;padding:6px}
.body img{max-width:100%}.fl{position:absolute;display:block;object-fit:contain}`;

export function renderLetterHtml(bodyHtml, elements, data) {
  const body = String(bodyHtml).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (data[k] !== undefined && data[k] !== "" ? esc(data[k]) : "—"));
  const imgs = (elements || []).map((e) => `<img class="fl" alt="" src="${esc(e.src)}" style="left:${num(e.x)}px;top:${num(e.y)}px;width:${num(e.w)}px;height:${num(e.h)}px">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page"><div class="body">${body}</div>${imgs}</div></body></html>`;
}

let browserP = null;
const ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
const SYSTEM_BROWSERS = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/snap/bin/chromium"];

// Works with whatever browser the machine has: PUPPETEER_EXECUTABLE_PATH first, then the Chrome that
// puppeteer downloaded, then Chromium / Chrome installed on the system.
async function launchAnyBrowser(puppeteer) {
  const tries = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) tries.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  tries.push(undefined); // puppeteer's own download
  for (const p of SYSTEM_BROWSERS) if (fs.existsSync(p) && !tries.includes(p)) tries.push(p);
  let last;
  for (const executablePath of tries) {
    try { return await puppeteer.launch({ headless: true, args: ARGS, executablePath }); }
    catch (e) { last = e; console.error(`PDF browser failed (${executablePath || "puppeteer bundled Chrome"}):`, String(e.message).split("\n")[0]); }
  }
  throw last;
}
function getBrowser(puppeteer) {
  if (!browserP) {
    browserP = launchAnyBrowser(puppeteer)
      .then((b) => { b.on("disconnected", () => { browserP = null; }); return b; })
      .catch((e) => { browserP = null; throw e; }); // don't cache a failed launch
  }
  return browserP;
}
export async function htmlToPdf(html) {
  const puppeteer = (await import("puppeteer")).default;
  const browser = await getBrowser(puppeteer);
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally { await page.close(); }
}