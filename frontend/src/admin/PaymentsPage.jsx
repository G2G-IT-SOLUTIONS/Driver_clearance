import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adm } from "../api.js";
import { Badge, PageHead, Empty, ErrorBar, fmt, SCENARIOS, STATUS } from "./ui.jsx";

export default function PaymentsPage() {
  const [rows, setRows] = useState(null), [err, setErr] = useState("");
  useEffect(() => { adm("/payments").then(setRows).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <PageHead title="Payments" sub="Every Chapa payment attempt, with the letter it produced." />
      <ErrorBar error={err} />
      <section className="a-card"><div className="a-tablewrap"><table className="a-table">
        <thead><tr><th>Reference</th><th>Driver</th><th>Type</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th><th>Letter</th></tr></thead>
        <tbody>{rows?.map((p) => (
          <tr key={p.id}>
            <td><strong>{p.merchant_reference}</strong><small>{p.chapa_reference}</small></td>
            <td>{p.driver_name || "—"}<small>{p.phone} · {p.plate}</small></td>
            <td><Badge tone={p.scenario}>{SCENARIOS[p.scenario]}</Badge></td>
            <td>{(p.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} {p.currency}</td>
            <td><Badge tone={p.status}>{p.status}</Badge></td>
            <td>{fmt(p.created_at)}</td><td>{fmt(p.paid_at)}</td>
            <td>{p.letter_ref ? <><Link className="a-link" to={`/admin/letters?tab=all&id=${p.letter_id}`}>{p.letter_ref}</Link><small><Badge tone={p.letter_status}>{STATUS[p.letter_status] || p.letter_status}</Badge></small></> : (p.status === "paid" ? <Badge tone="amber">Letter being created</Badge> : "—")}</td>
          </tr>))}</tbody>
      </table>{rows && !rows.length && <Empty>No payments yet.</Empty>}</div></section>
    </>
  );
}