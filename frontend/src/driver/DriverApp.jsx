import { useEffect, useRef, useState } from "react";
import OtpInput from "../OtpInput.jsx";
import EthiopianCalendar from "../EthiopianCalendar.jsx";
import { todayEt, compareEt, gregorianToEt, ET_MONTHS } from "../ethiopian.js";
import { dapi } from "../api.js";
import "./driver.css";

const SK = "g2g_driver";
const fmtEt = (d) => `${ET_MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return gregorianToEt(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const STEPS = ["Verify", "Details", "Period", "Review", "Letter"];
const STEP_IDX = { start: 0, otp: 0, plate: 0, nodriver: 1, confirm: 1, dates: 2, review: 3, claim: 4, done: 5 }; // done = every step ticked
const loadSess = () => { try { return JSON.parse(sessionStorage.getItem(SK)); } catch { return null; } };
const stepFor = (s) => (s.state === "ready" ? "dates" : s.state === "plate_required" ? "plate" : "nodriver");

export default function DriverApp() {
  const urlRef = new URLSearchParams(location.search).get("ref");
  const [sess, setSessRaw] = useState(loadSess);
  const [step, setStep] = useState(() => (urlRef && loadSess() ? "claim" : loadSess() ? stepFor(loadSess()) : "start"));
  const [phoneInput, setPhoneInput] = useState("");
  const [plate, setPlate] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [logoOk, setLogoOk] = useState(true);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [cfg, setCfg] = useState({ amount: 0, currency: "ETB", supportPhone: "" });
  const [from, setFrom] = useState(todayEt());
  const [to, setTo] = useState(todayEt());
  const [cash, setCash] = useState(null);
  const [letterRef, setLetterRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [retryRef, setRetryRef] = useState(urlRef);
  const claimStarted = useRef(false);

  const setSess = (s) => { setSessRaw(s); s ? sessionStorage.setItem(SK, JSON.stringify(s)) : sessionStorage.removeItem(SK); };
  const reset = () => { setSess(null); setStep("start"); setCode(""); setCash(null); setError(""); setInfo(""); setPhoneInput(""); setPlate(""); setFirstName(""); setLastName(""); setLetterRef(""); history.replaceState({}, "", "/"); };
  const run = async (fn) => { setError(""); setLoading(true); try { await fn(); } catch (e) { setError(e.message); if (e.status === 401 && sess) { setSess(null); setStep("start"); } } setLoading(false); };

  useEffect(() => { if (resendIn <= 0) return; const t = setTimeout(() => setResendIn((s) => s - 1), 1000); return () => clearTimeout(t); }, [resendIn]);
  useEffect(() => { dapi("/config").then(setCfg).catch(() => {}); }, []);
  useEffect(() => { if (step === "claim" && urlRef && !claimStarted.current) { claimStarted.current = true; claim(urlRef); } }, []); // eslint-disable-line

  const nineDigits = phoneInput.replace(/\D/g, "").replace(/^0/, "");

  const requestOtp = (e) => e?.preventDefault() || run(async () => {
    const d = await dapi("/request-otp", null, { phone: "0" + nineDigits, plate });
    setPhone(d.phone); setCode(""); setResendIn(d.resendIn); setStep("otp");
  });
  const verifyOtp = (e) => e?.preventDefault() || run(async () => {
    const d = await dapi("/verify-otp", null, { phone, code });
    setSess({ token: d.token, state: d.state, driver: d.driver, phone, plate, pending: d.pending || [], awaiting: d.awaiting || [] });
    if (d.amount) setCfg({ amount: d.amount, currency: d.currency, supportPhone: d.supportPhone });
    if (d.state === "ready") setStep("confirm");
    else if (d.state === "plate_required") { setStep("plate"); setError(d.message); setPlate(""); }
    else { setStep("nodriver"); setInfo(d.message); }
  });
  const checkPlate = (e) => e?.preventDefault() || run(async () => {
    const d = await dapi("/check-plate", sess.token, { plate });
    if (d.state === "ready") { setSess({ ...sess, state: "ready", driver: d.driver, pending: d.pending || [], awaiting: d.awaiting || [] }); setStep("confirm"); }
    else setError(d.message);
  });
  const showTransactions = () => {
    if (compareEt(from, to) > 0) return setError("'From' date must not be after 'To' date.");
    run(async () => { setCash(await dapi("/transactions", sess.token, { etFrom: from, etTo: to })); setStep("review"); });
  };
  const namePart = (v) => v.trim().length >= 2 && /^[\p{L}\p{M}][\p{L}\p{M} .'\-]*$/u.test(v.trim());
  const nameOk = namePart(firstName) && namePart(lastName);
  const pay = () => {
    if (sess.state !== "ready" && compareEt(from, to) > 0) return setError("'From' date must not be after 'To' date.");
    run(async () => {
    const d = await dapi("/pay", sess.token, sess.state === "ready" ? { etFrom: from, etTo: to } : { firstName: firstName.trim(), lastName: lastName.trim(), etFrom: from, etTo: to });
    sessionStorage.setItem(SK, JSON.stringify(sess)); window.location.href = d.checkoutUrl;
    });
  };
  const claim = async (ref) => {
    setStep("claim"); setError(""); setLoading(true); setRetryRef(ref);
    try { const r = await dapi("/claim", loadSess()?.token, { reference: ref }); setLetterRef(r.letterRef || ""); history.replaceState({}, "", "/"); setStep("done"); }
    catch (e) { setError(e.message); if (e.status !== 402) setRetryRef(null); }
    setLoading(false);
  };

  const d = sess?.driver;
  const pending = sess?.pending || [];
  const presets = [["Today", 0, 0], ["Yesterday", 1, 1], ["Last 7 days", 6, 0], ["Last 30 days", 29, 0]];
  const awaiting = sess?.awaiting || [];
  const Pending = () => (
    <>
      {pending.length > 0 && (
        <div className="banner">You already paid for a letter. Tap to finish so our team can prepare it.
          {pending.map((p) => <button key={p.merchant_reference} className="btn primary sm" onClick={() => claim(p.merchant_reference)}>Finish</button>)}
        </div>
      )}
      {awaiting.length > 0 && (
        <div className="banner">Your letter {awaiting.map((a) => a.letter_ref).join(", ")} is being checked by our team. We will text the download link to your phone as soon as it is ready.</div>
      )}
    </>
  );

  return (
    <div className="page">
      <div className="shell">
        <header className="brand">
          <div className="brand-plate">
            {logoOk ? <img className="brand-logo" src=".../../public/logo-full.png" alt="G2G IT Solutions" onError={() => setLogoOk(false)} /> : <div className="brand-fallback">G2G IT SOLUTIONS</div>}
          </div>
          <h1>Clearance Letter</h1>
          <p>Driver cash-collected statement</p>
          <div className="rule" />
          {sess && step !== "done" && <button className="link" onClick={reset}>Start over</button>}
        </header>
        <div className="steps" role="list">
          <div className="bar" style={{ width: `${(86 * STEP_IDX[step]) / (STEPS.length - 1)}%` }} />
          {STEPS.map((s, i) => { const cur = STEP_IDX[step]; return <div role="listitem" key={s} className={"st" + (i === cur ? " active" : i < cur ? " done" : "")}><span>{i < cur ? "✓" : i + 1}</span>{s}</div>; })}
        </div>
        {error && <div className="alert" role="alert">{error}</div>}
        {info && !error && <div className="notice">{info}</div>}

        {step === "start" && (
          <form className="card" onSubmit={requestOtp}>
            <h2>Welcome</h2>
            <p className="sub">Enter your phone number and vehicle plate number. We'll text you a verification code.</p>
            <label>Phone number</label>
            <div className="phone">
              <span className="prefix">+251</span>
              <input type="tel" inputMode="tel" placeholder="911 234 567" autoFocus value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
            </div>
            <label>Vehicle plate number</label>
            <div className="phone plate-field">
              <span className="prefix">Plate</span>
              <input type="text" placeholder="A12345" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={25} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, ""))} />
            </div>
            <p className="hint">Letters and numbers only, as shown on your vehicle plate.</p>
            <button className="btn primary block" disabled={loading || nineDigits.length < 9 || plate.trim().length < 3}>{loading ? <span className="spin" /> : "Next"}</button>
          </form>
        )}

        {step === "otp" && (
          <form className="card" onSubmit={verifyOtp}>
            <h2>Enter the code</h2>
            <p className="sub">We sent a 6-digit code to <strong>{phone}</strong>.</p>
            <OtpInput value={code} onChange={setCode} disabled={loading} />
            <button className="btn primary block" disabled={loading || code.length !== 6}>{loading ? <span className="spin" /> : "Verify"}</button>
            <div className="row center">
              <button type="button" className="link" onClick={() => { setStep("start"); setError(""); }}>Change number</button><span className="dot">•</span>
              <button type="button" className="link" disabled={resendIn > 0 || loading} onClick={requestOtp}>{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</button>
            </div>
          </form>
        )}

        {step === "plate" && (
          <form className="card" onSubmit={checkPlate}>
            <h2>Check your plate number</h2>
            <p className="sub">Your phone is verified. Please enter the plate number of your registered vehicle.</p>
            <label>Vehicle plate number</label>
            <div className="phone plate-field">
              <span className="prefix">Plate</span>
              <input type="text" autoFocus placeholder="A12345" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={25} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, ""))} />
            </div>
            <p className="hint">Letters and numbers only, as shown on your vehicle plate.</p>
            <button className="btn primary block" disabled={loading || plate.trim().length < 3}>{loading ? <span className="spin" /> : "Continue"}</button>
          </form>
        )}

        {step === "nodriver" && (
          <div className="card wide">
            <h2>We couldn't find your record</h2>
            <p className="sub">You can still get your letter. Enter your name and choose the period, then pay the fee.</p>
            <Pending />
            <div className="names">
              <div className="name-field">
                <label htmlFor="fn">First name <span className="req">*</span></label>
                <div className={"box" + (namePart(firstName) ? " ok" : "")}>
                  <input id="fn" type="text" autoComplete="given-name" autoFocus placeholder="e.g. Abebe" maxLength={40} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <small>As written on your ID</small>
              </div>
              <div className="name-field">
                <label htmlFor="ln">Second name <span className="req">*</span></label>
                <div className={"box" + (namePart(lastName) ? " ok" : "")}>
                  <input id="ln" type="text" autoComplete="family-name" placeholder="e.g. Kebede" maxLength={40} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <small>Your father's name</small>
              </div>
            </div>
            <p className="hint">Vehicle plate number: <strong>{sess?.plate || "—"}</strong></p>
            <div className="section-title">Period</div>
            <p className="sub small">Choose dates in the Ethiopian calendar.</p>
            <div className="chips">{presets.map(([l, a, b]) => <button key={l} className="chip" onClick={() => { setFrom(etDaysAgo(a)); setTo(etDaysAgo(b)); }}>{l}</button>)}</div>
            <div className="cals">
              <EthiopianCalendar key={"f" + fmtEt(from)} label="From" value={from} onChange={(x) => { setFrom(x); if (compareEt(x, to) > 0) setTo(x); }} />
              <EthiopianCalendar key={"t" + fmtEt(to)} label="To" value={to} min={from} onChange={setTo} />
            </div>
            <div className="range">{fmtEt(from)} <span>→</span> {fmtEt(to)}</div>
            <div className="fee"><span>Letter fee</span><strong>{money(cfg.amount)} {cfg.currency}</strong></div>
            <p className="sub small">After payment, our team checks your letter and sends the <strong>download link to your phone by SMS</strong>.</p>
            <button className="btn primary block" onClick={pay} disabled={loading || !nameOk}>{loading ? <span className="spin" /> : "Pay with Chapa"}</button>
            {cfg.supportPhone && <p className="support">Need help? Call G2G on <strong>{cfg.supportPhone}</strong></p>}
          </div>
        )}

        {step === "confirm" && d && (
          <div className="card">
            <h2>Is this you?</h2>
            <p className="sub">Please check your details before continuing.</p>
            <Pending />
            <div className="profile"><div className="avatar">{(d.first_name[0] || "") + (d.last_name[0] || "")}</div><div><div className="pname">{d.name}</div><div className="psub">{d.phone}</div></div></div>
            <dl className="info">
              {[["Plate number", d.plate], ["Vehicle", [d.vehicle_brand, d.vehicle_model, d.vehicle_year].filter(Boolean).join(" ")], ["Color", d.vehicle_color], ["License no.", d.license_number], ["Status", d.work_status.replace("_", " ")]]
                .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
            </dl>
            <div className="row"><button className="btn" onClick={reset}>Back</button><button className="btn primary" onClick={() => setStep("dates")}>Continue</button></div>
          </div>
        )}

        {step === "dates" && (
          <div className="card wide">
            <h2>Select period</h2>
            <p className="sub">Choose dates in the Ethiopian calendar.</p>
            <Pending />
            <div className="chips">{presets.map(([l, a, b]) => <button key={l} className="chip" onClick={() => { setFrom(etDaysAgo(a)); setTo(etDaysAgo(b)); }}>{l}</button>)}</div>
            <div className="cals">
              <EthiopianCalendar key={"f" + fmtEt(from)} label="From" value={from} onChange={(x) => { setFrom(x); if (compareEt(x, to) > 0) setTo(x); }} />
              <EthiopianCalendar key={"t" + fmtEt(to)} label="To" value={to} min={from} onChange={setTo} />
            </div>
            <div className="range">{fmtEt(from)} <span>→</span> {fmtEt(to)}</div>
            <div className="row"><button className="btn" onClick={() => setStep("confirm")}>Back</button><button className="btn primary" onClick={showTransactions} disabled={loading}>{loading ? <span className="spin" /> : "Show transactions"}</button></div>
          </div>
        )}

        {step === "review" && cash && (
          <div className="card wide">
            <div className="summary">
              <div className="muted">Total cash collected</div>
              <div className="big">{money(cash.total)} <small>{cash.currency}</small></div>
              <div className="pill">{cash.count} transaction{cash.count === 1 ? "" : "s"}</div>
              <div className="muted small">{fmtEt(from)} – {fmtEt(to)}<br />(GC {cash.gcFrom} – {cash.gcTo})</div>
            </div>
            <div className="scroll"><table className="list">
              <thead><tr><th>Date</th><th>Category</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {cash.transactions.map((t) => <tr key={t.id}><td>{new Date(t.event_at).toLocaleString()}</td><td>{t.category_name}</td><td className="r">{money(t.amount)}</td></tr>)}
                {!cash.count && <tr><td colSpan="3" className="empty">No cash collected in this period.</td></tr>}
              </tbody></table></div>
            <div className="fee"><span>Letter fee</span><strong>{money(cash.amount)} {cash.currency}</strong></div>
            <p className="sub small">After payment, our team checks your letter and sends the <strong>download link to your phone by SMS</strong>.</p>
            <div className="row"><button className="btn" onClick={() => setStep("dates")}>Change dates</button><button className="btn primary" onClick={pay} disabled={loading}>{loading ? <span className="spin" /> : "Pay with Chapa"}</button></div>
          </div>
        )}

        {step === "claim" && (
          <div className="card center-card">
            {loading ? <><span className="spin dark" /><h2>Confirming your payment…</h2><p className="sub">This takes a few seconds.</p></> :
              <><h2>We couldn't finish yet</h2><div className="row center">
                {retryRef && <button className="btn primary" onClick={() => claim(retryRef)}>Check again</button>}
                <button className="btn" onClick={reset}>Start over</button></div></>}
          </div>
        )}

        {step === "done" && (
          <div className="card center-card">
            <div className="tick"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
            <h2>Payment received</h2>
            {letterRef && <div className="ref-chip">{letterRef}</div>}
            <p className="sub">Our team is now checking your letter. <strong>Please check your SMS messages</strong> — we will text the download link to <strong>{sess?.phone || "your phone"}</strong> shortly.</p>
            <div className="next-box">
              <strong>What happens next</strong>
              <ol><li>We prepare and check your letter.</li><li>You receive an SMS with a link.</li><li>Tap the link — your letter downloads automatically.</li></ol>
            </div>
            {cfg.supportPhone && <p className="support">For any support contact G2G on <strong>{cfg.supportPhone}</strong></p>}
            <button className="btn primary" onClick={reset}>Finish</button>
          </div>
        )}
        <footer>Questions about your letter? Contact G2G staff.<br /><b>G2G IT Solutions</b> · Redefining IT Partnership</footer>
      </div>
    </div>
  );
}