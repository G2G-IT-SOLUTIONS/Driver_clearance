import { cfg } from "./config.js";
import { HttpError } from "./util.js";

// Chapa v1 API (https://developer.chapa.co)
const BASE = "https://api.chapa.co/v1";
const headers = () => ({ Authorization: `Bearer ${cfg.chapaKey}`, "Content-Type": "application/json" });

// +251911234567 / 251911234567 / 0911234567 -> 0911234567 (Chapa wants 09xxxxxxxx or 07xxxxxxxx)
const chapaPhone = (p) => {
  const n = String(p || "").replace(/\D/g, "").slice(-9);
  return /^[79]\d{8}$/.test(n) ? "0" + n : undefined;
};

// Step "Accept Payment": POST /transaction/initialize -> data.checkout_url
export async function initCheckout({ amountCents, currency, txRef, customer, callbackUrl, returnUrl, meta, title, description }) {
  const phone = chapaPhone(customer.phone);
  const body = {
    amount: (amountCents / 100).toFixed(2), // Chapa expects birr, not cents
    currency,
    tx_ref: txRef,
    first_name: customer.first_name,
    last_name: customer.last_name,
    ...(phone ? { phone_number: phone } : {}),
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    return_url: returnUrl,
    meta,
    customization: { title, description },
  };
  const res = await fetch(`${BASE}/transaction/initialize`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== "success" || !data.data?.checkout_url) {
    console.error("Chapa init error:", res.status, JSON.stringify(data));
    throw new HttpError(502, "Could not start the payment. Please try again.");
  }
  return { checkoutUrl: data.data.checkout_url };
}

// Step "Verify Payments": GET /transaction/verify/<tx_ref>
export async function verifyPayment(txRef) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(txRef)}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("Chapa verify error:", res.status, JSON.stringify(data)); return { ok: false, data }; }
  return { ok: true, data };
}

// Fulfil only if Chapa says success AND it is OUR transaction for the amount we asked for
export function paymentMatches(v, txRef, amountCents, currency) {
  const d = v?.data;
  if (v?.status !== "success" || !d || d.status !== "success") return false;
  if (d.tx_ref !== txRef) return false;
  if (Math.round(Number(d.amount) * 100) !== amountCents) return false;
  return !d.currency || String(d.currency).toUpperCase() === currency.toUpperCase();
}