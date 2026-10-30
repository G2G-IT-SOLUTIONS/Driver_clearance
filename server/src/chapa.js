import { cfg } from "./config.js";
import { HttpError } from "./util.js";
const BASE = "https://api.chapa.global";
const headers = (extra = {}) => ({ Authorization: `Bearer ${cfg.chapaKey}`, "Content-Type": "application/json", ...extra });

export async function initCheckout({ amountCents, currency, reference, idempotencyKey, customer, callbackUrl, returnUrl, meta, title, description }) {
  const res = await fetch(`${BASE}/v2/payments/hosted`, {
    method: "POST",
    headers: headers({ "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({
      amount: amountCents, currency, merchant_reference: reference, customer,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}), return_url: returnUrl, meta,
      customization: { title, description },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.checkout_url) {
    console.error("Chapa init error:", res.status, JSON.stringify(data));
    throw new HttpError(502, "Could not start the payment. Please try again.");
  }
  return { checkoutUrl: data.data.checkout_url, chapaReference: data.data.checkout_url.split("/").filter(Boolean).pop() };
}

// Fulfil only when data.status === "SUCCESS" (top-level status only means the API call worked)
export async function verifyPayment(reference) {
  const res = await fetch(`${BASE}/v2/payments/${encodeURIComponent(reference)}/verify`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("Chapa verify error:", res.status, JSON.stringify(data)); return { ok: false, data }; }
  return { ok: true, data };
}

// amount in the verify payload may be cents or whole birr - accept either, but it MUST equal what we asked for
export function paymentMatches(verifyData, amountCents, currency) {
  const d = verifyData?.data || {};
  if (d.status !== "SUCCESS") return false;
  const amt = Number(d.amount);
  const amountOk = Number.isFinite(amt) && (Math.round(amt) === amountCents || Math.round(amt * 100) === amountCents);
  const curOk = !d.currency || String(d.currency).toUpperCase() === currency.toUpperCase();
  return amountOk && curOk;
}
