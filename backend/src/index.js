import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { cfg } from "./config.js";
import { q } from "./db.js";
import driverRoutes, { confirmPayment } from "./routes/driver.js";
import adminRoutes from "./routes/admin.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "25mb" })); // templates carry logo/signature/stamp images

app.use("/api/driver", driverRoutes);
app.use("/api/admin", adminRoutes);

// Chapa notification: never trusted by itself - we always re-verify with Chapa's API.
// callback_url -> GET with trx_ref, ref_id, status; webhook (if enabled in dashboard) -> POST with tx_ref
const chapaNotify = async (req, res) => {
  try {
    const ref = req.query.trx_ref || req.query.tx_ref || req.body?.tx_ref || req.body?.trx_ref;
    if (ref) {
      const { rows } = await q("SELECT * FROM payments WHERE merchant_reference=$1", [String(ref)]);
      if (rows[0]) await confirmPayment(rows[0]);
    }
  } catch (e) { console.error("chapa notify error", e.message); }
  res.sendStatus(200);
};
app.get("/api/chapa/callback", chapaNotify);
app.post("/api/chapa/webhook", chapaNotify);

// serve the built React app (npm run build in /client) from the same server
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : "Something went wrong. Please try again.", ...(err.extra || {}) });
});

app.listen(cfg.port, () => console.log(`G2G server on http://localhost:${cfg.port}  (SMS: ${cfg.sms.provider})`));