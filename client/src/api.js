export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

async function call(url, { method, body, token, blob } = {}) {
  const res = await fetch(url, {
    method: method || (body ? "POST" : "GET"),
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const err = new Error(d.message || "Something went wrong");
    err.status = res.status; err.retry = d.retry; throw err;
  }
  if (blob) {
    const cd = res.headers.get("Content-Disposition") || "";
    saveBlob(await res.blob(), (cd.match(/filename="?([^"]+)"?/) || [])[1] || "letter.pdf");
    return { ok: true };
  }
  return res.json();
}

// ---- driver ----
export const dapi = (path, token, body) => call(`/api/driver${path}`, { token, body });
export const dpdf = (path, token, body) => call(`/api/driver${path}`, { token, body, blob: true });

// ---- admin ----
export const ADMIN_TOKEN = "g2g_admin_token", ADMIN_USER = "g2g_admin_user";
export const adminUser = () => { try { return JSON.parse(localStorage.getItem(ADMIN_USER)); } catch { return null; } };
export const adminLogout = () => { localStorage.removeItem(ADMIN_TOKEN); localStorage.removeItem(ADMIN_USER); };
export async function adm(path, { body, method, blob } = {}) {
  try { return await call(`/api/admin${path}`, { body, method, blob, token: localStorage.getItem(ADMIN_TOKEN) }); }
  catch (e) { if (e.status === 401 && path !== "/auth/login") { adminLogout(); location.href = "/admin/login"; } throw e; }
}
