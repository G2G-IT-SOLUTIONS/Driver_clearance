// Ethiopian <-> Gregorian conversion via Julian Day Number. No dependencies.
const JD_OFFSET = 1723856;

export const ET_MONTHS = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit",
  "Miazia", "Genbot", "Sene", "Hamle", "Nehase", "Pagume",
];

export const isEtLeap = (y) => y % 4 === 3;
export const daysInEtMonth = (y, m) => (m < 13 ? 30 : isEtLeap(y) ? 6 : 5);

function etToJdn(y, m, d) {
  return JD_OFFSET + 365 + 365 * (y - 1) + Math.floor(y / 4) + 30 * m + d - 31;
}

function jdnToGregorian(jdn) {
  const f = jdn + 1401 + Math.floor((Math.floor((4 * jdn + 274277) / 146097) * 3) / 4) - 38;
  const e = 4 * f + 3;
  const g = Math.floor((e % 1461) / 4);
  const h = 5 * g + 2;
  const day = Math.floor((h % 153) / 5) + 1;
  const month = ((Math.floor(h / 153) + 2) % 12) + 1;
  const year = Math.floor(e / 1461) - 4716 + Math.floor((12 + 2 - month) / 12);
  return { year, month, day };
}

function gregorianToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) -
    Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
  );
}

function jdnToEt(jdn) {
  const r = (jdn - JD_OFFSET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor((jdn - JD_OFFSET) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

export const etToGregorian = ({ year, month, day }) => jdnToGregorian(etToJdn(year, month, day));
export const gregorianToEt = (y, m, d) => jdnToEt(gregorianToJdn(y, m, d));
export const todayEt = () => {
  const t = new Date();
  return gregorianToEt(t.getFullYear(), t.getMonth() + 1, t.getDate());
};

const pad = (n) => String(n).padStart(2, "0");

// Ethiopia is UTC+03:00. Start of "from" day, end of "to" day.
export function toApiRange(etFrom, etTo) {
  const f = etToGregorian(etFrom);
  const t = etToGregorian(etTo);
  return {
    from: `${f.year}-${pad(f.month)}-${pad(f.day)}T00:00:00+03:00`,
    to: `${t.year}-${pad(t.month)}-${pad(t.day)}T23:59:59+03:00`,
    gcFrom: `${f.year}-${pad(f.month)}-${pad(f.day)}`,
    gcTo: `${t.year}-${pad(t.month)}-${pad(t.day)}`,
  };
}

export const compareEt = (a, b) =>
  a.year - b.year || a.month - b.month || a.day - b.day;
