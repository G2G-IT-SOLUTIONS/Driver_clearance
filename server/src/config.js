import "dotenv/config";
const e = process.env;
export const cfg = {
  port: e.PORT || 3001,
  databaseUrl: e.DATABASE_URL,
  jwtSecret: e.JWT_SECRET || "dev-secret-change-me",
  publicUrl: (e.PUBLIC_URL || "http://localhost:5173").replace(/\/$/, ""),
  apiPublicUrl: (e.API_PUBLIC_URL || "").replace(/\/$/, ""),
  yango: { key: e.YANGO_API_KEY, client: e.YANGO_CLIENT_ID, park: e.YANGO_PARK_ID, base: "https://fleet-api.yango.tech" },
  sms: { provider: e.SMS_PROVIDER || "console", token: e.AFROMESSAGE_TOKEN, identifier: e.AFROMESSAGE_IDENTIFIER, sender: e.AFROMESSAGE_SENDER },
  chapaKey: e.CHAPA_SECRET_KEY,
  admin: { username: e.ADMIN_USERNAME || "admin", password: e.ADMIN_PASSWORD || "ChangeMe123!", name: e.ADMIN_NAME || "Administrator" },
};
