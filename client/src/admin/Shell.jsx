import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { adminUser, adminLogout, adm } from "../api.js";
import { Icon } from "./ui.jsx";
import "./admin.css";

export const AdminGuard = () => (adminUser() ? <Outlet /> : <Navigate to="/admin/login" replace />);

const NAV = [
  ["letters", "Downloaded letters", "letters"], ["templates", "Templates", "templates"], ["tokens", "Free download tokens", "tokens"],
  ["payments", "Payments", "payments"], ["errors", "Driver errors", "errors"], ["activity", "Activity log", "activity"],
  ["settings", "Settings", "settings", true], ["users", "Staff users", "users", true],
];

export function AdminLayout() {
  const user = adminUser(), nav = useNavigate();
  const out = async () => { try { await adm("/me"); } catch {} adminLogout(); nav("/admin/login"); };
  return (
    <div className="a-shell">
      <aside className="a-side">
        <div className="a-brand"><span className="a-logo">G2G</span><div><strong>Clearance</strong><small>Admin console</small></div></div>
        <nav>
          {NAV.filter((n) => !n[3] || user.role === "admin").map(([to, label, icon]) => (
            <NavLink key={to} to={`/admin/${to}`} className={({ isActive }) => "a-nav" + (isActive ? " active" : "")}><Icon name={icon} />{label}</NavLink>
          ))}
        </nav>
        <div className="a-user">
          <div className="a-avatar">{user.full_name[0]}</div>
          <div className="a-uinfo"><strong>{user.full_name}</strong><small>{user.role}</small></div>
          <button className="a-icon" title="Sign out" onClick={out}><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="a-main"><Outlet /></main>
    </div>
  );
}
