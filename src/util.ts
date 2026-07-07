const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 128bit の暗号論的乱数を base62 化した推測不能ID（22文字固定） */
export function generateSiteId(): string {
  return randomBase62(16, 22);
}

/** セッショントークン（192bit → 33文字） */
export function generateToken(): string {
  return randomBase62(24, 33);
}

function randomBase62(byteLength: number, padTo: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  while (out.length < padTo) out = "0" + out;
  return out;
}

export const MAX_TTL_SECONDS = 365 * 24 * 60 * 60; // 365日
export const MIN_TTL_SECONDS = 60; // KV の expirationTtl 下限

/** TTL秒を検証。範囲外なら null */
export function validateTtl(seconds: unknown): number | null {
  const n = typeof seconds === "number" ? Math.floor(seconds) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n < MIN_TTL_SECONDS || n > MAX_TTL_SECONDS) return null;
  return n;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ファイルパスの正規化と検証。不正なら null */
export function sanitizePath(p: string): string | null {
  const cleaned = p.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!cleaned || cleaned.length > 512) return null;
  const parts = cleaned.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return null;
  }
  return cleaned;
}

/** entry file の決定: index.md / index.html 優先、なければ先頭 */
export function pickEntry(paths: string[]): string {
  for (const name of ["index.md", "index.html"]) {
    const hit = paths.find((p) => p.toLowerCase() === name);
    if (hit) return hit;
  }
  return paths[0];
}

/** md の最初の見出し → タイトル。なければファイル名 */
export function deriveTitle(entry: string, content: string): string {
  if (entry.toLowerCase().endsWith(".md")) {
    const m = content.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim();
  }
  if (entry.toLowerCase().endsWith(".html")) {
    const m = content.match(/<title>([^<]*)<\/title>/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return entry;
}
