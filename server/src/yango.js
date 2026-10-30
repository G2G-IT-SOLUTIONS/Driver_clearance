import { cfg } from "./config.js";
import { HttpError } from "./util.js";

export async function yango(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(cfg.yango.base + path, {
    method,
    headers: { "X-API-Key": cfg.yango.key, "X-Client-ID": cfg.yango.client, "Accept-Language": "en", "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) {
    console.error("---- Yango error ----", method, path, res.status, "\nrequest:", JSON.stringify(body), "\nresponse:", text);
    throw new HttpError(502, "The driver registry is temporarily unavailable. Please try again.");
  }
  return data;
}

// 09xxxxxxxx / 07xxxxxxxx / 9xxxxxxxx / 2519xxxxxxxx / +2519xxxxxxxx  ->  +251XXXXXXXXX
export function normalizePhone(input = "") {
  let d = String(input).replace(/[^\d]/g, "");
  if (d.startsWith("251")) d = d.slice(3); else if (d.startsWith("0")) d = d.slice(1);
  return /^[79]\d{8}$/.test(d) ? `+251${d}` : null;
}
export const normalizePlate = (s = "") => String(s).normalize("NFKC").toUpperCase().replace(/[^0-9A-Z\u1200-\u137F]/g, "");

// ALL drivers that have this phone (the same phone can exist on several profiles)
export async function findDriversByPhone(phone) {
  const nine = phone.slice(4);
  const found = new Map();
  for (const text of [phone, `0${nine}`, nine]) {
    const data = await yango("/v1/parks/driver-profiles/list", {
      method: "POST",
      body: {
        query: { park: { id: cfg.yango.park }, text },
        fields: {
          driver_profile: ["id", "first_name", "last_name", "middle_name", "phones", "work_status", "driver_license", "created_date"],
          car: ["id", "number", "brand", "model", "year", "color", "vin"],
          account: [], park: [], current_status: [],
        },
        limit: 100, offset: 0,
      },
    });
    for (const p of data.driver_profiles || []) {
      const dp = p.driver_profile;
      if (dp && (dp.phones || []).some((ph) => normalizePhone(ph) === phone)) found.set(dp.id, { profile: dp, car: p.car || null });
    }
    if (found.size) break;
  }
  return [...found.values()];
}

export function matchByPlate(drivers, plate) {
  const p = normalizePlate(plate);
  return drivers.find((d) => d.car?.number && normalizePlate(d.car.number) === p) || null;
}

export function driverSnapshot({ profile, car }, phone) {
  return {
    contractor_id: profile.id,
    first_name: profile.first_name || "", last_name: profile.last_name || "", middle_name: profile.middle_name || "",
    name: [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" "),
    phone, license_number: profile.driver_license?.number || "", work_status: profile.work_status || "",
    created_date: profile.created_date || "",
    plate: car?.number || "", vehicle_brand: car?.brand || "", vehicle_model: car?.model || "",
    vehicle_year: car?.year ? String(car.year) : "", vehicle_color: car?.color || "", vehicle_vin: car?.vin || "",
  };
}

let cashIds = null;
async function cashCategoryIds() {
  if (cashIds) return cashIds;
  const data = await yango("/v2/parks/transactions/categories/list", { method: "POST", body: { query: { park: { id: cfg.yango.park } } } });
  let ids = (data.categories || []).filter((c) => c.group_id === "cash_collected").map((c) => c.id);
  if (!ids.length) ids = ["cash_collected"]; else cashIds = ids;
  return ids;
}

export async function getCashCollected(contractorId, from, to) {
  const category_ids = await cashCategoryIds();
  const limit = 1000; let cursor; const transactions = [];
  for (let i = 0; i < 100; i++) {
    const data = await yango("/v2/parks/driver-profiles/transactions/list", {
      method: "POST",
      body: { query: { park: { id: cfg.yango.park, driver_profile: { id: contractorId }, transaction: { category_ids, event_at: { from, to } } } }, limit, ...(cursor ? { cursor } : {}) },
    });
    const batch = data.transactions || [];
    transactions.push(...batch);
    if (!data.cursor || !batch.length) break;
    cursor = data.cursor;
  }
  const total = transactions.reduce((s, t) => s + Number(t.amount || 0), 0);
  return {
    count: transactions.length, total: Math.round(total * 100) / 100, currency: transactions[0]?.currency_code || "ETB",
    transactions: transactions.map((t) => ({ id: t.id, event_at: t.event_at, category_name: t.category_name, description: t.description || "", amount: t.amount })),
  };
}
