import { useEffect, useState } from "react";
import { adm, adminUser } from "../api.js";
import { Badge, PageHead, ErrorBar, Modal, fmt } from "./ui.jsx";

export default function UsersPage() {
  const me = adminUser();
  const [rows, setRows] = useState(null), [err, setErr] = useState(""), [open, setOpen] = useState(false);
  const [f, setF] = useState({ username: "", full_name: "", password: "", role: "staff" });
  const load = () => adm("/users").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const create = async () => { setErr(""); try { await adm("/users", { body: f }); setOpen(false); setF({ username: "", full_name: "", password: "", role: "staff" }); load(); } catch (e) { setErr(e.message); } };
  const toggle = async (u) => { try { await adm(`/users/${u.id}/active`, { body: { active: !u.active } }); load(); } catch (e) { setErr(e.message); } };
  return (
    <>
      <PageHead title="Staff users" sub="People who can sign in to this console."><button className="a-btn primary" onClick={() => setOpen(true)}>Add staff</button></PageHead>
      <ErrorBar error={err} />
      <section className="a-card"><div className="a-tablewrap"><table className="a-table">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>{rows?.map((u) => <tr key={u.id}><td><strong>{u.full_name}</strong></td><td>{u.username}</td><td><Badge tone={u.role === "admin" ? "violet" : "blue"}>{u.role}</Badge></td><td><Badge tone={u.active ? "green" : "gray"}>{u.active ? "Active" : "Disabled"}</Badge></td><td>{fmt(u.created_at)}</td>
          <td>{u.id !== me.id && <button className="a-btn sm" onClick={() => toggle(u)}>{u.active ? "Disable" : "Enable"}</button>}</td></tr>)}</tbody>
      </table></div></section>
      {open && (
        <Modal title="Add staff member" onClose={() => setOpen(false)}>
          <ErrorBar error={err} />
          <label className="a-label">Full name</label><input className="a-input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <label className="a-label">Username</label><input className="a-input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          <label className="a-label">Temporary password (8+ characters)</label><input className="a-input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <label className="a-label">Role</label><select className="a-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select>
          <div className="a-actions end"><button className="a-btn primary" onClick={create}>Create</button></div>
        </Modal>
      )}
    </>
  );
}
