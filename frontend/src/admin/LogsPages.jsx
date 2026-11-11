import { useEffect, useState } from "react";
import { adm } from "../api.js";
import { Badge, Empty, ErrorBar, fmt } from "./ui.jsx";

const Details = ({ d }) => <code className="a-json">{Object.entries(d || {}).filter(([k]) => k !== "diff").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")}{d?.diff ? "\n(the exact words added / removed are shown in the letter's History tab)" : ""}</code>;

// both are shown inside Settings (tabs), so they have no page header of their own
export function ActivityLog() {
  const [rows, setRows] = useState(null), [err, setErr] = useState("");
  useEffect(() => { adm("/logs/activity").then(setRows).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <p className="a-muted small a-sub">Who did what. Entries are permanent and cannot be edited or deleted.</p>
      <ErrorBar error={err} />
      <section className="a-card"><div className="a-tablewrap"><table className="a-table">
        <thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>{rows?.map((l) => <tr key={l.id}><td>{fmt(l.created_at)}</td><td>{l.staff_name || "—"}<small>{l.ip}</small></td><td><Badge tone={l.action.includes("FAILED") ? "red" : "blue"}>{l.action}</Badge></td><td><Details d={l.details} /></td></tr>)}</tbody>
      </table>{rows && !rows.length && <Empty>No activity yet.</Empty>}</div></section>
    </>
  );
}

export function DriverErrors() {
  const [rows, setRows] = useState(null), [err, setErr] = useState("");
  useEffect(() => { adm("/logs/errors").then(setRows).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <p className="a-muted small a-sub">Problems drivers ran into (phone not found, wrong plate, wrong or reused token…).</p>
      <ErrorBar error={err} />
      <section className="a-card"><div className="a-tablewrap"><table className="a-table">
        <thead><tr><th>Time</th><th>Code</th><th>Phone</th><th>Plate entered</th><th>Message shown</th></tr></thead>
        <tbody>{rows?.map((l) => <tr key={l.id}><td>{fmt(l.created_at)}</td><td><Badge tone="amber">{l.code}</Badge></td><td>{l.phone || "—"}</td><td>{l.plate || "—"}</td><td className="wrap">{l.message_shown}</td></tr>)}</tbody>
      </table>{rows && !rows.length && <Empty>No errors recorded.</Empty>}</div></section>
    </>
  );
}