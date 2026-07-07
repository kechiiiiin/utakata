import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, Session, SiteDigest, SiteMeta, UploadFile } from "./types";
import {
  deriveTitle,
  generateSiteId,
  generateToken,
  pickEntry,
  sanitizePath,
  validateTtl,
} from "./util";
import {
  allowedEmails,
  createSession,
  destroySession,
  exchangeCode,
  getSession,
  googleAuthUrl,
  redirectUri,
  signState,
  verifyState,
} from "./auth";
import { renderMarkdown } from "./render";
import { createPage, loginPage, managePage, page, setupIncompletePage } from "./ui";

const MAX_FILES = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 1ファイル 5MB（KV値上限25MBに余裕をもたせる）

const app = new Hono<{ Bindings: Env }>();

type Ctx = Context<{ Bindings: Env }>;

// ---------- 認証 ----------

app.get("/auth/login", async (c) => {
  // 開発用バイパス: DEV_AUTH_BYPASS=1（.dev.vars のみ）の時だけ有効
  if (c.env.DEV_AUTH_BYPASS === "1") {
    await createSession(c, "dev-user", "kechiiiiin@gmail.com");
    return c.redirect("/");
  }
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET || !c.env.SESSION_SECRET) {
    return c.html(setupIncompletePage(redirectUri(c)), 503);
  }
  const state = await signState(c.env.SESSION_SECRET, generateToken());
  return c.redirect(googleAuthUrl(c.env.GOOGLE_CLIENT_ID, redirectUri(c), state));
});

app.get("/auth/callback", async (c) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET } = c.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
    return c.html(setupIncompletePage(redirectUri(c)), 503);
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || !(await verifyState(SESSION_SECRET, state))) {
    return c.text("invalid state", 400);
  }
  const identity = await exchangeCode(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, code, redirectUri(c));
  if (!identity || !identity.emailVerified) return c.text("login failed", 401);
  if (!allowedEmails(c.env).includes(identity.email.toLowerCase())) {
    return c.html(
      page("utakata", `<div class="card"><h2>ごめんなさい</h2><p>このアカウント（${identity.email}）は利用を許可されていません。</p></div>`),
      403
    );
  }
  await createSession(c, identity.sub, identity.email);
  return c.redirect("/");
});

app.get("/auth/logout", async (c) => {
  await destroySession(c);
  return c.redirect("/");
});

async function requireSession(c: Ctx): Promise<Session | null> {
  return getSession(c);
}

// ---------- UI ----------

app.get("/", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.html(loginPage());
  return c.html(createPage(session.email));
});

app.get("/manage", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect("/");
  return c.html(managePage());
});

// ---------- サイト操作ヘルパ ----------

function ttlSecondsFrom(expiresAt: number): number {
  return Math.max(60, Math.ceil((expiresAt - Date.now()) / 1000));
}

function parseFiles(input: unknown): UploadFile[] | string {
  if (!Array.isArray(input) || input.length === 0) return "ファイルがありません";
  if (input.length > MAX_FILES) return `ファイルは最大 ${MAX_FILES} 個までです`;
  const seen = new Set<string>();
  const files: UploadFile[] = [];
  for (const f of input) {
    if (typeof f?.path !== "string" || typeof f?.content !== "string") {
      return "ファイル形式が不正です";
    }
    const path = sanitizePath(f.path);
    if (!path) return `ファイル名が不正です: ${f.path}`;
    if (seen.has(path)) return `ファイル名が重複しています: ${path}`;
    if (new TextEncoder().encode(f.content).length > MAX_FILE_BYTES) {
      return `ファイルが大きすぎます（5MBまで）: ${path}`;
    }
    seen.add(path);
    files.push({ path, content: f.content });
  }
  return files;
}

async function putSite(
  kv: KVNamespace,
  meta: SiteMeta,
  files: UploadFile[]
): Promise<void> {
  const ttl = ttlSecondsFrom(meta.expiresAt);
  await Promise.all([
    kv.put(`site:${meta.id}:meta`, JSON.stringify(meta), { expirationTtl: ttl }),
    ...files.map((f) =>
      kv.put(`site:${meta.id}:file:${f.path}`, f.content, { expirationTtl: ttl })
    ),
  ]);
}

async function loadDigests(kv: KVNamespace, sub: string): Promise<SiteDigest[]> {
  const raw = await kv.get(`user:${sub}:sites`);
  return raw ? (JSON.parse(raw) as SiteDigest[]) : [];
}

async function saveDigests(kv: KVNamespace, sub: string, digests: SiteDigest[]): Promise<void> {
  await kv.put(`user:${sub}:sites`, JSON.stringify(digests)); // TTL なし（永続）
}

async function getOwnedMeta(c: Ctx, session: Session): Promise<SiteMeta | null> {
  const id = c.req.param("id");
  if (!id) return null;
  const raw = await c.env.KV.get(`site:${id}:meta`);
  if (!raw) return null;
  const meta = JSON.parse(raw) as SiteMeta;
  if (meta.owner !== session.sub) return null;
  return meta;
}

// ---------- API ----------

app.post("/api/sites", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: "ログインが必要です" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "JSON が不正です" }, 400);

  const files = parseFiles(body.files);
  if (typeof files === "string") return c.json({ error: files }, 400);
  const ttl = validateTtl(body.expiresIn);
  if (ttl === null) return c.json({ error: "期限が不正です（60秒〜365日）" }, 400);

  const id = generateSiteId();
  const paths = files.map((f) => f.path);
  const entry = pickEntry(paths);
  const entryFile = files.find((f) => f.path === entry)!;
  const now = Date.now();
  const meta: SiteMeta = {
    id,
    owner: session.sub,
    email: session.email,
    title: deriveTitle(entry, entryFile.content),
    entry,
    files: paths.map((p) => ({ path: p })),
    createdAt: now,
    expiresAt: now + ttl * 1000,
  };
  await putSite(c.env.KV, meta, files);

  const digests = await loadDigests(c.env.KV, session.sub);
  digests.unshift({ id, title: meta.title, expiresAt: meta.expiresAt });
  await saveDigests(c.env.KV, session.sub, digests);

  const origin = new URL(c.req.url).origin;
  return c.json({ id, url: `${origin}/s/${id}/`, expiresAt: meta.expiresAt }, 201);
});

app.get("/api/sites", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: "ログインが必要です" }, 401);

  const digests = await loadDigests(c.env.KV, session.sub);
  // lazy cleanup: meta が消えている（期限切れ）id を一覧から掃除
  const checks = await Promise.all(
    digests.map(async (d) => ((await c.env.KV.get(`site:${d.id}:meta`)) ? d : null))
  );
  const alive = checks.filter((d): d is SiteDigest => d !== null);
  if (alive.length !== digests.length) await saveDigests(c.env.KV, session.sub, alive);
  return c.json({ sites: alive });
});

app.put("/api/sites/:id", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: "ログインが必要です" }, 401);
  const meta = await getOwnedMeta(c, session);
  if (!meta) return c.json({ error: "サイトが見つかりません" }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "JSON が不正です" }, 400);
  const files = parseFiles(body.files);
  if (typeof files === "string") return c.json({ error: files }, 400);

  // 旧ファイルを削除してから新内容を残TTLで再put（URL・期限は維持）
  await Promise.all(
    meta.files.map((f) => c.env.KV.delete(`site:${meta.id}:file:${f.path}`))
  );
  const paths = files.map((f) => f.path);
  const entry = pickEntry(paths);
  const entryFile = files.find((f) => f.path === entry)!;
  const newMeta: SiteMeta = {
    ...meta,
    title: deriveTitle(entry, entryFile.content),
    entry,
    files: paths.map((p) => ({ path: p })),
  };
  await putSite(c.env.KV, newMeta, files);

  const digests = await loadDigests(c.env.KV, session.sub);
  const d = digests.find((x) => x.id === meta.id);
  if (d) {
    d.title = newMeta.title;
    await saveDigests(c.env.KV, session.sub, digests);
  }
  const origin = new URL(c.req.url).origin;
  return c.json({ id: meta.id, url: `${origin}/s/${meta.id}/`, expiresAt: meta.expiresAt });
});

app.patch("/api/sites/:id/expiry", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: "ログインが必要です" }, 401);
  const meta = await getOwnedMeta(c, session);
  if (!meta) return c.json({ error: "サイトが見つかりません" }, 404);

  const body = await c.req.json().catch(() => null);
  const ttl = validateTtl(body?.expiresIn);
  if (ttl === null) return c.json({ error: "期限が不正です（延長時点から最大365日）" }, 400);

  // 延長時点から ttl 秒後を新期限に。meta と全 file を新TTLで再put
  const files: UploadFile[] = [];
  for (const f of meta.files) {
    const content = await c.env.KV.get(`site:${meta.id}:file:${f.path}`);
    if (content !== null) files.push({ path: f.path, content });
  }
  const newMeta: SiteMeta = { ...meta, expiresAt: Date.now() + ttl * 1000 };
  await putSite(c.env.KV, newMeta, files);

  const digests = await loadDigests(c.env.KV, session.sub);
  const d = digests.find((x) => x.id === meta.id);
  if (d) {
    d.expiresAt = newMeta.expiresAt;
    await saveDigests(c.env.KV, session.sub, digests);
  }
  return c.json({ id: meta.id, expiresAt: newMeta.expiresAt });
});

app.delete("/api/sites/:id", async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: "ログインが必要です" }, 401);
  const meta = await getOwnedMeta(c, session);
  if (!meta) return c.json({ error: "サイトが見つかりません" }, 404);

  await Promise.all([
    c.env.KV.delete(`site:${meta.id}:meta`),
    ...meta.files.map((f) => c.env.KV.delete(`site:${meta.id}:file:${f.path}`)),
  ]);
  const digests = await loadDigests(c.env.KV, session.sub);
  await saveDigests(
    c.env.KV,
    session.sub,
    digests.filter((d) => d.id !== meta.id)
  );
  return c.json({ ok: true });
});

// ---------- 公開配信（認証不要） ----------

async function serveFile(c: Ctx, id: string, path: string): Promise<Response> {
  const metaRaw = await c.env.KV.get(`site:${id}:meta`);
  if (!metaRaw) return c.text("このサイトは存在しないか、期限が切れて消えました。", 404);
  const meta = JSON.parse(metaRaw) as SiteMeta;

  const target = path === "" ? meta.entry : decodeURIComponent(path);
  const content = await c.env.KV.get(`site:${id}:file:${target}`);
  if (content === null) return c.text("ファイルが見つかりません。", 404);

  c.header("X-Robots-Tag", "noindex");
  const lower = target.toLowerCase();
  if (lower.endsWith(".md")) {
    const html = await renderMarkdown(
      content,
      meta.files.map((f) => f.path),
      `/s/${id}`,
      target === meta.entry ? meta.title : target
    );
    return c.html(html);
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    // html は無加工で配信（JS も動く）
    return c.html(content);
  }
  const type = lower.endsWith(".css")
    ? "text/css; charset=utf-8"
    : lower.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : lower.endsWith(".json")
        ? "application/json; charset=utf-8"
        : lower.endsWith(".svg")
          ? "image/svg+xml"
          : "text/plain; charset=utf-8";
  return c.body(content, 200, { "Content-Type": type });
}

app.get("/s/:id", (c) => c.redirect(`/s/${c.req.param("id")}/`));
app.get("/s/:id/", (c) => serveFile(c, c.req.param("id"), ""));
app.get("/s/:id/*", (c) => {
  const id = c.req.param("id");
  const prefix = `/s/${id}/`;
  const path = new URL(c.req.url).pathname.slice(prefix.length);
  return serveFile(c, id, path);
});

export default app;
