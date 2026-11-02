import { useEffect, useState } from "react";
import { adm } from "../api.js";
import { PageHead, ErrorBar } from "./ui.jsx";

export default function SettingsPage() {
  const [s, setS] = useState(null), [msgs, setMsgs] = useState({}), [err, setErr] = useState(""), [ok, setOk] = useState("");
  useEffect(() => { adm("/settings").then((d) => { setS(d); setMsgs(Object.fromEntries(d.messages.map((m) => [m.code, m.message]))); }).catch((e) => setErr(e.message)); }, []);
  const flash = (t) => { setOk(t); setTimeout(() => setOk(""), 2500); };
  const saveMain = async () => { setErr(""); try { await adm("/settings", { method: "PUT", body: { clearance_amount: s.clearance_amount, support_phone: s.support_phone } }); flash("Settings saved"); } catch (e) { setErr(e.message); } };
  const saveMsg = async (code) => { setErr(""); try { await adm(`/messages/${code}`, { method: "PUT", body: { message: msgs[code] } }); flash("Message saved"); } catch (e) { setErr(e.message); } };
  if (!s) return <ErrorBar error={err} />;
  return (
    <>
      <PageHead title="Settings" sub="Changes apply to drivers immediately and are written to the activity log." />
      <ErrorBar error={err} />{ok && <div className="a-ok">{ok}</div>}
      <section className="a-card pad">
        <h3>Clearance letter payment</h3>
        <div className="a-form2">
          <div><label className="a-label">Amount paid through Chapa ({s.currency})</label><input className="a-input" type="number" min="1" step="0.01" value={s.clearance_amount} onChange={(e) => setS({ ...s, clearance_amount: e.target.value })} /></div>
          <div><label className="a-label">G2G support phone (shown to drivers)</label><input className="a-input" value={s.support_phone} onChange={(e) => setS({ ...s, support_phone: e.target.value })} /></div>
        </div>
        <button className="a-btn primary" onClick={saveMain}>Save</button>
      </section>
      <section className="a-card pad">
        <h3>Messages shown to drivers</h3>
        {s.messages.map((m) => (
          <div key={m.code} className="a-msg">
            <div><strong>{m.code}</strong><small>{m.description}</small></div>
            <input className="a-input" value={msgs[m.code] || ""} onChange={(e) => setMsgs({ ...msgs, [m.code]: e.target.value })} />
            <button className="a-btn sm" disabled={msgs[m.code] === m.message} onClick={() => saveMsg(m.code)}>Save</button>
          </div>
        ))}
      </section>
    </>
  );
}
