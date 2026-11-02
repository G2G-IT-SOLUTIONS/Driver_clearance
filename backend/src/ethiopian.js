// Ethiopian <-> Gregorian conversion via Julian Day Number
const JD = 1723856;
export const ET_MONTHS = ["Meskerem","Tikimt","Hidar","Tahsas","Tir","Yekatit","Megabit","Miazia","Genbot","Sene","Hamle","Nehase","Pagume"];
const GC_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const isEtLeap = (y) => y % 4 === 3;
export const daysInEtMonth = (y, m) => (m < 13 ? 30 : isEtLeap(y) ? 6 : 5);

export function validEt(d) {
  return d && Number.isInteger(d.year) && Number.isInteger(d.month) && Number.isInteger(d.day) &&
    d.year > 1900 && d.year < 2300 && d.month >= 1 && d.month <= 13 && d.day >= 1 && d.day <= daysInEtMonth(d.year, d.month);
}
const etToJdn = (y, m, d) => JD + 365 + 365 * (y - 1) + Math.floor(y / 4) + 30 * m + d - 31;
function jdnToGc(jdn) {
  const f = jdn + 1401 + Math.floor((Math.floor((4 * jdn + 274277) / 146097) * 3) / 4) - 38;
  const e = 4 * f + 3, g = Math.floor((e % 1461) / 4), h = 5 * g + 2;
  const day = Math.floor((h % 153) / 5) + 1, month = ((Math.floor(h / 153) + 2) % 12) + 1;
  return { year: Math.floor(e / 1461) - 4716 + Math.floor((12 + 2 - month) / 12), month, day };
}
function gcToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
export const etToGregorian = ({ year, month, day }) => jdnToGc(etToJdn(year, month, day));
export function gregorianToEt(y, m, d) {
  const jdn = gcToJdn(y, m, d), r = (jdn - JD) % 1461, n = (r % 365) + 365 * Math.floor(r / 1460);
  return { year: 4 * Math.floor((jdn - JD) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460), month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}
const pad = (n) => String(n).padStart(2, "0");
export const fmtEt = (d) => `${ET_MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
export const fmtGc = (d) => `${GC_MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
export const isoDate = (d) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

// Ethiopia is UTC+03:00: start of the "from" day to end of the "to" day
export function toApiRange(etFrom, etTo) {
  const f = etToGregorian(etFrom), t = etToGregorian(etTo);
  return {
    from: `${isoDate(f)}T00:00:00+03:00`, to: `${isoDate(t)}T23:59:59+03:00`,
    gcFrom: f, gcTo: t, etFrom, etTo,
    days: Math.round((gcToJdn(t.year, t.month, t.day) - gcToJdn(f.year, f.month, f.day))) + 1,
  };
}
// "today" in Ethiopia (UTC+3)
export function todayInEthiopia() {
  const n = new Date(Date.now() + 3 * 3600 * 1000);
  const gc = { year: n.getUTCFullYear(), month: n.getUTCMonth() + 1, day: n.getUTCDate() };
  return { gc, et: gregorianToEt(gc.year, gc.month, gc.day) };
}
