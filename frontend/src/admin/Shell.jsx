import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { adminUser, adminLogout, adm } from "../api.js";
import { Icon } from "./ui.jsx";
import "./admin.css";

export const AdminGuard = () => (adminUser() ? <Outlet /> : <Navigate to="/admin/login" replace />);

const tabOf = (loc) => (loc.pathname === "/admin/letters" ? new URLSearchParams(loc.search).get("tab") || "unsent" : null);
// [link, label, icon, isActive(location), adminOnly, showUnsentBadge]
const NAV = [
  ["/admin/letters?tab=unsent", "Unsent letters", "inbox", (l) => tabOf(l) === "unsent", false, true],
  ["/admin/letters?tab=all", "All letters", "letters", (l) => tabOf(l) === "sent" || tabOf(l) === "all", false, false],
  ["/admin/templates", "Templates", "templates", (l) => l.pathname.startsWith("/admin/templates")],
  ["/admin/payments", "Payments", "payments", (l) => l.pathname.startsWith("/admin/payments")],
  ["/admin/errors", "Driver errors", "errors", (l) => l.pathname.startsWith("/admin/errors")],
  ["/admin/activity", "Activity log", "activity", (l) => l.pathname.startsWith("/admin/activity")],
  ["/admin/settings", "Settings", "settings", (l) => l.pathname.startsWith("/admin/settings"), true],
  ["/admin/users", "Staff users", "users", (l) => l.pathname.startsWith("/admin/users"), true],
];

export function AdminLayout() {
  const user = adminUser(), nav = useNavigate(), loc = useLocation();
  const [unsent, setUnsent] = useState({ count: 0, latest: [] }), [toast, setToast] = useState(null), prev = useRef(null);
  const out = async () => { try { await adm("/me"); } catch {} adminLogout(); nav("/admin/login"); };

  // paid letters waiting for staff: checked every 20 s; a new one pops up a notification
  const poll = useCallback(async () => {
    try {
      const d = await adm("/letters/unsent");
      if (prev.current !== null && d.count > prev.current) setToast({ n: d.count - prev.current, first: d.latest[0] });
      prev.current = d.count; setUnsent(d);
    } catch { /* offline: try again next time */ }
  }, []);
  useEffect(() => { poll(); const t = setInterval(poll, 20000); return () => clearInterval(t); }, [poll]);
  useEffect(() => { document.title = unsent.count ? `(${unsent.count}) G2G Admin` : "G2G Admin"; }, [unsent.count]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 12000); return () => clearTimeout(t); }, [toast]);

  return (
    <div className="a-shell">
      <aside className="a-side">
        <div className="a-brand"><div className="a-brand-plate"><img className="a-logo-full" src="/logo-full.png" alt="G2G IT Solutions" /><img className="a-logo-mark" src="/logo-mark.png" alt="G2G" /></div><div className="a-brand-txt"><strong>Clearance</strong><small>Admin console</small></div></div>
        <nav>
          {NAV.filter((n) => !n[4] || user.role === "admin").map(([to, label, icon, active, , badge]) => (
            <NavLink key={to} to={to} className={"a-nav" + (active(loc) ? " active" : "")}>
              <Icon name={icon} /><span className="a-nav-label">{label}</span>
              {badge && unsent.count > 0 && <span className="a-count" title={`${unsent.count} letter(s) waiting for review`}>{unsent.count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="a-user">
          <div className="a-avatar">{user.full_name[0]}</div>
          <div className="a-uinfo"><strong>{user.full_name}</strong><small>{user.role}</small></div>
          <button className="a-icon" title="Sign out" onClick={out}><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="a-main"><Outlet context={{ unsent, refreshUnsent: poll }} /></main>
      {toast && (
        <div className="a-toast" role="status">
          <span className="a-toast-icon"><Icon name="bell" size={20} /></span>
          <div className="a-toast-txt">
            <strong>{toast.n === 1 ? "A paid letter is waiting for review" : `${toast.n} paid letters are waiting for review`}</strong>
            {toast.first && <small>{toast.first.driver_name || "Customer"} · {toast.first.plate || "—"} · {toast.first.letter_ref}</small>}
          </div>
          <button className="a-btn primary sm" onClick={() => { nav(`/admin/letters?tab=unsent${toast.first ? `&id=${toast.first.id}` : ""}`); setToast(null); }}>Review</button>
          <button className="a-icon" onClick={() => setToast(null)} title="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}
    </div>
  );
}