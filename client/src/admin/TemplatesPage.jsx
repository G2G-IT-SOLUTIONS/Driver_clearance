import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adm } from "../api.js";
import { Badge, LetterFrame, PageHead, Empty, ErrorBar, Icon, fmt, SCENARIOS } from "./ui.jsx";

export default function TemplatesPage() {
  const nav = useNavigate();
  const [list, setList] = useState(null), [err, setErr] = useState("");
  const load = () => adm("/templates").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const setDefault = async (id, scenario) => { if (!scenario) return; try { await adm(`/templates/${id}/default`, { body: { scenario } }); load(); } catch (e) { setErr(e.message); } };
  const std = list?.filter((t) => t.kind === "standard") || [], only = list?.filter((t) => t.kind !== "standard") || [];

  const Card = ({ t }) => (
    <div className="a-card tpl">
      <Link to={`/admin/templates/${t.id}`} className="a-thumb"><LetterFrame html={t.preview_html} /></Link>
      <div className="a-tplinfo">
        <strong>{t.name}</strong>
        <div>{t.default_for ? <Badge tone={t.default_for}>Default: {SCENARIOS[t.default_for]}</Badge> : <Badge>{t.kind === "driver_only" ? "Driver only" : "Not a default"}</Badge>}</div>
        <small>Updated {fmt(t.updated_at)}{t.updated_by_name ? ` by ${t.updated_by_name}` : ""}</small>
        <div className="a-actions">
          <button className="a-btn sm" onClick={() => nav(`/admin/templates/${t.id}`)}>Edit</button>
          {t.kind === "standard" && (
            <select className="a-input sm" value="" onChange={(e) => setDefault(t.id, e.target.value)}>
              <option value="">Set as default for…</option>
              {Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageHead title="Letter templates" sub="Defaults are what drivers receive after paying. Edit any template and set it as default.">
        <button className="a-btn primary" onClick={() => nav("/admin/templates/new")}><Icon name="plus" size={16} /> New template</button>
      </PageHead>
      <ErrorBar error={err} />
      <div className="a-slots">
        {Object.entries(SCENARIOS).map(([k, label]) => {
          const t = std.find((x) => x.default_for === k);
          return <div key={k} className="a-slot"><small>Default letter</small><strong>{label}</strong><span>{t ? t.name : "— none set —"}</span>{t && <Link to={`/admin/templates/${t.id}`}>Edit</Link>}</div>;
        })}
      </div>
      {!list && <Empty>Loading…</Empty>}
      <div className="a-grid">{std.map((t) => <Card key={t.id} t={t} />)}</div>
      {only.length > 0 && <><h3 className="a-h3">Driver-only templates</h3><div className="a-grid">{only.map((t) => <Card key={t.id} t={t} />)}</div></>}
    </>
  );
}
