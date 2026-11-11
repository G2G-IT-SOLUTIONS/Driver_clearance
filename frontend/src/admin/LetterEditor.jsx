import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adm } from "../api.js";
import { Icon, Modal, fmt } from "./ui.jsx";
import { FloatImg, readImage, DEFAULTS, rid } from "./TemplateEditor.jsx";
import { layoutOf, showTokens } from "./docTools.js";

// Staff edit the text / images of a letter that a customer PAID for. There is no "new letter" here and no phone number:
// the page only opens an existing letter. Every saved edit is counted and written to the letter's history.
export default function LetterEditor() {
  const { id } = useParams(), nav = useNavigate();
  const [l, setL] = useState(null), [elements, setElements] = useState([]), [orig, setOrig] = useState("[]");
  const [typed, setTyped] = useState(false), [selId, setSelId] = useState(null), [zoom, setZoom] = useState(1);
  const [confirm, setConfirm] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const bodyRef = useRef(null), saved = useRef(null), fileRef = useRef(null), fileKind = useRef("image");
  const back = `/admin/letters?tab=${l?.status === "sent" ? "all" : "unsent"}&id=${id}`;

  useEffect(() => {
    adm(`/letters/${id}/editable`).then((d) => { setL(d); setElements(d.elements || []); setOrig(JSON.stringify(d.elements || [])); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { if (l && bodyRef.current) bodyRef.current.innerHTML = l.body_html || ""; }, [l]);
  useEffect(() => {
    const h = () => { const s = getSelection(); if (s.rangeCount && bodyRef.current?.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange(); };
    document.addEventListener("selectionchange", h); return () => document.removeEventListener("selectionchange", h);
  }, []);
  useEffect(() => {
    const k = (e) => { if ((e.key === "Delete" || e.key === "Backspace") && selId && document.activeElement !== bodyRef.current && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) removeEl(selId); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line

  const lim = l?.limits;
  const dirty = typed || JSON.stringify(elements) !== orig;
  const restore = () => { bodyRef.current.focus(); if (saved.current) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved.current); } };
  const cmd = (c, v) => { restore(); document.execCommand("styleWithCSS", false, true); document.execCommand(c, false, v); setTyped(true); };
  const tb = (c, v) => ({ onMouseDown: (e) => e.preventDefault(), onClick: () => cmd(c, v) });
  const pickImage = (kind) => { fileKind.current = kind; fileRef.current.click(); };
  const onFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const { src, ratio } = await readImage(f), d = DEFAULTS[fileKind.current], el = { id: rid(), kind: fileKind.current, src, x: d.x, y: d.y, w: d.w, h: Math.round(d.w / ratio) }; setElements((x) => [...x, el]); setSelId(el.id); }
    catch { setErr("That image could not be read."); }
  };
  const patchEl = useCallback((eid, p) => setElements((x) => x.map((e) => (e.id === eid ? { ...e, ...p } : e))), []);
  const removeEl = (eid) => { setElements((x) => x.filter((e) => e.id !== eid)); setSelId(null); };
  const sel = elements.find((x) => x.id === selId);

  const save = async () => {
    setBusy(true); setErr("");
    try { await adm(`/letters/${id}`, { method: "PUT", body: { body_html: bodyRef.current.innerHTML, elements } }); nav(back); }
    catch (e) { setErr(e.message); setConfirm(false); }
    setBusy(false);
  };
  const Btn = ({ children, title, ...p }) => <button type="button" className="ed-btn" title={title} {...p}>{children}</button>;

  if (!l) return <div className="ed"><header className="ed-top"><Link to="/admin/letters" className="a-icon"><Icon name="back" /></Link>{err && <span className="ed-err">{err}</span>}</header></div>;
  const blocked = !lim.can_edit;
  const L = layoutOf(l.page), hasHdr = L.header_on && !!l.header_html, hasFtr = L.footer_on && !!l.footer_html; // header / footer come from the template: shown, not editable

  return (
    <div className="ed">
      <header className="ed-top">
        <Link to={back} className="a-icon" title="Back without saving"><Icon name="back" /></Link>
        <div className="ed-title"><strong>{l.letter_ref}</strong><small>{l.driver_name || "Customer"} · {l.plate || "—"}</small></div>
        <span className={"ed-chip" + (blocked ? " off" : "")}>Edits left: {lim.edits_left} of {l.max_edits}</span>
        <span className="ed-chip">Editing open until {fmt(lim.edit_until)}</span>
        <div className="a-actions">
          {err && <span className="ed-err">{err}</span>}
          <Link to={back} className="a-btn">Cancel</Link>
          <button className="a-btn primary" disabled={blocked || !dirty || busy} onClick={() => setConfirm(true)}><Icon name="edit" size={16} /> Save changes</button>
        </div>
      </header>
      {blocked && <div className="ed-banner">{lim.edit_block} You can still read the letter below. An admin can change the limits for this letter.</div>}

      <div className="ed-body ed-body-2">
        <section className="ed-center">
          <div className="ed-toolbar">
            <select className="ed-sel" defaultValue="" disabled={blocked} onChange={(e) => { if (e.target.value) cmd("formatBlock", e.target.value); e.target.value = ""; }}><option value="">Style</option><option value="P">Paragraph</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option></select>
            <select className="ed-sel" defaultValue="" disabled={blocked} onChange={(e) => { if (e.target.value) cmd("fontSize", e.target.value); e.target.value = ""; }}><option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Medium</option><option value="5">Large</option><option value="6">X-Large</option></select>
            <span className="ed-sep" />
            <Btn title="Bold" {...tb("bold")}><b>B</b></Btn><Btn title="Italic" {...tb("italic")}><i>I</i></Btn><Btn title="Underline" {...tb("underline")}><u>U</u></Btn>
            <span className="ed-sep" />
            <Btn title="Align left" {...tb("justifyLeft")}>⟸</Btn><Btn title="Center" {...tb("justifyCenter")}>≡</Btn><Btn title="Align right" {...tb("justifyRight")}>⟹</Btn>
            <span className="ed-sep" />
            <Btn title="Undo" {...tb("undo")}>↶</Btn><Btn title="Redo" {...tb("redo")}>↷</Btn>
            <span className="ed-sep" />
            {["logo"].map((k) => <button key={k} type="button" className="ed-btn wide" disabled={blocked} onClick={() => pickImage(k)}><Icon name="image" size={15} /> {k[0].toUpperCase() + k.slice(1)}</button>)}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
            <span className="ed-grow" />
            <Btn onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}>−</Btn><span className="ed-zoom">{Math.round(zoom * 100)}%</span><Btn onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))}>+</Btn>
          </div>
          <div className="ed-canvas" onPointerDown={() => setSelId(null)}>
            <div className="sheet" style={{ zoom }} onPointerDown={(e) => e.stopPropagation()}>
              {hasHdr && <div className="hf-wrap hdr ro" style={{ height: L.hh }}><div className="hf-edit" style={{ padding: `0 ${L.mr}px 0 ${L.ml}px` }} dangerouslySetInnerHTML={{ __html: showTokens(l.header_html) }} /></div>}
              <div ref={bodyRef} className="body-edit" style={{ padding: `${L.top}px ${L.mr}px ${L.bottom}px ${L.ml}px` }} contentEditable={!blocked} suppressContentEditableWarning spellCheck={false} onInput={() => setTyped(true)} onFocus={() => setSelId(null)} />
              {hasFtr && <div className="hf-wrap ftr ro" style={{ height: L.fh }}><div className="hf-edit" style={{ padding: `0 ${L.mr}px 0 ${L.ml}px` }} dangerouslySetInnerHTML={{ __html: showTokens(l.footer_html) }} /></div>}
              {elements.map((el) => <FloatImg key={el.id} el={el} zoom={zoom} selected={selId === el.id && !blocked} onSelect={(x) => !blocked && setSelId(x)} onChange={(a, p) => { if (!blocked) patchEl(a, p); }} />)}
            </div>
          </div>
        </section>
        <aside className="ed-right">
          <h4>Rules for this letter</h4>
          <ul className="ed-rules">
            <li>Only the text of this letter can be changed. The company signature and stamp are added automatically to every letter and cannot be edited.</li>
            {(hasHdr || hasFtr) && <li>The header and footer (shown greyed) come from the template and repeat on every page. They cannot be edited here.</li>}
            <li>The SMS always goes to the number the customer verified. Staff cannot change it.</li>
            <li>Every saved edit uses <strong>1 of {l.max_edits}</strong> edits and is recorded in the letter's history with what was added and removed.</li>
            <li>Edits close <strong>{l.edit_window_days} day{l.edit_window_days === 1 ? "" : "s"}</strong> after the letter was created.</li>
          </ul>
          {sel && !blocked && (
            <>
              <h4>Selected image</h4>
              <div className="ed-thumb"><img src={sel.src} alt="" /></div>
              <label className="a-label">Width (px)</label>
              <input className="a-input" type="number" min="20" value={sel.w} onChange={(e) => { const w = Math.max(20, +e.target.value || 20); patchEl(sel.id, { w, h: Math.round(w / (sel.w / sel.h)) }); }} />
              <button className="a-btn danger block" onClick={() => removeEl(sel.id)}>Remove image</button>
            </>)}
        </aside>
      </div>

      {confirm && (
        <Modal title="Save this edit?" onClose={() => !busy && setConfirm(false)}>
          <p className="a-muted">This uses <strong>edit {l.edit_count + 1} of {l.max_edits}</strong>. After saving, {lim.edits_left - 1} edit{lim.edits_left - 1 === 1 ? "" : "s"} will be left. The change is recorded permanently with your name.</p>
          <div className="a-actions end"><button className="a-btn" disabled={busy} onClick={() => setConfirm(false)}>Keep editing</button><button className="a-btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save edit"}</button></div>
        </Modal>
      )}
    </div>
  );
}