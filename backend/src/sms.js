import http from "node:http";
import https from "node:https";
import { cfg } from "./config.js";
import { HttpError } from "./util.js";

// ---------------------------------------------------------------------------
// One place for every SMS the app sends. SMS_PROVIDER=playsms  -> PlaySMS webservices
//                                        SMS_PROVIDER=console  -> prints the SMS in this terminal (testing)
// ---------------------------------------------------------------------------

let agent;
const getAgent = () => (agent ||= new https.Agent({ keepAlive: true, rejectUnauthorized: !cfg.sms.playsms.insecureTls })); // insecureTls = curl -k

// GET helper: 5s to connect, 20s overall (same limits as the curl command)
function getText(urlStr, { connectMs = 5000, totalMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const secure = u.protocol === "https:";
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(ct); clearTimeout(tt); fn(v); };
    const req = (secure ? https : http).request(u, { method: "GET", ...(secure ? { agent: getAgent() } : {}), headers: { Accept: "application/json" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; if (body.length > 65536) req.destroy(new Error("response too large")); });
      res.on("end", () => finish(resolve, { status: res.statusCode, body }));
    });
    const ct = setTimeout(() => req.destroy(new Error("connect timeout")), connectMs);
    const tt = setTimeout(() => req.destroy(new Error("request timeout")), totalMs);
    req.on("socket", (s) => { if (!s.connecting) clearTimeout(ct); else s.once("connect", () => clearTimeout(ct)); });
    req.on("error", (e) => finish(reject, e));
    req.end();
  });
}

// PlaySMS answers {"status":"OK","error":"0",...} (possibly with a "data":[{...}] list) or {"status":"ERR","error":"100","error_string":"..."}
function playsmsAccepted(j) {
  if (!j || typeof j !== "object") return false;
  const first = Array.isArray(j.data) ? j.data[0] : null;
  const status = String(j.status ?? first?.status ?? "").toUpperCase();
  const error = String(j.error ?? first?.error ?? "0");
  return status === "OK" && error === "0" && (!first || String(first.status ?? "OK").toUpperCase() === "OK");
}

async function sendViaPlaySms(to, message) {
  const p = cfg.sms.playsms;
  if (!p.url || !p.user || !p.token) { console.error("PlaySMS is not configured (PLAYSMS_URL / PLAYSMS_USER / PLAYSMS_TOKEN)."); throw new HttpError(502, "Could not send the SMS. Please try again."); }
  const qs = new URLSearchParams({ app: "ws", u: p.user, h: p.token, op: "pv", to, msg: message, format: "json" }); // "+" in the number is sent as %2B
  let res;
  try { res = await getText(`${p.url}${p.url.includes("?") ? "&" : "?"}${qs}`); }
  catch (e) { console.error("PlaySMS request failed:", e.code || "", e.message); throw new HttpError(502, "Could not send the SMS. Please try again."); }
  let j = null; try { j = JSON.parse(res.body); } catch { /* not JSON */ }
  if (res.status !== 200 || !playsmsAccepted(j)) {
    console.error("PlaySMS rejected the message:", res.status, res.body.slice(0, 300)); // never log the request URL: it holds the token
    throw new HttpError(502, "Could not send the SMS. Please try again.");
  }
}

export async function sendSms(phone, message) {
  if (cfg.sms.provider === "playsms") return sendViaPlaySms(phone, message);
  console.log(`\n[SMS to ${phone}] ${message}\n`); // console mode (testing)
}