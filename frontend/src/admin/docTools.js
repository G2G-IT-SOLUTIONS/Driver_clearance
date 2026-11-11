// Helpers shared by the template editor and the letter editor: placeholder chips, page layout,
// block formatting, tables and find & replace. Everything here works on plain DOM nodes.

export const PAGE_W = 794, PAGE_H = 1123; // A4 at 96 dpi
export const PAGE_DEFAULTS = { mt: 70, mr: 70, mb: 70, ml: 70, header_on: false, footer_on: false, hh: 90, fh: 70 };
export const DEFAULTS = { logo: { x: 60, y: 36, w: 130 }, signature: { x: 520, y: 880, w: 170 }, stamp: { x: 620, y: 830, w: 130 }, image: { x: 250, y: 300, w: 220 } };
export const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

// same rules as pageLayout() on the server: top / bottom = space reserved on EVERY page (the header sits inside it)
export function layoutOf(page) {
  const p = { ...PAGE_DEFAULTS, ...(page || {}) };
  return { ...p, paged: !!(p.header_on || p.footer_on), top: p.header_on ? Math.max(p.mt, p.hh) : p.mt, bottom: p.footer_on ? Math.max(p.mb, p.fh) : p.mb };
}
export const showTokens = (html) => String(html || "").replace(/\{\{\s*(page_number|page_count)\s*\}\}/g, "1");

// ---------- placeholder chips ----------
export const chipHtml = (k) => `<span class="var" data-var="${k}" contenteditable="false">{{${k}}}</span>`;
export const toChips = (html) => String(html || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => chipHtml(k));
export const makeChip = (k) => { const s = document.createElement("span"); s.className = "var"; s.dataset.var = k; s.contentEditable = "false"; s.textContent = `{{${k}}}`; return s; };
// chips back to {{text}}, and the editing-only attributes removed
export function unchip(region) {
  const c = region.cloneNode(true);
  c.querySelectorAll(".var").forEach((n) => n.replaceWith(document.createTextNode(`{{${n.dataset.var}}}`)));
  c.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  return c.innerHTML;
}
// call after setting innerHTML: page breaks must not be editable text
export const hydrate = (region) => region.querySelectorAll(".pb").forEach((n) => { n.contentEditable = "false"; });
export const isBlank = (el) => !el || (!el.textContent.trim() && !el.querySelector("img,.var,table,hr"));

export function caretFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (!p) return null; const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
  return null;
}

export function readImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 900, k = Math.min(1, max / img.width), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve({ src: c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9), ratio: c.width / c.height });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ---------- block formatting (line spacing, indent) ----------
const BLOCKS = "p,div,h1,h2,h3,h4,li,blockquote,td,th";
// the smallest blocks touched by the selection
export function selectedBlocks(region, range) {
  if (!region || !range) return [];
  const pick = () => [...region.querySelectorAll(BLOCKS)].filter((el) => range.intersectsNode(el) && !el.querySelector(`${BLOCKS},table,ul,ol`));
  let list = pick();
  if (!list.length) { // loose text straight in the page: give it a paragraph first
    region.focus(); document.execCommand("formatBlock", false, "P"); list = pick();
  }
  return list;
}

// ---------- tables ----------
export const tableHtml = (rows, cols) => {
  const r = Math.min(30, Math.max(1, rows | 0)), c = Math.min(10, Math.max(1, cols | 0));
  return `<table style="width:100%">${Array.from({ length: r }, () => `<tr>${"<td><br></td>".repeat(c)}</tr>`).join("")}</table><p><br></p>`;
};
export function cellOf(node, region) {
  for (let n = node; n && n !== region; n = n.parentNode) if (n.nodeName === "TD" || n.nodeName === "TH") return n;
  return null;
}
export function tableOp(op, range, region) {
  const cell = cellOf(range?.startContainer, region);
  if (!cell) return false;
  const row = cell.parentNode, table = cell.closest("table"), idx = cell.cellIndex;
  const mk = () => { const c = document.createElement("td"); c.innerHTML = "<br>"; return c; };
  let next = null; // where the caret goes after something is deleted, so the table tools stay available
  if (op === "rowAbove" || op === "rowBelow") {
    const tr = document.createElement("tr"); [...row.cells].forEach(() => tr.appendChild(mk()));
    row.parentNode.insertBefore(tr, op === "rowAbove" ? row : row.nextSibling);
  } else if (op === "colLeft" || op === "colRight") {
    [...table.rows].forEach((r) => { const ref = r.cells[idx]; r.insertBefore(mk(), op === "colLeft" ? ref || null : ref?.nextSibling || null); });
  } else if (op === "delRow") {
    const near = row.previousElementSibling || row.nextElementSibling;
    if (near) { next = near.cells[Math.min(idx, near.cells.length - 1)]; row.remove(); } else table.remove();
  } else if (op === "delCol") {
    const near = cell.previousElementSibling || cell.nextElementSibling;
    if (near) { const at = near.cellIndex; [...table.rows].forEach((r) => r.cells[idx]?.remove()); next = row.cells[Math.min(at, row.cells.length - 1)]; } else table.remove();
  } else if (op === "delTable") table.remove();
  if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  return true;
}

// ---------- find & replace (text only; placeholder chips are skipped) ----------
function textNodes(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(".var") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const out = []; while (w.nextNode()) out.push(w.currentNode); return out;
}
export function findMatches(regions, needle, matchCase) {
  const out = []; if (!needle) return out;
  const n = matchCase ? needle : needle.toLowerCase();
  for (const r of regions) for (const t of textNodes(r)) {
    const s = matchCase ? t.nodeValue : t.nodeValue.toLowerCase();
    for (let i = s.indexOf(n); i !== -1; i = s.indexOf(n, i + n.length)) out.push({ node: t, start: i, end: i + n.length });
  }
  return out;
}
const rangeOf = (m) => { const r = document.createRange(); r.setStart(m.node, m.start); r.setEnd(m.node, m.end); return r; };
// select the first match after `from` (a Range) or from the top; wraps around. Returns the Range or null.
export function selectNext(regions, needle, matchCase, from) {
  const all = findMatches(regions, needle, matchCase); if (!all.length) return null;
  let hit = all[0];
  if (from) for (const m of all) { if (rangeOf(m).compareBoundaryPoints(Range.END_TO_START, from) >= 0) { hit = m; break; } }
  const r = rangeOf(hit), s = getSelection(); s.removeAllRanges(); s.addRange(r);
  hit.node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  return r;
}
export function replaceAll(regions, needle, text, matchCase) {
  const list = findMatches(regions, needle, matchCase);
  const byNode = new Map(); list.forEach((m) => byNode.set(m.node, [...(byNode.get(m.node) || []), m]));
  byNode.forEach((ms, node) => { // from the end so earlier offsets stay valid
    let v = node.nodeValue; ms.sort((a, b) => b.start - a.start).forEach((m) => { v = v.slice(0, m.start) + text + v.slice(m.end); }); node.nodeValue = v;
  });
  return list.length;
}