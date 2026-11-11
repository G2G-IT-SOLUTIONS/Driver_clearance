import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adm } from "../api.js";
import { Icon, Modal, SCENARIOS } from "./ui.jsx";
import {
  PAGE_H, PAGE_DEFAULTS, DEFAULTS, rid, readImage, layoutOf, toChips, makeChip, unchip, hydrate, isBlank, caretFromPoint,
  selectedBlocks, tableHtml, tableOp, cellOf, findMatches, selectNext, replaceAll,
} from "./docTools.js";

// LetterEditor (staff) imports these from here
export { DEFAULTS, rid, readImage };

const FONTS = [["Segoe UI, Arial, sans-serif", "Sans"], ["Arial, sans-serif", "Arial"], ["Verdana, sans-serif", "Verdana"], ["Georgia, serif", "Serif"], ["Times New Roman, serif", "Times"], ["Courier New, monospace", "Mono"], ["Nyala, Noto Sans Ethiopic, sans-serif", "Amharic"]];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const REGION_LABEL = { body: "Letter text", header: "Header", footer: "Footer" };
const stateOf = (c) => { try { return document.queryCommandState(c); } catch { return false; } };

export function FloatImg({ el, selected, zoom, onSelect, onChange }) {
  const start = (e, mode) => {
    e.preventDefault(); e.stopPropagation(); onSelect(el.id);
    const sx = e.clientX, sy = e.clientY, o = { ...el }, ratio = o.w / o.h;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      if (mode === "move") onChange(el.id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
      else { const w = Math.max(20, Math.round(o.w + dx)); onChange(el.id, { w, h: Math.round(w / ratio) }); }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  return (
    <div className={"fl-box" + (selected ? " sel" : "")} style={{ left: el.x, top: el.y, width: el.w, height: el.h }} onPointerDown={(e) => start(e, "move")}>
      <img src={el.src} alt="" draggable={false} />
      {selected && <span className="fl-handle" onPointerDown={(e) => start(e, "resize")} />}
    </div>
  );
}

export default function TemplateEditor() {
  const { id } = useParams(), nav = useNavigate();
  const [name, setName] = useState("Untitled template");
  const [elements, setElements] = useState([]);
  const [page, setPage] = useState(PAGE_DEFAULTS);
  const [vars, setVars] = useState([]);
  const [initial, setInitial] = useState(null); // { body, header, footer }
  const [selId, setSelId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(""), [ok, setOk] = useState(""), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [region, setRegion] = useState("body");           // where the caret is: body | header | footer
  const [inTable, setInTable] = useState(false);
  const [fmt, setFmt] = useState({});                      // bold / italic / ... of the selection (for the highlighted buttons)
  const [inlineImg, setInlineImg] = useState(null), [, bump] = useState(0);
  const [dlg, setDlg] = useState(null);                    // { type: "table" | "link" | "page", ... }
  const [find, setFind] = useState(null);                  // null = closed
  const [stats, setStats] = useState({ words: 0, chars: 0, pages: 1, hOver: false, fOver: false });
  const bodyRef = useRef(null), hdrRef = useRef(null), ftrRef = useRef(null);
  const saved = useRef(null), activeName = useRef("body"), pageRef = useRef(page), fileRef = useRef(null), fileKind = useRef("image"), raf = useRef(0);
  pageRef.current = page;
  const L = layoutOf(page);
  const els = () => ({ body: bodyRef.current, header: hdrRef.current, footer: ftrRef.current });
  const visible = () => Object.values(els()).filter((e) => e && e.offsetParent !== null);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      try {
        setVars(await adm("/variables"));
        if (id) {
          const t = await adm(`/templates/${id}`);
          setName(t.name); setElements(t.elements || []); setPage({ ...PAGE_DEFAULTS, ...(t.page || {}) });
          setInitial({ body: t.body_html, header: t.header_html || "", footer: t.footer_html || "" });
        } else setInitial({ body: "<p>Write your letter here…</p>", header: "", footer: "" });
      } catch (e) { setErr(e.message); }
    })();
  }, [id]);
  useEffect(() => {
    if (!initial) return;
    [[bodyRef, initial.body], [hdrRef, initial.header], [ftrRef, initial.footer]].forEach(([r, h]) => { if (r.current) { r.current.innerHTML = toChips(h); hydrate(r.current); } });
    setDirty(false); measure();
  }, [initial]); // eslint-disable-line

  // ---------- word count, page estimate ----------
  const measure = useCallback(() => {
    const b = bodyRef.current; if (!b) return;
    const text = b.innerText || "", P = layoutOf(pageRef.current), h = b.offsetHeight;
    const usable = Math.max(200, PAGE_H - P.top - P.bottom);
    const pages = P.paged ? Math.max(1, Math.ceil(Math.max(0, h - P.top - P.bottom) / usable)) : Math.max(1, Math.ceil(h / PAGE_H));
    const over = (el) => !!el && el.offsetParent !== null && el.scrollHeight > el.clientHeight + 2;
    setStats({ words: (text.match(/\S+/g) || []).length, chars: text.replace(/\n/g, "").length, pages, hOver: over(hdrRef.current), fOver: over(ftrRef.current) });
  }, []);
  const touch = useCallback(() => { setDirty(true); cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(measure); }, [measure]);
  useEffect(() => { measure(); }, [page, zoom, measure]);

  // ---------- caret / selection tracking ----------
  useEffect(() => {
    const h = () => {
      const s = getSelection(); if (!s.rangeCount) return;
      for (const [n, el] of Object.entries(els())) {
        if (el && el.contains(s.anchorNode)) {
          saved.current = s.getRangeAt(0).cloneRange(); activeName.current = n; setRegion(n); setInTable(!!cellOf(s.anchorNode, el));
          const f = { b: stateOf("bold"), i: stateOf("italic"), u: stateOf("underline"), s: stateOf("strikeThrough"), ul: stateOf("insertUnorderedList"), ol: stateOf("insertOrderedList") };
          setFmt((p) => (JSON.stringify(p) === JSON.stringify(f) ? p : f));
          return;
        }
      }
    };
    document.addEventListener("selectionchange", h); return () => document.removeEventListener("selectionchange", h);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  useEffect(() => {
    const k = (e) => {
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === "s") { e.preventDefault(); save(); return; }
      if (mod && key === "h") { e.preventDefault(); openFind(); return; }
      if (key === "escape" && find) { setFind(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selId && !Object.values(els()).includes(document.activeElement) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) removeEl(selId);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line

  // ---------- text commands ----------
  const activeEl = () => els()[activeName.current] || bodyRef.current;
  const restore = () => { activeEl().focus(); if (saved.current) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved.current); } };
  const cmd = (c, v) => { restore(); document.execCommand("styleWithCSS", false, true); document.execCommand(c, false, v); touch(); };
  const tb = (c, v, on) => ({ onMouseDown: (e) => e.preventDefault(), onClick: () => cmd(c, v), className: "ed-btn" + (on ? " on" : "") });
  const setSize = (pt) => { // exact point sizes: let the browser mark the text, then turn the mark into a real font-size
    restore();
    document.execCommand("styleWithCSS", false, false); document.execCommand("fontSize", false, "7"); document.execCommand("styleWithCSS", false, true);
    activeEl().querySelectorAll('font[size="7"]').forEach((f) => { const s = document.createElement("span"); s.style.fontSize = pt + "pt"; while (f.firstChild) s.appendChild(f.firstChild); f.replaceWith(s); });
    touch();
  };
  const blockStyle = (fn) => { restore(); const s = getSelection(); selectedBlocks(activeEl(), s.rangeCount ? s.getRangeAt(0) : saved.current).forEach(fn); touch(); };
  const setSpacing = (v) => blockStyle((b) => { b.style.lineHeight = v; });
  const indent = (d) => blockStyle((b) => { const n = Math.max(0, (parseFloat(b.style.marginLeft) || 0) + d * 36); b.style.marginLeft = n ? `${n}px` : ""; });
  const normUrl = (u) => { u = u.trim(); return u && !/^https?:\/\//i.test(u) ? `https://${u}` : u; };
  const applyLink = (u) => {
    u = normUrl(u); if (!u) return; setDlg(null);
    if (saved.current?.collapsed) cmd("insertHTML", `<a href="${u.replace(/"/g, "&quot;")}">${u.replace(/[<&]/g, "")}</a>`); else cmd("createLink", u);
  };
  const doTable = (op) => { restore(); const s = getSelection(); if (tableOp(op, s.rangeCount ? s.getRangeAt(0) : saved.current, activeEl())) { if (op === "delTable") setInTable(false); touch(); } };

  const insertVar = (k, range) => {
    const all = els();
    let host = range && Object.entries(all).find(([, e]) => e?.contains(range.startContainer));
    if (!host) {
      const el = activeEl(), r = saved.current && el.contains(saved.current.startContainer) ? saved.current : (() => { const x = document.createRange(); x.selectNodeContents(el); x.collapse(false); return x; })();
      range = r; host = [activeName.current, el];
    }
    range.deleteContents();
    const chip = makeChip(k), sp = document.createTextNode("\u00A0");
    range.insertNode(sp); range.insertNode(chip);
    const sel = getSelection(), r = document.createRange(); r.setStartAfter(sp); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    saved.current = r.cloneRange(); activeName.current = host[0]; host[1].focus(); touch();
  };
  const onDrop = (e) => { const k = e.dataTransfer.getData("text/x-var"); if (!k) return; e.preventDefault(); insertVar(k, caretFromPoint(e.clientX, e.clientY)); };
  const onDragOver = (e) => { if (e.dataTransfer.types.includes("text/x-var")) e.preventDefault(); };
  const onRegionClick = (e) => setInlineImg(e.target.tagName === "IMG" ? e.target : null);

  // ---------- header / footer / page ----------
  const toggleHF = (k) => {
    const on = !page[`${k}_on`];
    setPage((p) => ({ ...p, [`${k}_on`]: on })); setDirty(true);
    if (on) setTimeout(() => { const el = k === "header" ? hdrRef.current : ftrRef.current; if (!el) return; if (!el.innerHTML.trim()) el.innerHTML = "<p><br></p>"; el.focus(); }, 0);
  };
  const pageNumbers = () => { // "Page 1 of 3" in the footer (or in the header when the caret is there)
    const k = activeName.current === "header" ? "header" : "footer";
    setPage((p) => ({ ...p, [`${k}_on`]: true }));
    setTimeout(() => {
      const el = k === "header" ? hdrRef.current : ftrRef.current; if (!el) return;
      const line = toChips('<p style="text-align:center">Page {{page_number}} of {{page_count}}</p>');
      if (isBlank(el)) el.innerHTML = line; else el.insertAdjacentHTML("beforeend", line);
      el.focus(); touch();
    }, 0);
  };
  const setPageNum = (k, v) => { setPage((p) => ({ ...p, [k]: Math.max(0, Math.min(300, Math.round(+v || 0))) })); setDirty(true); };

  // ---------- floating images (logo / signature / stamp) and inline images ----------
  const pickImage = (kind) => { fileKind.current = kind; fileRef.current.click(); };
  const onFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const { src, ratio } = await readImage(f);
      if (fileKind.current === "inline") { cmd("insertHTML", `<img src="${src}" width="140" alt="">`); return; }
      const d = DEFAULTS[fileKind.current], el = { id: rid(), kind: fileKind.current, src, x: d.x, y: d.y, w: d.w, h: Math.round(d.w / ratio) };
      setElements((l) => [...l, el]); setSelId(el.id); setDirty(true);
    } catch { setErr("That image could not be read."); }
  };
  const patchEl = useCallback((eid, p) => { setElements((l) => l.map((x) => (x.id === eid ? { ...x, ...p } : x))); setDirty(true); }, []);
  const removeEl = (eid) => { setElements((l) => l.filter((x) => x.id !== eid)); setSelId(null); setDirty(true); };
  const sel = elements.find((x) => x.id === selId);

  // ---------- find & replace ----------
  const openFind = () => setFind((f) => f || { q: "", r: "", cs: false, msg: "" });
  const setQ = (patch) => setFind((f) => { const n = { ...f, ...patch }; n.msg = n.q ? `${findMatches(visible(), n.q, n.cs).length} found` : ""; return n; });
  const findNext = () => {
    if (!find.q) return;
    const r = selectNext(visible(), find.q, find.cs, saved.current);
    if (r) saved.current = r.cloneRange(); else setFind((f) => ({ ...f, msg: "Not found" }));
  };
  const replaceOne = () => {
    const r = saved.current, same = (a) => (find.cs ? a === find.q : a.toLowerCase() === find.q.toLowerCase());
    if (r && !r.collapsed && same(r.toString()) && visible().some((e) => e.contains(r.startContainer))) { r.deleteContents(); r.insertNode(document.createTextNode(find.r)); touch(); }
    findNext();
  };
  const replaceEvery = () => { const n = replaceAll(visible(), find.q, find.r, find.cs); setFind((f) => ({ ...f, msg: n ? `Replaced ${n}` : "Not found" })); if (n) touch(); };

  // ---------- save / preview ----------
  const collect = () => ({
    name, body_html: unchip(bodyRef.current), header_html: isBlank(hdrRef.current) ? "" : unchip(hdrRef.current),
    footer_html: isBlank(ftrRef.current) ? "" : unchip(ftrRef.current), page, elements,
  });
  const flash = (t) => { setOk(t); setTimeout(() => setOk(""), 2500); };
  const save = async () => {
    if (busy || initial == null) return;
    setBusy(true); setErr("");
    try {
      if (id) { await adm(`/templates/${id}`, { method: "PUT", body: collect() }); setDirty(false); flash("Saved"); return id; }
      const r = await adm("/templates", { body: collect() }); setDirty(false); flash("Saved"); nav(`/admin/templates/${r.id}`, { replace: true }); return r.id;
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const makeDefault = async (sc) => {
    if (!sc) return; const tid = await save(); if (!tid) return;
    try { await adm(`/templates/${tid}/default`, { body: { scenario: sc } }); flash(`Saved as default for “${SCENARIOS[sc]}”`); } catch (e) { setErr(e.message); }
  };
  const showPreview = async () => { setErr(""); try { setPreview((await adm("/preview", { body: collect() })).html); } catch (e) { setErr(e.message); } };

  const groups = vars.reduce((a, v) => ((a[v.group] = a[v.group] || []).push(v), a), {});
  const Btn = ({ children, title, className = "ed-btn", ...p }) => <button type="button" className={className} title={title} {...p}>{children}</button>;
  const Sep = () => <span className="ed-sep" />;
  const keep = { onMouseDown: (e) => e.preventDefault() };
  const regionProps = { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false, onInput: touch, onDrop, onDragOver, onClick: onRegionClick, onFocus: () => setSelId(null) };
  const pick = (fn) => (e) => { const v = e.target.value; e.target.value = ""; if (v) fn(v); };

  return (
    <div className="ed">
      <header className="ed-top">
        <Link to="/admin/templates" className="a-icon" title="Back" onClick={(e) => { if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault(); }}><Icon name="back" /></Link>
        <input className="ed-name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <div className="a-actions">
          {err && <span className="ed-err">{err}</span>}{ok && <span className="ed-ok">{ok}</span>}{!ok && dirty && <span className="ed-dirty">Unsaved changes</span>}
          <button className="a-btn" onClick={showPreview}><Icon name="eye" size={16} /> Preview</button>
          <select className="a-input sm" value="" onChange={(e) => makeDefault(e.target.value)}><option value="">Save as default for…</option>{Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="a-btn" onClick={save} disabled={busy} title="Ctrl+S">Save template</button>
        </div>
      </header>

      <div className="ed-body">
        <aside className="ed-left">
          <h4>Placeholders</h4><p className="a-muted small">Drag into the letter, header or footer, or click to insert at the cursor.</p>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} className="ed-group"><small>{g}</small>
              {list.map((v) => (
                <button key={v.key} type="button" className="ed-var" draggable title={`Example: ${v.sample}`}
                  {...keep} onClick={() => insertVar(v.key)}
                  onDragStart={(e) => { e.dataTransfer.setData("text/x-var", v.key); e.dataTransfer.setData("text/plain", `{{${v.key}}}`); e.dataTransfer.effectAllowed = "copy"; }}>
                  {v.label}
                </button>))}
            </div>))}
        </aside>

        <section className="ed-center">
          <div className="ed-toolbar">
            <select className="ed-sel" defaultValue="" onChange={pick((v) => cmd("formatBlock", v))}><option value="">Style</option><option value="P">Paragraph</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option></select>
            <select className="ed-sel" defaultValue="" onChange={pick((v) => cmd("fontName", v))}><option value="">Font</option>{FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select className="ed-sel narrow" defaultValue="" title="Font size (pt)" onChange={pick((v) => setSize(v))}><option value="">Size</option>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <Sep />
            <Btn title="Bold (Ctrl+B)" {...tb("bold", null, fmt.b)}><b>B</b></Btn><Btn title="Italic (Ctrl+I)" {...tb("italic", null, fmt.i)}><i>I</i></Btn><Btn title="Underline (Ctrl+U)" {...tb("underline", null, fmt.u)}><u>U</u></Btn><Btn title="Strikethrough" {...tb("strikeThrough", null, fmt.s)}><s>S</s></Btn>
            <Btn title="Subscript" {...tb("subscript")}>x<sub>2</sub></Btn><Btn title="Superscript" {...tb("superscript")}>x<sup>2</sup></Btn>
            <label className="ed-btn color" title="Text color">A<input type="color" defaultValue="#111111" onInput={(e) => cmd("foreColor", e.target.value)} /></label>
            <label className="ed-btn hilite" title="Highlight color"><span>ab</span><input type="color" defaultValue="#fff59d" onInput={(e) => cmd("hiliteColor", e.target.value)} /></label>
            <Sep />
            <Btn title="Align left" {...tb("justifyLeft")}>⟸</Btn><Btn title="Center" {...tb("justifyCenter")}>≡</Btn><Btn title="Align right" {...tb("justifyRight")}>⟹</Btn><Btn title="Justify" {...tb("justifyFull")}>☰</Btn>
            <select className="ed-sel narrow" defaultValue="" title="Line spacing" onChange={pick(setSpacing)}><option value="">Spacing</option>{["1", "1.15", "1.5", "2"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <Sep />
            <Btn title="Bullets" {...tb("insertUnorderedList", null, fmt.ul)}>• List</Btn><Btn title="Numbering" {...tb("insertOrderedList", null, fmt.ol)}>1. List</Btn>
            <Btn title="Decrease indent" {...keep} onClick={() => indent(-1)}>⇤</Btn><Btn title="Increase indent" {...keep} onClick={() => indent(1)}>⇥</Btn>
            <Sep />
            <Btn title="Undo (Ctrl+Z)" {...tb("undo")}>↶</Btn><Btn title="Redo (Ctrl+Y)" {...tb("redo")}>↷</Btn><Btn title="Clear formatting" {...tb("removeFormat")}>Tx</Btn>
          </div>

          <div className="ed-toolbar row2">
            <Btn title="Insert link" {...keep} onClick={() => setDlg({ type: "link", url: "" })}>🔗 Link</Btn>
            <Btn title="Remove link" {...tb("unlink")}>Unlink</Btn>
            <Sep />
            <Btn title="Insert table" {...keep} onClick={() => setDlg({ type: "table", rows: 3, cols: 3 })}>▦ Table</Btn>
            {inTable && (
              <span className="ed-tbl">
                <Btn title="Row above" {...keep} onClick={() => doTable("rowAbove")}>+Row ↑</Btn><Btn title="Row below" {...keep} onClick={() => doTable("rowBelow")}>+Row ↓</Btn>
                <Btn title="Column left" {...keep} onClick={() => doTable("colLeft")}>+Col ←</Btn><Btn title="Column right" {...keep} onClick={() => doTable("colRight")}>+Col →</Btn>
                <Btn title="Delete row" {...keep} onClick={() => doTable("delRow")}>−Row</Btn><Btn title="Delete column" {...keep} onClick={() => doTable("delCol")}>−Col</Btn>
                <Btn title="Delete table" {...keep} onClick={() => doTable("delTable")}>✕ Table</Btn>
              </span>
            )}
            <Btn title="Horizontal line" {...tb("insertHorizontalRule")}>―</Btn>
            <Btn title={region === "body" ? "Start a new page here" : "Page breaks go in the letter text"} disabled={region !== "body"} {...keep} onClick={() => cmd("insertHTML", '<div class="pb" contenteditable="false"></div><p><br></p>')}>⤓ Page break</Btn>
            <Sep />
            {["logo", "signature", "stamp", "image"].map((k) => <button key={k} type="button" className="ed-btn wide" title="Floating image: drag it anywhere on the page" onClick={() => pickImage(k)}><Icon name="image" size={15} /> {k[0].toUpperCase() + k.slice(1)}</button>)}
            <button type="button" className="ed-btn wide" title="Image inside the text, header or footer (flows with the text)" onClick={() => pickImage("inline")}><Icon name="image" size={15} /> In text</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
            <Sep />
            <Btn className={"ed-btn wide" + (page.header_on ? " on" : "")} title="Repeat a header on every page" onClick={() => toggleHF("header")}>Header {page.header_on ? "✓" : ""}</Btn>
            <Btn className={"ed-btn wide" + (page.footer_on ? " on" : "")} title="Repeat a footer on every page" onClick={() => toggleHF("footer")}>Footer {page.footer_on ? "✓" : ""}</Btn>
            <Btn className="ed-btn wide" title="Insert “Page 1 of N”" onClick={pageNumbers}># Page numbers</Btn>
            <Btn className="ed-btn wide" title="Margins, header and footer height" onClick={() => setDlg({ type: "page" })}>⚙ Page setup</Btn>
            <Sep />
            <Btn className={"ed-btn wide" + (find ? " on" : "")} title="Find & replace (Ctrl+H)" onClick={() => (find ? setFind(null) : openFind())}>🔍 Find</Btn>
            <span className="ed-grow" />
            <Btn onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}>−</Btn><span className="ed-zoom">{Math.round(zoom * 100)}%</span><Btn onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))}>+</Btn>
          </div>

          {find && (
            <div className="ed-find">
              <input className="a-input sm" autoFocus placeholder="Find" value={find.q} onChange={(e) => setQ({ q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); findNext(); } }} />
              <input className="a-input sm" placeholder="Replace with" value={find.r} onChange={(e) => setFind((f) => ({ ...f, r: e.target.value }))} />
              <button className="a-btn sm" onClick={findNext} disabled={!find.q}>Next</button>
              <button className="a-btn sm" onClick={replaceOne} disabled={!find.q}>Replace</button>
              <button className="a-btn sm" onClick={replaceEvery} disabled={!find.q}>Replace all</button>
              <label className="ed-check"><input type="checkbox" checked={find.cs} onChange={(e) => setQ({ cs: e.target.checked })} /> Match case</label>
              <span className="a-muted small">{find.msg}</span>
              <button className="a-icon" title="Close" onClick={() => setFind(null)}><Icon name="x" size={15} /></button>
            </div>
          )}

          <div className="ed-canvas" onPointerDown={() => { setSelId(null); setInlineImg(null); }}>
            <div className="sheet" style={{ zoom }} onPointerDown={(e) => e.stopPropagation()}>
              {!L.paged && <div className="pg-guides" />}
              <div className={"hf-wrap hdr" + (region === "header" ? " act" : "")} style={{ display: page.header_on ? "block" : "none", height: L.hh }}>
                <span className="hf-tag">Header · repeats on every page</span>
                <div ref={hdrRef} className="hf-edit" style={{ padding: `0 ${L.mr}px 0 ${L.ml}px` }} {...regionProps} />
              </div>
              <div ref={bodyRef} className="body-edit" style={{ padding: `${L.top}px ${L.mr}px ${L.bottom}px ${L.ml}px` }} {...regionProps} />
              <div className={"hf-wrap ftr" + (region === "footer" ? " act" : "")} style={{ display: page.footer_on ? "block" : "none", height: L.fh }}>
                <span className="hf-tag">Footer · repeats on every page</span>
                <div ref={ftrRef} className="hf-edit" style={{ padding: `0 ${L.mr}px 0 ${L.ml}px` }} {...regionProps} />
              </div>
              {elements.map((el) => <FloatImg key={el.id} el={el} zoom={zoom} selected={selId === el.id} onSelect={setSelId} onChange={patchEl} />)}
            </div>
          </div>

          <div className="ed-status">
            <span>Editing: <strong>{REGION_LABEL[region]}</strong></span>
            <span>{stats.words} words</span><span>{stats.chars} characters</span><span>≈ {stats.pages} page{stats.pages === 1 ? "" : "s"}</span>
            {stats.hOver && <span className="warn">Header is taller than its box: raise “Header height” in Page setup</span>}
            {stats.fOver && <span className="warn">Footer is taller than its box: raise “Footer height” in Page setup</span>}
            <span className="ed-grow" /><span className="a-muted">Ctrl+S save · Ctrl+H find &amp; replace</span>
          </div>
        </section>

        <aside className="ed-right">
          {sel && (
            <>
              <h4>Floating image</h4>
              <div className="ed-thumb"><img src={sel.src} alt="" /></div>
              <label className="a-label">Type</label>
              <select className="a-input" value={sel.kind} onChange={(e) => patchEl(sel.id, { kind: e.target.value })}>{["logo", "signature", "stamp", "image"].map((k) => <option key={k}>{k}</option>)}</select>
              <label className="a-label">Width (px)</label>
              <input className="a-input" type="number" min="20" value={sel.w} onChange={(e) => { const w = Math.max(20, +e.target.value || 20); patchEl(sel.id, { w, h: Math.round(w / (sel.w / sel.h)) }); }} />
              <div className="ed-pos"><div><label className="a-label">X</label><input className="a-input" type="number" value={sel.x} onChange={(e) => patchEl(sel.id, { x: +e.target.value || 0 })} /></div><div><label className="a-label">Y</label><input className="a-input" type="number" value={sel.y} onChange={(e) => patchEl(sel.id, { y: +e.target.value || 0 })} /></div></div>
              <button className="a-btn danger block" onClick={() => removeEl(sel.id)}>Remove image</button>
            </>)}
          {inlineImg && inlineImg.isConnected && !sel && (
            <>
              <h4>Image in text</h4>
              <div className="ed-thumb"><img src={inlineImg.src} alt="" /></div>
              <label className="a-label">Width (px)</label>
              <input className="a-input" type="number" min="16" max="700" value={inlineImg.getAttribute("width") || inlineImg.width} onChange={(e) => { inlineImg.setAttribute("width", Math.max(16, Math.min(700, +e.target.value || 16))); inlineImg.removeAttribute("height"); bump((n) => n + 1); touch(); }} />
              <p className="a-muted small">Use the alignment buttons to move it left, centre or right.</p>
              <button className="a-btn danger block" onClick={() => { inlineImg.remove(); setInlineImg(null); touch(); }}>Remove image</button>
            </>)}
          {!sel && !inlineImg && (
            <>
              <h4>Page</h4>
              <ul className="ed-rules">
                <li>A4 · margins {page.mt}/{page.mr}/{page.mb}/{page.ml} px</li>
                <li>Header: <strong>{page.header_on ? `on (${page.hh} px)` : "off"}</strong></li>
                <li>Footer: <strong>{page.footer_on ? `on (${page.fh} px)` : "off"}</strong></li>
              </ul>
              <button className="a-btn block" onClick={() => setDlg({ type: "page" })}>⚙ Page setup</button>
              <p className="a-muted small" style={{ marginTop: 14 }}>Click a logo, signature or stamp on the page to move it (drag) or resize it (corner handle). Click an image inside the text to change its width.</p>
              {(page.header_on || page.footer_on) && <p className="a-muted small">With a header or footer on, put logos <strong>inside</strong> the header (“In text” button): floating images belong in the letter area below it.</p>}
            </>)}
        </aside>
      </div>

      {preview && <Modal title="Preview" wide onClose={() => setPreview(null)}><div className="ed-preview"><iframe title="preview" sandbox="" srcDoc={preview} /></div><p className="a-muted small">The preview shows one page. In the PDF the header and footer repeat on every page and the page numbers are filled in.</p></Modal>}

      {dlg?.type === "link" && (
        <Modal title="Insert link" onClose={() => setDlg(null)}>
          <label className="a-label">Web address</label>
          <input className="a-input" autoFocus placeholder="https://example.com" value={dlg.url} onChange={(e) => setDlg({ ...dlg, url: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") applyLink(dlg.url); }} />
          <p className="a-muted small">Select some text first to turn it into the link, or leave nothing selected to insert the address itself.</p>
          <div className="a-actions end"><button className="a-btn" onClick={() => setDlg(null)}>Cancel</button><button className="a-btn primary" disabled={!dlg.url.trim()} onClick={() => applyLink(dlg.url)}>Insert</button></div>
        </Modal>)}
      {dlg?.type === "table" && (
        <Modal title="Insert table" onClose={() => setDlg(null)}>
          <div className="ed-pos"><div><label className="a-label">Rows</label><input className="a-input" type="number" min="1" max="30" value={dlg.rows} onChange={(e) => setDlg({ ...dlg, rows: e.target.value })} /></div><div><label className="a-label">Columns</label><input className="a-input" type="number" min="1" max="10" value={dlg.cols} onChange={(e) => setDlg({ ...dlg, cols: e.target.value })} /></div></div>
          <p className="a-muted small">Click inside the table afterwards to add or delete rows and columns.</p>
          <div className="a-actions end"><button className="a-btn" onClick={() => setDlg(null)}>Cancel</button><button className="a-btn primary" onClick={() => { setDlg(null); cmd("insertHTML", tableHtml(dlg.rows, dlg.cols)); }}>Insert</button></div>
        </Modal>)}
      {dlg?.type === "page" && (
        <Modal title="Page setup" onClose={() => setDlg(null)}>
          <p className="a-muted small">A4 page, sizes in pixels (96 px = 1 inch, 38 px ≈ 1 cm).</p>
          <div className="ed-pos">
            {[["mt", "Top margin"], ["mb", "Bottom margin"], ["ml", "Left margin"], ["mr", "Right margin"]].map(([k, l]) => <div key={k}><label className="a-label">{l}</label><input className="a-input" type="number" min="0" max="300" value={page[k]} onChange={(e) => setPageNum(k, e.target.value)} /></div>)}
          </div>
          <h4 style={{ margin: "16px 0 6px" }}>Header &amp; footer</h4>
          <label className="ed-check"><input type="checkbox" checked={page.header_on} onChange={() => toggleHF("header")} /> Show a header on every page</label>
          <label className="a-label">Header height</label><input className="a-input" type="number" min="20" max="300" value={page.hh} onChange={(e) => setPageNum("hh", e.target.value)} />
          <label className="ed-check" style={{ marginTop: 10 }}><input type="checkbox" checked={page.footer_on} onChange={() => toggleHF("footer")} /> Show a footer on every page</label>
          <label className="a-label">Footer height</label><input className="a-input" type="number" min="20" max="300" value={page.fh} onChange={(e) => setPageNum("fh", e.target.value)} />
          <p className="a-muted small">The header sits inside the top margin and the footer inside the bottom margin. If the header is taller than the top margin, the space reserved at the top grows to fit it.</p>
          <div className="a-actions end"><button className="a-btn" onClick={() => setPage(PAGE_DEFAULTS)}>Reset</button><button className="a-btn primary" onClick={() => setDlg(null)}>Done</button></div>
        </Modal>)}
    </div>
  );
}