// The company signature and stamp: added to EVERY letter when it is previewed or turned into a PDF for the customer.
// They are not part of the letter text, so staff never see them in the editor and cannot move or remove them.
// Put the two transparent PNG files in  backend/assets/  as  signature.png  and  stamp.png  (restart the backend after replacing them).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.env.SEAL_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets");

// Position of each image on the A4 page (794 x 1123 px), measured from the TOP-LEFT corner of the page:
//   left / top = distance from the left / top edge in px,  width = image width in px (the height follows the image)
//   rotate  = tilt in degrees (negative = counter-clockwise, positive = clockwise, 0 = straight; it turns around the image centre)
//   opacity = 1 solid ... lower = more see-through, like ink on paper
// The stamp is listed last so it sits on top of the signature.
// Values below were measured on letter G2G-2019-000007: the signature sits in the gap between "ከሠላምታ ጋር" and the name,
// the stamp is where it always was (end of the paragraph), tilted 45 degrees.
export const SEAL = [
  { file: "signature.png", left: 63, top: 722, width: 100, rotate: 0, opacity: 1 },
  { file: "stamp.png", left: 553, top: 532, width: 150, rotate: -60, opacity: 0.9 },
];

let cache = null;
function load() {
  if (cache) return cache;
  cache = SEAL.flatMap((s) => {
    try { return [{ ...s, src: `data:image/png;base64,${fs.readFileSync(path.join(DIR, s.file)).toString("base64")}` }]; }
    catch { console.error(`Seal image not found: ${path.join(DIR, s.file)} - letters are produced without it.`); return []; }
  });
  return cache;
}

// letter HTML -> the same HTML with the signature and stamp on it
export function withSeal(html) {
  const imgs = load();
  const end = "</div></body></html>";
  const at = String(html).lastIndexOf(end);
  if (!imgs.length || at < 0 || String(html).includes("data-seal")) return html;
  const tags = imgs.map((s) => `<img data-seal alt="" src="${s.src}" style="position:absolute;left:${s.left}px;top:${s.top}px;width:${s.width}px;height:auto;display:block;transform:rotate(${Number(s.rotate) || 0}deg);transform-origin:center center;opacity:${s.opacity ?? 1}">`).join("");
  return html.slice(0, at) + tags + html.slice(at);
}