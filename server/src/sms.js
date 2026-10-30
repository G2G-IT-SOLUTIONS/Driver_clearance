import { cfg } from "./config.js";
import { HttpError } from "./util.js";

export async function sendSms(phone, message) {
  if (cfg.sms.provider === "afromessage") {
    const res = await fetch("https://api.afromessage.com/api/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.sms.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.sms.identifier, sender: cfg.sms.sender, to: phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!(res.ok && (data.acknowledge === "success" || data.acknowledge === undefined))) {
      console.error("AfroMessage error:", res.status, JSON.stringify(data));
      throw new HttpError(502, "Could not send the SMS. Please try again.");
    }
    return;
  }
  console.log(`\n[SMS to ${phone}] ${message}\n`); // console mode (testing)
}
