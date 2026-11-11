import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { adm, adminUser } from "../api.js";
import { Badge, Modal, LetterFrame, PageHead, Empty, ErrorBar, Icon, fmt, SCENARIOS, STATUS } from "./ui.jsx";

const money = (c, cur) => (c == null ? "—" : `${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`);
const TABS = [["unsent", "Unsent"], ["sent", "Sent"], ["all", "All"]];

export default function LettersPage() {
  const nav = useNavigate(), [sp, setSp] = useSearchParams(), { unsent, refreshUnsent } = useOutletContext();
  const tab = sp.get("tab") || "unsent", sel = sp.get("id");
  const [rows, setRows] = useState(null), [err, setErr] = useState(""), [msg, setMsg] = useState("");
  const [f, setF] = useState({ q: "", from: "", to: "" });
  const [d, setD] = useState(null), [dtab, setDtab] = useState("preview");
  const [sendOpen, setSendOpen] = useState(false), [limitsOpen, setLimitsOpen] = useState(false);

  const load = () => adm(`/letters?${new URLSearchParams(Object.entries({ ...f, status: tab === "all" ? "" : tab }).filter(([, v]) => v))}`).then(setRows).catch((e) => setErr(e.message));
  const loadDetail = () => (sel ? adm(`/letters/${sel}`).then(setD).catch((e) => setErr(e.message)) : setD(null));
  useEffect(() => { setRows(null); load(); }, [tab, unsent.count]); // eslint-disable-line  (a new paid letter refreshes the list)
  useEffect(() => { setD(null); loadDetail(); }, [sel]); // eslint-disable-line
  const refreshAll = () => { load(); loadDetail(); refreshUnsent(); };
  const setTab = (t) => setSp({ tab: t });
  const open = (id) => { if (id === sel) return close(); setSp({ tab, id }); setDtab("preview"); setMsg(""); };
  const close = () => setSp({ tab });
  useEffect(() => { // Esc closes the preview
    const k = (e) => { if (e.key === "Escape" && sel && !sendOpen && !limitsOpen) close(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line
  const lim = d?.limits;
  const reviewable = d && d.source === "payment" && (d.status === "unsent" || d.status === "sent");

  return (
    <>
      <PageHead title="Letters" sub="Click a letter to preview it, edit it if needed, and send it to the customer." />
      <ErrorBar error={err} />
      {msg && <div className="a-ok">{msg}</div>}
      <div className="a-tabs a-tabs-top">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{k === "unsent" && unsent.count > 0 && <span className="a-count inline">{unsent.count}</span>}</button>)}
      </div>
      <div className={"a-split" + (sel ? " open" : "")}>
        <section className="a-card list">
          <form className="a-filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input className="a-input" placeholder="Search phone, plate, name, ref…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <input className="a-input" type="date" title="Date from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            <input className="a-input" type="date" title="Date to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            <button className="a-btn primary">Search</button>
          </form>
          <div className="a-tablewrap">
            <table className="a-table clickable letters">
              <thead><tr><th>Letter</th><th>Customer</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {rows?.map((r) => (
                  <tr key={r.id} className={sel === r.id ? "sel" : ""} onClick={() => open(r.id)}>
                    <td><strong>{r.letter_ref}</strong><small>{r.phone}</small></td>
                    <td>{r.driver_name || "—"}<small>{r.plate || "—"}</small></td>
                    <td><Badge tone={r.status}>{STATUS[r.status] || r.status}</Badge>{r.open_count > 0 && <small>Opened {r.open_count}×</small>}</td>
                    <td className="nowrap">{fmt(r.paid_at || r.downloaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows && !rows.length && <Empty>{tab === "unsent" ? "No letters are waiting. New paid letters appear here." : "No letters found."}</Empty>}
          </div>
        </section>

        {sel && <section className="a-card detail">
          {!d && <Empty>Loading…</Empty>}
          {d && (
            <>
              <div className="a-detail-head">
                <div><h2>{d.letter_ref}</h2><small>{d.driver_name || "Customer"} · {d.phone}</small></div>
                <div className="a-detail-tools"><Badge tone={d.status}>{STATUS[d.status] || d.status}</Badge><button className="a-icon" title="Close preview (Esc)" onClick={close}><Icon name="x" size={18} /></button></div>
              </div>
              {reviewable && (
                <div className="a-limits">
                  <span className="a-chip"><Icon name="edit" size={14} /> Edits left <b>{lim.edits_left}</b>/{d.max_edits}</span>
                  <span className="a-chip"><Icon name="send" size={14} /> Sends left <b>{lim.sends_left}</b>/{d.max_sends}</span>
                  <span className="a-chip"><Icon name="clock" size={14} /> Editing {lim.can_edit || lim.edits_left === 0 || new Date(lim.edit_until) > new Date() ? "open until" : "closed on"} <b>{fmt(lim.edit_until)}</b></span>
                  {adminUser()?.role === "admin" && <button className="a-btn sm" onClick={() => setLimitsOpen(true)}>Change limits</button>}
                </div>
              )}
              <div className="a-actions a-actions-detail">
                {reviewable && <button className="a-btn" disabled={!lim.can_edit} title={lim.edit_block || ""} onClick={() => nav(`/admin/letters/${d.id}/edit`)}><Icon name="edit" size={16} /> Edit letter</button>}
                {reviewable && <button className="a-btn primary" disabled={!lim.can_send} title={lim.send_block || ""} onClick={() => setSendOpen(true)}><Icon name="send" size={16} /> {d.send_count ? "Send again by SMS" : "Send to customer"}</button>}
                <button className="a-btn" onClick={() => adm(`/letters/${d.id}/pdf`, { blob: true }).then(loadDetail).catch((e) => setErr(e.message))}><Icon name="download" size={16} /> PDF</button>
              </div>
              {reviewable && (!lim.can_edit || !lim.can_send) && <p className="a-muted small a-why">{[lim.edit_block, lim.send_block].filter(Boolean).join(" ")}</p>}
              <div className="a-tabs">{[["preview", "Preview"], ["history", `History (${d.history.length})`], ["info", "Details"]].map(([k, l]) => <button key={k} className={dtab === k ? "on" : ""} onClick={() => setDtab(k)}>{l}</button>)}</div>
              {dtab === "preview" && <LetterFrame html={d.rendered_html} />}
              {dtab === "history" && <History rows={d.history} />}
              {dtab === "info" && <Info d={d} />}
            </>
          )}
        </section>}
      </div>

      {sendOpen && d && <SendModal d={d} onClose={() => setSendOpen(false)} onDone={(m) => { setSendOpen(false); setMsg(m); setDtab("history"); refreshAll(); }} setErr={setErr} />}
      {limitsOpen && d && <LimitsModal d={d} onClose={() => setLimitsOpen(false)} onDone={() => { setLimitsOpen(false); setMsg("Limits updated for this letter."); refreshAll(); }} />}
    </>
  );
}

// ---------- send by SMS ----------
function SendModal({ d, onClose, onDone, setErr }) {
  const [busy, setBusy] = useState(false), [e, setE] = useState("");
  const go = async () => {
    setBusy(true); setE("");
    try { const r = await adm(`/letters/${d.id}/send`, { method: "POST", body: {} }); onDone(`SMS sent to ${d.phone}. ${r.sends_left} send${r.sends_left === 1 ? "" : "s"} left for this letter.`); }
    catch (x) { setE(x.message); setErr(""); }
    setBusy(false);
  };
  return (
    <Modal title="Send the letter to the customer?" onClose={() => !busy && onClose()}>
      <p className="a-muted">An SMS with a download link will be sent to <strong>{d.phone}</strong> — the number the customer verified when they paid. It cannot be changed.</p>
      <p className="a-muted">This is send <strong>{d.send_count + 1} of {d.max_sends}</strong>. {d.send_count > 0 && "The link from the earlier SMS will stop working."} The customer receives the letter exactly as it is now, with {d.edit_count} edit{d.edit_count === 1 ? "" : "s"} made.</p>
      {e && <div className="a-error">{e}</div>}
      <div className="a-actions end"><button className="a-btn" disabled={busy} onClick={onClose}>Cancel</button><button className="a-btn primary" disabled={busy} onClick={go}>{busy ? "Sending…" : "Send SMS"}</button></div>
    </Modal>
  );
}

// ---------- admin: limits of one letter ----------
function LimitsModal({ d, onClose, onDone }) {
  const [v, setV] = useState({ max_edits: d.max_edits, edit_window_days: d.edit_window_days, max_sends: d.max_sends }), [busy, setBusy] = useState(false), [e, setE] = useState("");
  const set = (k) => (ev) => setV({ ...v, [k]: ev.target.value });
  const go = async () => { setBusy(true); setE(""); try { await adm(`/letters/${d.id}/limits`, { method: "PUT", body: v }); onDone(); } catch (x) { setE(x.message); } setBusy(false); };
  return (
    <Modal title={`Limits for ${d.letter_ref}`} onClose={() => !busy && onClose()}>
      <p className="a-muted small">These limits apply to this letter only. The change is written to the letter's history. Defaults for new letters are in Settings.</p>
      <label className="a-label">Maximum edits (already used: {d.edit_count})</label><input className="a-input" type="number" min="0" max="50" value={v.max_edits} onChange={set("max_edits")} />
      <label className="a-label">Editing allowed for (days after the letter was created)</label><input className="a-input" type="number" min="0" max="365" value={v.edit_window_days} onChange={set("edit_window_days")} />
      <label className="a-label">Maximum sends (already used: {d.send_count})</label><input className="a-input" type="number" min="0" max="50" value={v.max_sends} onChange={set("max_sends")} />
      {e && <div className="a-error" style={{ marginTop: 12 }}>{e}</div>}
      <div className="a-actions end"><button className="a-btn" disabled={busy} onClick={onClose}>Cancel</button><button className="a-btn primary" disabled={busy} onClick={go}>{busy ? "Saving…" : "Save limits"}</button></div>
    </Modal>
  );
}

// ---------- history of one letter (rows of the activity log for this letter) ----------
const Diff = ({ diff }) => (
  <div className="a-diff">{(diff || []).map((x, i) => x.t === "add" ? <ins key={i}>{x.v} </ins> : x.t === "del" ? <del key={i}>{x.v} </del> : <span key={i} className="eq">{x.v} </span>)}</div>
);
const IMG = { added: "added", removed: "removed", moved: "moved", resized: "resized", replaced: "replaced" };
const device = (ua = "") => (/android/i.test(ua) ? "Android" : /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : ua ? "Browser" : "");

function Entry({ h }) {
  const x = h.details || {};
  const who = h.staff_name || "Customer";
  switch (h.action) {
    case "LETTER_CREATED": return [<>Letter created after the customer paid</>, <small>Allowed: {x.limits?.max_edits} edits · {x.limits?.max_sends} sends · editing for {x.limits?.edit_window_days} days</small>, "green"];
    case "LETTER_EDIT": return [<>Edit {x.edit_no} of {x.of} by <b>{who}</b></>, <>
      <small>{x.formatting_only ? "Formatting only — no words changed" : <><span className="plus">+{x.added_words} words added</span> · <span className="minus">−{x.removed_words} words removed</span></>}{(x.image_changes || []).length > 0 && " · images: " + x.image_changes.map((c) => `${c.kind} ${IMG[c.change]}`).join(", ")}</small>
      {(x.added_words > 0 || x.removed_words > 0) && <Diff diff={x.diff} />}</>, "blue"];
    case "LETTER_SEND": return [<>SMS link sent by <b>{who}</b> to {x.phone}</>, <small>Send {x.send_no} of {x.of} · after {x.edits_made} edit{x.edits_made === 1 ? "" : "s"}{x.earlier_link_replaced ? " · the earlier link no longer works" : ""} · link …{x.token_hint}</small>, "green"];
    case "LETTER_SEND_FAILED": return [<>SMS could not be sent ({who})</>, <small>{x.reason}</small>, "red"];
    case "LETTER_OPENED": return [<>Customer opened the link — letter downloaded</>, <small>Open no. {x.open_no}{device(x.user_agent) ? ` · ${device(x.user_agent)}` : ""}{h.ip ? ` · ${h.ip}` : ""}</small>, "violet"];
    case "LETTER_LIMITS": return [<>Limits changed by <b>{who}</b></>, <small>{["max_edits", "edit_window_days", "max_sends"].filter((k) => x.from?.[k] !== x.to?.[k]).map((k) => `${{ max_edits: "max edits", edit_window_days: "editing days", max_sends: "max sends" }[k]}: ${x.from[k]} → ${x.to[k]}`).join(" · ")}</small>, "amber"];
    case "LETTER_DOWNLOAD_ADMIN": return [<>PDF downloaded by <b>{who}</b></>, null, "gray"];
    default: return [<>{h.action} ({who})</>, null, "gray"];
  }
}
export function History({ rows }) {
  if (!rows.length) return <Empty>No history yet.</Empty>;
  return (
    <ol className="a-timeline">
      {[...rows].reverse().map((h) => { const [title, body, tone] = Entry({ h }); return (
        <li key={h.id} className={"tl-" + tone}><span className="tl-dot" /><div className="tl-body"><div className="tl-title">{title}</div>{body}<time>{fmt(h.created_at)}</time></div></li>
      ); })}
    </ol>
  );
}

// ---------- driver / payment / letter details ----------
const Block = ({ title, rows }) => (
  <div className="a-block"><h4>{title}</h4><dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || v === 0 ? String(v) : "—"}</dd></div>)}</dl></div>
);
function Info({ d }) {
  const x = d.data || {};
  return (
    <div className="a-info">
      <Block title="Customer (profile)" rows={[["Name", d.driver_name], ["Phone (verified)", d.phone], ["Plate", d.plate], ["Contractor ID", d.contractor_id], ["License no.", x.license_number],
        ["Vehicle", [x.vehicle_brand, x.vehicle_model, x.vehicle_year].filter(Boolean).join(" ")], ["Color", x.vehicle_color], ["VIN", x.vehicle_vin]]} />
      <Block title="Payment" rows={[["Reference", d.merchant_reference], ["Chapa ref.", d.chapa_reference], ["Amount", money(d.amount_cents, d.currency)], ["Status", d.pay_status], ["Paid at", fmt(d.paid_at)]]} />
      <Block title="Letter" rows={[["Type", SCENARIOS[d.scenario]], ["Template", d.template_name], ["Status", STATUS[d.status] || d.status],
        ["Cash period", x.date_from_et ? `${x.date_from_et} → ${x.date_to_et}` : "—"], ["Total cash", x.total_cash_collected ? `${x.total_cash_collected} ${x.currency || ""}` : "—"],
        ["Edits used", d.source === "payment" ? `${d.edit_count} of ${d.max_edits}` : "—"], ["Sends used", d.source === "payment" ? `${d.send_count} of ${d.max_sends}` : "—"],
        ["Last sent", fmt(d.last_sent_at)], ["Opened by customer", d.open_count ? `${d.open_count}× · last ${fmt(d.last_opened_at)}` : "Not yet"]]} />
    </div>
  );
}