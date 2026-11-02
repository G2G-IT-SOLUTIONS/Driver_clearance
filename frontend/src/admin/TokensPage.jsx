import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { adm } from "../api.js";
import { Badge, PageHead, Empty, ErrorBar, fmt } from "./ui.jsx";
import { TokenReveal } from "./LettersPage.jsx";

export default function TokensPage() {
  const { state } = useLocation();
  const [rows, setRows] = useState(null), [err, setErr] = useState(""), [reveal, setReveal] = useState(state?.newToken || null);
  useEffect(() => { adm("/tokens").then(setRows).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <PageHead title="Free download tokens" sub="Single-use tokens issued by staff. A token expires after one download." />
      <ErrorBar error={err} />
      <section className="a-card"><div className="a-tablewrap"><table className="a-table">
        <thead><tr><th>Token</th><th>Driver</th><th>For letter</th><th>Template</th><th>Reason</th><th>Issued</th><th>Status</th></tr></thead>
        <tbody>{rows?.map((t) => (
          <tr key={t.id}>
            <td><code>••••-••••-{t.token_hint}</code></td>
            <td>{t.driver_name || "—"}<small>{t.phone} · {t.plate}</small></td>
            <td><Link to={`/admin/letters?id=${t.source_letter_id}`}>{t.source_ref}</Link></td>
            <td>{t.template_name}{t.template_kind === "driver_only" && <small>this driver only</small>}</td>
            <td className="wrap">{t.reason}</td>
            <td>{fmt(t.created_at)}<small>{t.created_by_name}</small></td>
            <td>{t.used_at ? <><Badge tone="used">Used</Badge><small>{fmt(t.used_at)}</small>{t.used_ref && <Link to={`/admin/letters?id=${t.used_letter_id}`}>{t.used_ref}</Link>}</> : <Badge tone="active">Active</Badge>}</td>
          </tr>))}</tbody>
      </table>{rows && !rows.length && <Empty>No tokens yet.</Empty>}</div></section>
      {reveal && <TokenReveal token={reveal} onClose={() => { setReveal(null); history.replaceState({}, ""); }} />}
    </>
  );
}
