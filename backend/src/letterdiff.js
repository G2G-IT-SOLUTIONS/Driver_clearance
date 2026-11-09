// Text + image comparison used for the change history of a letter (what was added / removed).

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// letter HTML -> plain text, keeping paragraph breaks
export function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, "\n")
    .replace(/<\/\s*(td|th)\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .split("\n").map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

const tokens = (text) => text.match(/\n|[^\s]+/g) || [];
const join = (toks) => toks.join(" ").replace(/ ?\n ?/g, "\n");

// word-level diff -> { diff:[{t:'eq'|'add'|'del', v:'text'}], summary:{added_words, removed_words} }
export function diffText(oldText, newText) {
  const a = tokens(oldText), b = tokens(newText), ops = [];
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  for (let i = 0; i < s; i++) ops.push(["eq", a[i]]);
  const A = a.slice(s, ea), B = b.slice(s, eb), n = A.length, m = B.length;
  if (n * m > 6e6) { // huge rewrite: show it as one replaced block instead of building a big table
    A.forEach((t) => ops.push(["del", t])); B.forEach((t) => ops.push(["add", t]));
  } else if (n || m) {
    const W = m + 1, L = new Uint32Array((n + 1) * W); // L[i][j] = longest common run of A[i:] and B[j:]
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push(["eq", A[i]]); i++; j++; }
      else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) { ops.push(["del", A[i]]); i++; }
      else { ops.push(["add", B[j]]); j++; }
    }
    while (i < n) ops.push(["del", A[i++]]);
    while (j < m) ops.push(["add", B[j++]]);
  }
  for (let i = ea; i < a.length; i++) ops.push(["eq", a[i]]);
  const out = [];
  for (const [t, v] of ops) { const last = out[out.length - 1]; if (last && last.t === t) last.toks.push(v); else out.push({ t, toks: [v] }); }
  const words = (t) => out.filter((x) => x.t === t).reduce((n2, x) => n2 + x.toks.filter((k) => k !== "\n").length, 0);
  return { diff: out.map((x) => ({ t: x.t, v: join(x.toks) })), summary: { added_words: words("add"), removed_words: words("del") } };
}

// long unchanged stretches are shortened so the log entry stays small (the letter itself is kept in full)
export function compactDiff(diff, keep = 8) {
  return diff.map((d) => {
    if (d.t !== "eq") return d;
    const w = d.v.split(/(\s+)/), words = w.filter((x) => x.trim()).length;
    if (words <= keep * 2 + 2) return d;
    const parts = d.v.split(/\s+/);
    return { t: "eq", v: `${parts.slice(0, keep).join(" ")} … ${parts.slice(-keep).join(" ")}`, cut: true };
  });
}

// images (logo / signature / stamp ...) compared by id
export function diffElements(prev = [], next = []) {
  const pm = new Map((prev || []).map((e) => [e.id, e])), nm = new Map((next || []).map((e) => [e.id, e])), out = [];
  for (const e of next || []) {
    const p = pm.get(e.id);
    if (!p) { out.push({ change: "added", kind: e.kind }); continue; }
    if (p.src !== e.src) out.push({ change: "replaced", kind: e.kind });
    if (p.x !== e.x || p.y !== e.y) out.push({ change: "moved", kind: e.kind });
    if (p.w !== e.w || p.h !== e.h) out.push({ change: "resized", kind: e.kind });
  }
  for (const p of prev || []) if (!nm.has(p.id)) out.push({ change: "removed", kind: p.kind });
  return out;
}