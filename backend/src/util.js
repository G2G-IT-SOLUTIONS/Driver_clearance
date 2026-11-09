import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const randomHex = (n = 32) => crypto.randomBytes(n).toString("hex");

const hits = new Map();
export function rateLimit(max, windowMs, scope) { // scope: share one counter between paths (links that carry a token in the URL)
  return (req, res, next) => {
    const key = `${req.baseUrl}${scope || req.path}:${req.ip}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return next(new HttpError(429, "Too many requests. Please wait a bit and try again."));
    arr.push(now); hits.set(key, arr); next();
  };
}

// 12-char token from an unambiguous alphabet, shown as XXXX-XXXX-XXXX
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newToken() {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHA[crypto.randomInt(0, ALPHA.length)];
  return { raw, pretty: raw.match(/.{4}/g).join("-") };
}
export const cleanToken = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");