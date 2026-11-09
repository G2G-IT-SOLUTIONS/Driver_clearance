import jwt from "jsonwebtoken";
import { cfg } from "./config.js";
import { q } from "./db.js";
import { ah, HttpError } from "./util.js";

export const signStaff = (u) => jwt.sign({ id: u.id }, cfg.jwtSecret, { expiresIn: "10h" });

export const requireStaff = (...roles) => ah(async (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let id;
  try { id = jwt.verify(token, cfg.jwtSecret).id; } catch { throw new HttpError(401, "Please sign in."); }
  const { rows } = await q("SELECT id, username, full_name, role, active FROM users WHERE id=$1", [id]);
  if (!rows[0] || !rows[0].active) throw new HttpError(401, "Account disabled or not found.");
  if (roles.length && !roles.includes(rows[0].role)) throw new HttpError(403, "You do not have permission for this action.");
  req.staff = rows[0];
  next();
});

// append-only audit trail. Pass a transaction client as the last argument to log inside that transaction.
export async function logAct(req, action, entityType = null, entityId = null, details = {}, client = null) {
  await (client || { query: q }).query("INSERT INTO activity_logs(staff_id,staff_name,action,entity_type,entity_id,details,ip) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [req.staff?.id || null, req.staff?.full_name || details.username || null, action, entityType, entityId ? String(entityId) : null, JSON.stringify(details), req.ip]);
}