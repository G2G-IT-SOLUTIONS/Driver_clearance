import { useRef } from "react";

// 6 separate boxes: auto-advance, backspace, paste support
export default function OtpInput({ value, onChange, length = 6, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  const setAt = (i, d) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join(""));
  };

  const handleChange = (i, e) => {
    const d = e.target.value.replace(/\D/g, "").slice(-1);
    if (!d) return;
    setAt(i, d);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) setAt(i, "");
      else if (i > 0) { setAt(i - 1, ""); refs.current[i - 1]?.focus(); }
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div className="otp" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className={"otp-box" + (d ? " filled" : "")}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}
