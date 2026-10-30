import { useState } from "react";
import { ET_MONTHS, daysInEtMonth, etToGregorian, todayEt, compareEt } from "./ethiopian.js";

const WEEKDAYS = ["Eh", "Se", "Ma", "Ro", "Ha", "Ar", "Ki"]; // Sun..Sat (Ehud, Segno, Maksegno, Rob, Hamus, Arb, Kidame)
const MONTH_NAMES_GC = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Ethiopian calendar grid. value = {year, month, day}
export default function EthiopianCalendar({ label, value, onChange, min }) {
  const [view, setView] = useState({ year: value.year, month: value.month });
  const today = todayEt();

  const shift = (delta) => {
    let { year, month } = view;
    month += delta;
    if (month < 1) { month = 13; year--; }
    if (month > 13) { month = 1; year++; }
    setView({ year, month });
  };

  const total = daysInEtMonth(view.year, view.month);
  const firstG = etToGregorian({ ...view, day: 1 });
  const offset = new Date(firstG.year, firstG.month - 1, firstG.day).getDay();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const g = etToGregorian(value);

  return (
    <div className="cal">
      <div className="cal-top">
        <span className="cal-label">{label}</span>
        <span className="cal-gc">{MONTH_NAMES_GC[g.month - 1]} {g.day}, {g.year} GC</span>
      </div>
      <div className="cal-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <strong>{ET_MONTHS[view.month - 1]} {view.year}</strong>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const date = { ...view, day: d };
          const selected = compareEt(date, value) === 0;
          const isToday = compareEt(date, today) === 0;
          const disabled = min && compareEt(date, min) < 0;
          return (
            <button
              type="button"
              key={i}
              disabled={disabled}
              className={"cal-day" + (selected ? " sel" : "") + (isToday ? " today" : "")}
              onClick={() => onChange(date)}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
