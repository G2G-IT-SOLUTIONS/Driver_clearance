import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adm, ADMIN_TOKEN, ADMIN_USER } from "../api.js";
import "./admin.css";


export default function Login() {
  const nav = useNavigate();
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const d = await adm("/auth/login", { body: f });
      localStorage.setItem(ADMIN_TOKEN, d.token); localStorage.setItem(ADMIN_USER, JSON.stringify(d.user)); nav("/admin/letters");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="a-login">
                <div className="a-login-art"><div className="a-login-plate"><img src="../../public/logo-full.png.png" alt="G2G IT Solutions" /></div><h1>Clearance letters<br /></h1><p>Manage templates, payments and downloads.</p></div>
      <form className="a-login-card" onSubmit={submit}>
        <h2>Staff sign in</h2><p className="a-muted">Use your G2G staff account.</p>
        {err && <div className="a-error">{err}</div>}
        <label className="a-label">Username</label>
        <input className="a-input" autoFocus value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" />
        <label className="a-label">Password</label>
        <input className="a-input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        <button className="a-btn primary block" disabled={busy || !f.username || !f.password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}