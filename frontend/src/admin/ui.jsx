import { useEffect, useRef, useState } from "react";

const ICONS = {
  letters: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  templates: "M3 3h18v18H3z M3 9h18 M9 21V9",
  tokens: "M21 2l-2 2 M15.5 7.5l3 3L22 7l-3-3 M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z M11.4 11.6L15.5 7.5",
  payments: "M1 4h22v16H1z M1 10h22",
  errors: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  settings: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  plus: "M12 5v14 M5 12h14", download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  back: "M19 12H5 M12 19l-7-7 7-7", x: "M18 6L6 18 M6 6l12 12", image: "M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
};
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
);

export const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
export const STATUS = { unsent: "Unsent", sent: "Sent", downloaded: "Old download" };
export const SCENARIOS = { no_driver: "Customer not found", no_transactions: "No transactions", with_transactions: "With transactions" };
const TONES = { unsent: "amber", sent: "green", downloaded: "gray", with_transactions: "green", no_transactions: "amber", no_driver: "red", payment: "blue", token: "violet", paid: "green", pending: "amber", failed: "red", used: "gray", active: "green" };
export const Badge = ({ children, tone }) => <span className={`a-badge ${TONES[tone] || tone || "gray"}`}>{children}</span>;

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="a-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={"a-modal" + (wide ? " wide" : "")}>
        <div className="a-modal-head"><h3>{title}</h3>{onClose && <button className="a-icon" onClick={onClose}><Icon name="x" /></button>}</div>
        <div className="a-modal-body">{children}</div>
      </div>
    </div>
  );
}

// shows a rendered A4 letter scaled to the width of its container
export function LetterFrame({ html }) {
  const box = useRef(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(box.current); return () => ro.disconnect();
  }, []);
  const s = w / 794;
  return (
    <div ref={box} className="a-frame" style={{ height: 1123 * s }}>
      <iframe title="letter" sandbox="" srcDoc={html} style={{ width: 794, height: 1123, transform: `scale(${s})` }} />
    </div>
  );
}

export const PageHead = ({ title, sub, children }) => (
  <div className="a-pagehead"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="a-actions">{children}</div></div>
);
export const Empty = ({ children }) => <div className="a-empty">{children}</div>;
export const ErrorBar = ({ error }) => (error ? <div className="a-error">{error}</div> : null);