import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { adm } from "../api.js";
import { Icon, Modal, SCENARIOS } from "./ui.jsx";

const chipHtml = (k) => `<span class="var" data-var="${k}" contenteditable="false">{{${k}}}</span>`;
const toChips = (html) => String(html || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => chipHtml(k));
const makeChip = (k) => { const s = document.createElement("span"); s.className = "var"; s.dataset.var = k; s.contentEditable = "false"; s.textContent = `{{${k}}}`; return s; };
function caretFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (!p) return null; const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
  return null;
}
const DEFAULTS = { logo: { x: 60, y: 36, w: 130 }, signature: { x: 520, y: 880, w: 170 }, stamp: { x: 620, y: 830, w: 130 }, image: { x: 250, y: 300, w: 220 } };
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

function readImage(file) {
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

function FloatImg({ el, selected, zoom, onSelect, onChange }) {
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
  const { id } = useParams(), [sp] = useSearchParams(), nav = useNavigate();
  const fromLetter = sp.get("fromLetter");
  const [name, setName] = useState("Untitled template");
  const [elements, setElements] = useState([]);
  const [vars, setVars] = useState([]);
  const [letter, setLetter] = useState(null);
  const [initial, setInitial] = useState(null);
  const [selId, setSelId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [err, setErr] = useState(""), [ok, setOk] = useState(""), [busy, setBusy] = useState(false);
  const bodyRef = useRef(null), saved = useRef(null), fileRef = useRef(null), fileKind = useRef("image");

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      try {
        setVars(await adm("/variables"));
        if (id) { const t = await adm(`/templates/${id}`); setName(t.name); setElements(t.elements); setInitial(t.body_html); }
        else if (fromLetter) {
          const l = await adm(`/letters/${fromLetter}`); setLetter(l);
          setName(`Custom - ${l.driver_name || l.phone}`); setElements(l.tpl_elements); setInitial(l.tpl_body_html);
        } else setInitial("<p>Write your letter here…</p>");
      } catch (e) { setErr(e.message); }
    })();
  }, [id, fromLetter]);
  useEffect(() => { if (initial != null && bodyRef.current) bodyRef.current.innerHTML = toChips(initial); }, [initial]);

  // remember the last caret position inside the page
  useEffect(() => {
    const h = () => { const s = getSelection(); if (s.rangeCount && bodyRef.current?.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange(); };
    document.addEventListener("selectionchange", h); return () => document.removeEventListener("selectionchange", h);
  }, []);
  useEffect(() => {
    const k = (e) => { if ((e.key === "Delete" || e.key === "Backspace") && selId && document.activeElement !== bodyRef.current && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) removeEl(selId); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line

  // ---------- text commands ----------
  const restore = () => { bodyRef.current.focus(); if (saved.current) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved.current); } };
  const cmd = (c, v) => { restore(); document.execCommand("styleWithCSS", false, true); document.execCommand(c, false, v); };
  const tb = (c, v) => ({ onMouseDown: (e) => e.preventDefault(), onClick: () => cmd(c, v) });

  const insertVar = (k, range) => {
    const body = bodyRef.current;
    if (!range || !body.contains(range.startContainer)) {
      range = saved.current && body.contains(saved.current.startContainer) ? saved.current : (() => { const r = document.createRange(); r.selectNodeContents(body); r.collapse(false); return r; })();
    }
    range.deleteContents();
    const chip = makeChip(k), sp = document.createTextNode("\u00A0");
    range.insertNode(sp); range.insertNode(chip);
    const sel = getSelection(), r = document.createRange(); r.setStartAfter(sp); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    saved.current = r.cloneRange(); body.focus();
  };
  const onDrop = (e) => { const k = e.dataTransfer.getData("text/x-var"); if (!k) return; e.preventDefault(); insertVar(k, caretFromPoint(e.clientX, e.clientY)); };
  const onDragOver = (e) => { if (e.dataTransfer.types.includes("text/x-var")) e.preventDefault(); };

  // ---------- floating images ----------
  const pickImage = (kind) => { fileKind.current = kind; fileRef.current.click(); };
  const onFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const { src, ratio } = await readImage(f), d = DEFAULTS[fileKind.current], el = { id: rid(), kind: fileKind.current, src, x: d.x, y: d.y, w: d.w, h: Math.round(d.w / ratio) };
      setElements((l) => [...l, el]); setSelId(el.id);
    } catch { setErr("That image could not be read."); }
  };
  const patchEl = useCallback((eid, p) => setElements((l) => l.map((x) => (x.id === eid ? { ...x, ...p } : x))), []);
  const removeEl = (eid) => { setElements((l) => l.filter((x) => x.id !== eid)); setSelId(null); };
  const sel = elements.find((x) => x.id === selId);

  // ---------- save / preview ----------
  const collect = () => {
    const c = bodyRef.current.cloneNode(true);
    c.querySelectorAll(".var").forEach((n) => n.replaceWith(document.createTextNode(`{{${n.dataset.var}}}`)));
    return { name, body_html: c.innerHTML, elements };
  };
  const flash = (t) => { setOk(t); setTimeout(() => setOk(""), 2500); };
  const save = async () => {
    setBusy(true); setErr("");
    try {
      if (id) { await adm(`/templates/${id}`, { method: "PUT", body: collect() }); flash("Saved"); return id; }
      const r = await adm("/templates", { body: collect() }); nav(`/admin/templates/${r.id}`, { replace: true }); return r.id;
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const makeDefault = async (sc) => {
    if (!sc) return; const tid = await save(); if (!tid) return;
    try { await adm(`/templates/${tid}/default`, { body: { scenario: sc } }); flash(`Saved as default for “${SCENARIOS[sc]}”`); } catch (e) { setErr(e.message); }
  };
  const showPreview = async () => { setErr(""); try { const c = collect(); setPreview((await adm("/preview", { body: { ...c, letterId: letter?.id } })).html); } catch (e) { setErr(e.message); } };

  const groups = vars.reduce((a, v) => ((a[v.group] = a[v.group] || []).push(v), a), {});
  const Btn = ({ children, title, ...p }) => <button type="button" className="ed-btn" title={title} {...p}>{children}</button>;

  return (
    <div className="ed">
      <header className="ed-top">
        <Link to="/admin/templates" className="a-icon" title="Back"><Icon name="back" /></Link>
        <input className="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
        {letter && <span className="ed-chip">Custom letter for {letter.driver_name || letter.phone} · {letter.letter_ref}</span>}
        <div className="a-actions">
          {err && <span className="ed-err">{err}</span>}{ok && <span className="ed-ok">{ok}</span>}
          <button className="a-btn" onClick={showPreview}><Icon name="eye" size={16} /> Preview{letter ? " with driver data" : ""}</button>
          <select className="a-input sm" value="" onChange={(e) => makeDefault(e.target.value)}><option value="">Save as default for…</option>{Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="a-btn" onClick={save} disabled={busy}>Save template</button>
          {letter && <button className="a-btn primary" onClick={() => setTokenOpen(true)}>Create free-download token</button>}
        </div>
      </header>

      <div className="ed-body">
        <aside className="ed-left">
          <h4>Placeholders</h4><p className="a-muted small">Drag into the letter, or click to insert at the cursor.</p>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} className="ed-group"><small>{g}</small>
              {list.map((v) => (
                <button key={v.key} type="button" className="ed-var" draggable title={`Example: ${v.sample}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v.key)}
                  onDragStart={(e) => { e.dataTransfer.setData("text/x-var", v.key); e.dataTransfer.setData("text/plain", `{{${v.key}}}`); e.dataTransfer.effectAllowed = "copy"; }}>
                  {v.label}
                </button>))}
            </div>))}
        </aside>

        <section className="ed-center">
          <div className="ed-toolbar">
            <select className="ed-sel" defaultValue="" onChange={(e) => { if (e.target.value) cmd("formatBlock", e.target.value); e.target.value = ""; }}><option value="">Style</option><option value="P">Paragraph</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option></select>
            <select className="ed-sel" defaultValue="" onChange={(e) => { if (e.target.value) cmd("fontName", e.target.value); e.target.value = ""; }}><option value="">Font</option><option value="Segoe UI, Arial, sans-serif">Sans</option><option value="Georgia, serif">Serif</option><option value="Courier New, monospace">Mono</option><option value="Nyala, Noto Sans Ethiopic, sans-serif">Amharic</option></select>
            <select className="ed-sel" defaultValue="" onChange={(e) => { if (e.target.value) cmd("fontSize", e.target.value); e.target.value = ""; }}><option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Medium</option><option value="5">Large</option><option value="6">X-Large</option><option value="7">Huge</option></select>
            <span className="ed-sep" />
            <Btn title="Bold" {...tb("bold")}><b>B</b></Btn><Btn title="Italic" {...tb("italic")}><i>I</i></Btn><Btn title="Underline" {...tb("underline")}><u>U</u></Btn>
            <label className="ed-btn color" title="Text color">A<input type="color" defaultValue="#111111" onInput={(e) => cmd("foreColor", e.target.value)} /></label>
            <span className="ed-sep" />
            <Btn title="Align left" {...tb("justifyLeft")}>⟸</Btn><Btn title="Center" {...tb("justifyCenter")}>≡</Btn><Btn title="Align right" {...tb("justifyRight")}>⟹</Btn><Btn title="Justify" {...tb("justifyFull")}>☰</Btn>
            <span className="ed-sep" />
            <Btn title="Bullets" {...tb("insertUnorderedList")}>• List</Btn><Btn title="Numbering" {...tb("insertOrderedList")}>1. List</Btn>
            <Btn title="Line" {...tb("insertHorizontalRule")}>―</Btn>
            <Btn title="Table" {...tb("insertHTML", "<table><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p><br></p>")}>▦</Btn>
            <Btn title="Undo" {...tb("undo")}>↶</Btn><Btn title="Redo" {...tb("redo")}>↷</Btn><Btn title="Clear formatting" {...tb("removeFormat")}>Tx</Btn>
            <span className="ed-sep" />
            {["logo", "signature", "stamp", "image"].map((k) => <button key={k} type="button" className="ed-btn wide" onClick={() => pickImage(k)}><Icon name="image" size={15} /> {k[0].toUpperCase() + k.slice(1)}</button>)}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
            <span className="ed-grow" />
            <Btn onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}>−</Btn><span className="ed-zoom">{Math.round(zoom * 100)}%</span><Btn onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))}>+</Btn>
          </div>
          <div className="ed-canvas" onPointerDown={() => setSelId(null)}>
            <div className="sheet" style={{ zoom }} onPointerDown={(e) => e.stopPropagation()}>
              <div ref={bodyRef} className="body-edit" contentEditable suppressContentEditableWarning spellCheck={false} onDrop={onDrop} onDragOver={onDragOver} onFocus={() => setSelId(null)} />
              {elements.map((el) => <FloatImg key={el.id} el={el} zoom={zoom} selected={selId === el.id} onSelect={setSelId} onChange={patchEl} />)}
            </div>
          </div>
        </section>

        <aside className="ed-right">
          <h4>Selected image</h4>
          {!sel ? <p className="a-muted small">Click a logo, signature or stamp on the page to move it (drag) or resize it (corner handle). Paste or type freely in the text.</p> : (
            <>
              <div className="ed-thumb"><img src={sel.src} alt="" /></div>
              <label className="a-label">Type</label>
              <select className="a-input" value={sel.kind} onChange={(e) => patchEl(sel.id, { kind: e.target.value })}>{["logo", "signature", "stamp", "image"].map((k) => <option key={k}>{k}</option>)}</select>
              <label className="a-label">Width (px)</label>
              <input className="a-input" type="number" min="20" value={sel.w} onChange={(e) => { const w = Math.max(20, +e.target.value || 20); patchEl(sel.id, { w, h: Math.round(w / (sel.w / sel.h)) }); }} />
              <div className="ed-pos"><div><label className="a-label">X</label><input className="a-input" type="number" value={sel.x} onChange={(e) => patchEl(sel.id, { x: +e.target.value || 0 })} /></div><div><label className="a-label">Y</label><input className="a-input" type="number" value={sel.y} onChange={(e) => patchEl(sel.id, { y: +e.target.value || 0 })} /></div></div>
              <button className="a-btn danger block" onClick={() => removeEl(sel.id)}>Remove image</button>
            </>)}
        </aside>
      </div>

      {preview && <Modal title="Preview" wide onClose={() => setPreview(null)}><div className="ed-preview"><iframe title="preview" sandbox="" srcDoc={preview} /></div></Modal>}
      {tokenOpen && <TokenSave letter={letter} name={name} collect={collect} onClose={() => setTokenOpen(false)} onDone={(t) => nav("/admin/tokens", { state: { newToken: t } })} />}
    </div>
  );
}

function TokenSave({ letter, name, collect, onClose, onDone }) {
  const [saveAs, setSaveAs] = useState("driver_only"), [reason, setReason] = useState(""), [tname, setTname] = useState(name), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try { const c = collect(); const r = await adm("/tokens", { body: { letterId: letter.id, reason, template: { ...c, name: tname, saveAs } } }); onDone(r.token); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Create free-download token" onClose={onClose}>
      <p className="a-muted">For <strong>{letter.driver_name || letter.phone}</strong> ({letter.plate}). The driver can download this letter <strong>once</strong>.</p>
      {err && <div className="a-error">{err}</div>}
      <label className="a-label">Reason (kept in the log)</label>
      <textarea className="a-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What did the driver ask to change?" />
      <label className="a-label">Save this letter</label>
      <label className="a-radio"><input type="radio" checked={saveAs === "driver_only"} onChange={() => setSaveAs("driver_only")} /> Use for this driver only</label>
      <label className="a-radio"><input type="radio" checked={saveAs === "template"} onChange={() => setSaveAs("template")} /> Save as a reusable template</label>
      <label className="a-label">Template name</label>
      <input className="a-input" value={tname} onChange={(e) => setTname(e.target.value)} />
      <div className="a-actions end"><button className="a-btn primary" disabled={busy || reason.trim().length < 3 || !tname.trim()} onClick={go}>{busy ? "Creating…" : "Create token"}</button></div>
    </Modal>
  );
}
