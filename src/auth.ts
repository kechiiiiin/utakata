import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, Session } from "./types";
import { generateToken } from "./util";

const SESSION_COOKIE = "utakata_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30日

type Ctx = Context<{ Bindings: Env }>;

export function allowedEmails(env: Env): string[] {
  return (env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function createSession(c: Ctx, sub: string, email: string): Promise<void> {
  const token = generateToken();
  const session: Session = {
    sub,
    email,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  await c.env.KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(c: Ctx): Promise<Session | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const raw = await c.env.KV.get(`session:${token}`);
  if (!raw) return null;
  const session = JSON.parse(raw) as Session;
  if (session.expiresAt < Date.now()) return null;
  return session;
}

export async function destroySession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.KV.delete(`session:${token}`);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** OAuth の state を HMAC-SHA256 で署名（CSRF対策） */
export async function signState(secret: string, nonce: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(nonce));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${nonce}.${hex}`;
}

export async function verifyState(secret: string, state: string): Promise<boolean> {
  const dot = state.indexOf(".");
  if (dot < 0) return false;
  const nonce = state.slice(0, dot);
  const expected = await signState(secret, nonce);
  return timingSafeEqual(expected, state);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function redirectUri(c: Ctx): string {
  const url = new URL(c.req.url);
  return `${url.origin}/auth/callback`;
}

export function googleAuthUrl(clientId: string, redirect: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean };

/** 認可コードをトークンに交換し、id_token の payload から本人情報を得る。
 *  Google のトークンエンドポイントと直接 TLS 通信で得た id_token のため署名検証は不要（OIDC Core 3.1.3.7）。 */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirect: string
): Promise<GoogleIdentity | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) return null;
  const parts = data.id_token.split(".");
  if (parts.length !== 3) return null;
  const payload = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")), (ch) =>
        ch.charCodeAt(0)
      )
    )
  ) as { sub?: string; email?: string; email_verified?: boolean; aud?: string; iss?: string };
  if (!payload.sub || !payload.email) return null;
  if (payload.aud !== clientId) return null;
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com")
    return null;
  return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true };
}
