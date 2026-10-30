import { useEffect, useRef, useState } from "react";
import OtpInput from "../OtpInput.jsx";
import EthiopianCalendar from "../EthiopianCalendar.jsx";
import { todayEt, compareEt, gregorianToEt, ET_MONTHS } from "../ethiopian.js";
import { dapi, dpdf } from "../api.js";
import "./driver.css";

const SK = "g2g_driver";
const fmtEt = (d) => `${ET_MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return gregorianToEt(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const STEPS = ["Verify", "Details", "Period", "Review", "Letter"];
const STEP_IDX = { start: 0, otp: 0, plate: 0, nodriver: 1, confirm: 1, dates: 2, review: 3, claim: 4, done: 4 };
const loadSess = () => { try { return JSON.parse(sessionStorage.getItem(SK)); } catch { return null; } };
const stepFor = (s) => (s.state === "ready" ? "dates" : s.state === "plate_required" ? "plate" : "nodriver");

export default function DriverApp() {
  const urlRef = new URLSearchParams(location.search).get("ref");
  const [sess, setSessRaw] = useState(loadSess);
  const [step, setStep] = useState(() => (urlRef && loadSess() ? "claim" : loadSess() ? stepFor(loadSess()) : "start"));
  const [phoneInput, setPhoneInput] = useState("");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [cfg, setCfg] = useState({ amount: 0, currency: "ETB", supportPhone: "" });
  const [from, setFrom] = useState(todayEt());
  const [to, setTo] = useState(todayEt());
  const [cash, setCash] = useState(null);
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [retryRef, setRetryRef] = useState(urlRef);
  const claimStarted = useRef(false);

  const setSess = (s) => { setSessRaw(s); s ? sessionStorage.setItem(SK, JSON.stringify(s)) : sessionStorage.removeItem(SK); };
  const reset = () => { setSess(null); setStep("start"); setCode(""); setCash(null); setError(""); setInfo(""); setPhoneInput(""); setPlate(""); history.replaceState({}, "", "/"); };
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
    setSess({ token: d.token, state: d.state, driver: d.driver, phone, plate, pending: d.pending || [] });
    if (d.amount) setCfg({ amount: d.amount, currency: d.currency, supportPhone: d.supportPhone });
    if (d.state === "ready") setStep("confirm");
    else if (d.state === "plate_required") { setStep("plate"); setError(d.message); setPlate(""); }
    else { setStep("nodriver"); setInfo(d.message); }
  });
  const checkPlate = (e) => e?.preventDefault() || run(async () => {
    const d = await dapi("/check-plate", sess.token, { plate });
    if (d.state === "ready") { setSess({ ...sess, state: "ready", driver: d.driver, pending: d.pending || [] }); setStep("confirm"); }
    else setError(d.message);
  });
  const showTransactions = () => {
    if (compareEt(from, to) > 0) return setError("'From' date must not be after 'To' date.");
    run(async () => { setCash(await dapi("/transactions", sess.token, { etFrom: from, etTo: to })); setStep("review"); });
  };
  const pay = () => run(async () => {
    const d = await dapi("/pay", sess.token, sess.state === "ready" ? { etFrom: from, etTo: to } : {});
    sessionStorage.setItem(SK, JSON.stringify(sess)); window.location.href = d.checkoutUrl;
  });
  const claim = async (ref) => {
    setStep("claim"); setError(""); setLoading(true); setRetryRef(ref);
    try { await dpdf("/claim", loadSess()?.token, { reference: ref }); history.replaceState({}, "", "/"); setStep("done"); }
    catch (e) { setError(e.message); if (e.status !== 402) setRetryRef(null); }
    setLoading(false);
  };
  const redeem = () => run(async () => { await dpdf("/redeem-token", sess.token, { token: tokenInput }); setStep("done"); });

  const d = sess?.driver;
  const pending = sess?.pending || [];
  const presets = [["Today", 0, 0], ["Yesterday", 1, 1], ["Last 7 days", 6, 0], ["Last 30 days", 29, 0]];
  const Pending = () => pending.length > 0 && (
    <div className="banner">You already paid for a letter that has not been downloaded.
      {pending.map((p) => <button key={p.merchant_reference} className="btn primary sm" onClick={() => claim(p.merchant_reference)}>Download it now</button>)}
    </div>
  );
  const TokenBox = () => (
    <div className="tokenbox">
      <button className="link" onClick={() => setShowToken(!showToken)}>{showToken ? "Hide" : "Have a download token from G2G staff?"}</button>
      {showToken && (
        <div className="tokenrow">
          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" maxLength={14} />
          <button className="btn primary" onClick={redeem} disabled={loading || tokenInput.replace(/[^A-Z0-9]/gi, "").length < 12}>Download</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="page">
      <div className="shell">
        <header className="brand">
          <div className="logo">G2G</div>
          <div><h1>Clearance Letter</h1><p>Driver cash-collected statement</p></div>
          {sess && step !== "done" && <button className="link" onClick={reset}>Start over</button>}
        </header>
        <ol className="steps">
          {STEPS.map((s, i) => { const cur = STEP_IDX[step]; return <li key={s} className={i === cur ? "active" : i < cur ? "done" : ""}><span>{i < cur ? "✓" : i + 1}</span>{s}</li>; })}
        </ol>
        {error && <div className="alert" role="alert">{error}</div>}
        {info && !error && <div className="notice">{info}</div>}

        {step === "start" && (
          <form className="card" onSubmit={requestOtp}>
            <h2>Welcome</h2>
            <p className="sub">Enter your phone number and vehicle plate number. We'll text you a verification code.</p>
            <label>Phone number</label>
            <div className="phone">
              <span className="prefix">🇪🇹 +251</span>
              <input type="tel" inputMode="tel" placeholder="911 234 567" autoFocus value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
            </div>
            <label>Vehicle plate number</label>
            <input className="plate" placeholder="e.g. A12345" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
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
            <input className="plate" autoFocus placeholder="e.g. A12345" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
            <button className="btn primary block" disabled={loading || plate.trim().length < 3}>{loading ? <span className="spin" /> : "Continue"}</button>
          </form>
        )}

        {step === "nodriver" && (
          <div className="card">
            <h2>We couldn't find your record</h2>
            <p className="sub">You can still get your letter. Pay the fee and your letter downloads right away.</p>
            <Pending />
            <div className="fee"><span>Letter fee</span><strong>{money(cfg.amount)} {cfg.currency}</strong></div>
            <button className="btn primary block" onClick={pay} disabled={loading}>{loading ? <span className="spin" /> : "Pay with Chapa"}</button>
            {cfg.supportPhone && <p className="support">Need help? Call G2G on <strong>{cfg.supportPhone}</strong></p>}
            <TokenBox />
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
            <TokenBox />
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
            <p className="sub small">After payment you can download your letter <strong>once</strong>.</p>
            <div className="row"><button className="btn" onClick={() => setStep("dates")}>Change dates</button><button className="btn primary" onClick={pay} disabled={loading}>{loading ? <span className="spin" /> : "Pay with Chapa"}</button></div>
          </div>
        )}

        {step === "claim" && (
          <div className="card center-card">
            {loading ? <><span className="spin dark" /><h2>Confirming your payment…</h2><p className="sub">Your letter will download automatically.</p></> :
              <><h2>We couldn't finish yet</h2><div className="row center">
                {retryRef && <button className="btn primary" onClick={() => claim(retryRef)}>Check again</button>}
                <button className="btn" onClick={reset}>Start over</button></div></>}
          </div>
        )}

        {step === "done" && (
          <div className="card center-card">
            <div className="tick">✓</div>
            <h2>Your letter has been downloaded</h2>
            <p className="sub">Check your downloads folder. This download cannot be repeated.</p>
            {cfg.supportPhone && <p className="support">For any support contact G2G on <strong>{cfg.supportPhone}</strong></p>}
            <button className="btn primary" onClick={reset}>Finish</button>
          </div>
        )}
        <footer>Need a custom letter? Contact G2G staff.</footer>
      </div>
    </div>
  );
}
