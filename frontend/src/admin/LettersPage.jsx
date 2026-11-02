import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adm } from "../api.js";
import { Badge, Modal, LetterFrame, PageHead, Empty, ErrorBar, Icon, fmt, SCENARIOS } from "./ui.jsx";

const money = (c, cur) => (c == null ? "—" : `${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`);

export default function LettersPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState(null), [err, setErr] = useState("");
  const [f, setF] = useState({ q: "", from: "", to: "" });
  const [sel, setSel] = useState(null), [detail, setDetail] = useState(null), [tab, setTab] = useState("preview");
  const [tokenModal, setTokenModal] = useState(false), [newToken, setNewToken] = useState(null);

  const load = () => adm(`/letters?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => { const id = sp.get("id"); if (id) setSel(id); }, [sp]);
  useEffect(() => { if (!sel) return setDetail(null); setDetail(null); adm(`/letters/${sel}`).then(setDetail).catch((e) => setErr(e.message)); }, [sel]);

  const open = (id) => { setSel(id); setSp({ id }); setTab("preview"); };
  const d = detail;

  return (
    <>
      <PageHead title="Downloaded letters" sub="Every letter a driver downloaded, with its payment and driver information." />
      <ErrorBar error={err} />
      <div className="a-split">
        <section className="a-card list">
          <form className="a-filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input className="a-input" placeholder="Search phone, plate, name, ref…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <input className="a-input" type="date" title="Payment date from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            <input className="a-input" type="date" title="Payment date to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            <button className="a-btn primary">Search</button>
          </form>
          <div className="a-tablewrap">
            <table className="a-table clickable">
              <thead><tr><th>Letter</th><th>Driver</th><th>Plate</th><th>Type</th><th>Source</th><th>Downloaded</th></tr></thead>
              <tbody>
                {rows?.map((r) => (
                  <tr key={r.id} className={sel === r.id ? "sel" : ""} onClick={() => open(r.id)}>
                    <td><strong>{r.letter_ref}</strong><small>{r.phone}</small></td>
                    <td>{r.driver_name || "—"}</td><td>{r.plate || "—"}</td>
                    <td><Badge tone={r.scenario}>{SCENARIOS[r.scenario]}</Badge></td>
                    <td><Badge tone={r.source}>{r.source === "token" ? "Free token" : "Paid"}</Badge></td>
                    <td>{fmt(r.downloaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows && !rows.length && <Empty>No letters found.</Empty>}
          </div>
        </section>

        <section className="a-card detail">
          {!sel && <Empty>Select a letter to preview it.</Empty>}
          {sel && !d && <Empty>Loading…</Empty>}
          {d && (
            <>
              <div className="a-detail-head">
                <div><h2>{d.letter_ref}</h2><small>{fmt(d.downloaded_at)}</small></div>
                <div className="a-actions">
                  <button className="a-btn" onClick={() => adm(`/letters/${d.id}/pdf`, { blob: true }).catch((e) => setErr(e.message))}><Icon name="download" size={16} /> PDF</button>
                  <button className="a-btn primary" onClick={() => setTokenModal(true)}>Free download…</button>
                </div>
              </div>
              <div className="a-tabs">{[["preview", "Preview"], ["info", "Driver & payment"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
              {tab === "preview" && <LetterFrame html={d.rendered_html} />}
              {tab === "info" && (
                <div className="a-info">
                  <Block title="Driver (profile)" rows={[["Name", d.driver_name], ["Phone", d.phone], ["Plate", d.plate], ["Contractor ID", d.contractor_id], ["License no.", d.data.license_number],
                    ["Vehicle", [d.data.vehicle_brand, d.data.vehicle_model, d.data.vehicle_year].filter(Boolean).join(" ")], ["Color", d.data.vehicle_color], ["VIN", d.data.vehicle_vin]]} />
                  <Block title="Payment" rows={d.source === "payment" ? [["Reference", d.merchant_reference], ["Chapa ref.", d.chapa_reference], ["Amount", money(d.amount_cents, d.currency)], ["Status", d.pay_status], ["Paid at", fmt(d.paid_at)]] : [["Payment", "None — free download token"]]} />
                  <Block title="Letter" rows={[["Type", SCENARIOS[d.scenario]], ["Template", d.template_name], ["Source", d.source === "token" ? "Free token" : "Paid"],
                    ...(d.source === "token" ? [["Reason", d.reason], ["Token issued by", d.issued_by_name]] : [["Cash period", d.data.date_from_et ? `${d.data.date_from_et} → ${d.data.date_to_et}` : "—"], ["Total cash", d.data.total_cash_collected ? `${d.data.total_cash_collected} ${d.data.currency}` : "—"], ["Transactions", d.data.transaction_count || "—"]]),
                    ["Free tokens issued", d.tokens_issued]]} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {tokenModal && d && <TokenModal letter={d} onClose={() => setTokenModal(false)} onCustom={() => nav(`/admin/templates/new?fromLetter=${d.id}`)} onDone={(t) => { setTokenModal(false); setNewToken(t); }} />}
      {newToken && <TokenReveal token={newToken} onClose={() => setNewToken(null)} />}
    </>
  );
}

const Block = ({ title, rows }) => (
  <div className="a-block"><h4>{title}</h4><dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || v === 0 ? String(v) : "—"}</dd></div>)}</dl></div>
);

export function TokenReveal({ token, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Free download token created" onClose={onClose}>
      <p className="a-muted">Give this token to the driver. It works <strong>once</strong>, for this driver only, and is shown <strong>only now</strong>.</p>
      <div className="a-token">{token}</div>
      <div className="a-actions end"><button className="a-btn" onClick={() => { navigator.clipboard?.writeText(token); setCopied(true); }}>{copied ? "Copied ✓" : "Copy"}</button><button className="a-btn primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

function TokenModal({ letter, onClose, onCustom, onDone }) {
  const [templates, setTemplates] = useState([]), [tid, setTid] = useState(""), [reason, setReason] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { adm("/templates").then((l) => { const ok = l.filter((t) => t.kind === "standard" || t.for_contractor_id === letter.contractor_id); setTemplates(ok); setTid(ok[0]?.id || ""); }); }, [letter]);
  const go = async () => {
    setBusy(true); setErr("");
    try { const r = await adm("/tokens", { body: { letterId: letter.id, templateId: tid, reason } }); onDone(r.token); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Free download for this driver" onClose={onClose}>
      <p className="a-muted">The driver can download <strong>one</strong> letter without paying again. The letter keeps the information of <strong>{letter.letter_ref}</strong>.</p>
      <ErrorBar error={err} />
      <label className="a-label">Reason (kept in the log)</label>
      <textarea className="a-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Driver asked for a different format after paying" />
      <label className="a-label">Use an existing template</label>
      <select className="a-input" value={tid} onChange={(e) => setTid(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.kind === "driver_only" ? " (this driver only)" : ""}</option>)}</select>
      <div className="a-actions between">
        <button className="a-btn" onClick={onCustom}>Customize a new letter…</button>
        <button className="a-btn primary" disabled={busy || !tid || reason.trim().length < 3} onClick={go}>{busy ? "Creating…" : "Create token"}</button>
      </div>
    </Modal>
  );
}
