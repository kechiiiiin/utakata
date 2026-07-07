import { escapeHtml } from "./util";

const baseStyle = `
  :root { --ink: #3b4252; --accent: #7ba7cc; --accent-dark: #5e81ac; --mist: #eef4f9; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; color: var(--ink);
         font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
         background: linear-gradient(160deg, #f6fafd 0%, #eef4f9 55%, #e9f1f7 100%); }
  main { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  header.site { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
  header.site h1 { font-size: 1.6rem; margin: 0; font-weight: 600; letter-spacing: .12em; color: var(--accent-dark); }
  header.site h1 a { color: inherit; text-decoration: none; }
  header.site .tagline { color: #8fa3b8; font-size: .85rem; }
  header.site nav { margin-left: auto; font-size: .9rem; display: flex; gap: 1rem; align-items: baseline; }
  header.site nav a { color: var(--accent-dark); text-decoration: none; }
  header.site nav a:hover { text-decoration: underline; }
  .card { background: rgba(255,255,255,.85); border: 1px solid #dde8f1; border-radius: 14px;
          padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 12px rgba(94,129,172,.06); }
  button, .btn { background: var(--accent); color: #fff; border: none; border-radius: 8px;
          padding: .55rem 1.2rem; font-size: .95rem; cursor: pointer; }
  button:hover, .btn:hover { background: var(--accent-dark); }
  button.ghost { background: transparent; color: var(--accent-dark); border: 1px solid #c3d5e4; }
  button.ghost:hover { background: var(--mist); }
  button.danger { background: transparent; color: #bf616a; border: 1px solid #e4c3c7; }
  button.danger:hover { background: #faf0f1; }
  input[type=text], input[type=number], textarea, select {
    width: 100%; border: 1px solid #cfdce8; border-radius: 8px; padding: .55rem .7rem;
    font-size: .95rem; font-family: inherit; background: #fff; color: var(--ink); }
  textarea { min-height: 12rem; resize: vertical; font-family: ui-monospace, Menlo, monospace; }
  label { font-size: .85rem; color: #6a7f94; }
  .muted { color: #8fa3b8; font-size: .85rem; }
  footer { text-align: center; color: #a9bccd; font-size: .78rem; padding: 2rem 0; }
`;

export function page(title: string, body: string, extraHead = ""): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${baseStyle}</style>
${extraHead}
</head>
<body>
<main>
<header class="site">
  <h1><a href="/">utakata</a></h1>
  <span class="tagline">泡沫 — 生まれて、漂って、消えるサイト</span>
  <nav><a href="/">作成</a><a href="/manage">一覧</a><a href="/auth/logout">ログアウト</a></nav>
</header>
${body}
</main>
<footer>utakata — ephemeral sites on the edge</footer>
</body>
</html>`;
}

export function loginPage(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>utakata</title>
<style>${baseStyle}
  .hero { text-align: center; padding: 5rem 1rem; }
  .hero h1 { font-size: 2.4rem; letter-spacing: .2em; color: var(--accent-dark); font-weight: 600; }
  .hero p { color: #7d92a7; margin-bottom: 2.5rem; }
</style>
</head>
<body>
<main>
<div class="hero card">
  <h1>utakata</h1>
  <p>md / html を貼るだけで、期限つきの小さなサイトが生まれます。<br>期限が来たら、泡のように消えます。</p>
  <a class="btn" href="/auth/login">Google でログイン</a>
</div>
</main>
<footer>utakata — ephemeral sites on the edge</footer>
</body>
</html>`;
}

export function setupIncompletePage(redirectUri: string): string {
  return `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>utakata — setup 未完了</title>
<style>${baseStyle}</style></head>
<body><main>
<div class="card">
  <h2>セットアップがまだ完了していません</h2>
  <p>Google OAuth クライアントが未設定のため、ログインできません。管理者は以下を行ってください。</p>
  <ol>
    <li><a href="https://console.cloud.google.com/apis/credentials">Google Cloud Console</a> で OAuth クライアント ID（ウェブアプリケーション）を作成</li>
    <li>認可済みリダイレクト URI に <code>${escapeHtml(redirectUri)}</code> を登録</li>
    <li><code>npx wrangler secret put GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> / <code>SESSION_SECRET</code> を設定</li>
    <li><code>npx wrangler deploy</code> で再デプロイ</li>
  </ol>
  <p class="muted">詳細はリポジトリの README.md を参照してください。</p>
</div>
</main></body></html>`;
}

export function createPage(email: string): string {
  const body = `
<div class="card">
  <p class="muted">ログイン中: ${escapeHtml(email)}</p>
  <div id="replace-banner" style="display:none; background:#fdf6e3; border:1px solid #ecd9a0; border-radius:8px; padding:.6rem .9rem; margin-bottom:1rem; font-size:.9rem;">
    差し替えモード: サイト <code id="replace-id"></code> の内容を置き換えます（URL・期限は維持）
    <button class="ghost" style="margin-left:.5rem; padding:.2rem .6rem;" onclick="exitReplace()">やめる</button>
  </div>

  <label>テキスト貼り付け（Markdown / HTML）</label>
  <textarea id="paste" placeholder="# ここに Markdown を貼り付け&#10;&#10;または下のゾーンにファイルをドロップ"></textarea>
  <div style="margin:.5rem 0 1rem;">
    <label>ファイル名 <input type="text" id="paste-name" value="index.md" style="width:14rem;"></label>
  </div>

  <div id="dropzone" style="border:2px dashed #b9cfe0; border-radius:12px; padding:2rem; text-align:center; color:#8fa3b8; margin-bottom:1rem;">
    ここにファイルをドラッグ＆ドロップ（複数可 / .md .html など）
    <div style="margin-top:.6rem;"><input type="file" id="filepick" multiple></div>
  </div>
  <ul id="filelist" style="list-style:none; padding:0; margin:0 0 1rem; font-size:.9rem;"></ul>

  <div id="expiry-row" style="display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:1.2rem;">
    <label style="margin-right:.3rem;">期限</label>
    <button class="ghost preset" data-sec="3600">1時間</button>
    <button class="ghost preset" data-sec="86400">1日</button>
    <button class="ghost preset" data-sec="604800">1週間</button>
    <button class="ghost preset" data-sec="2592000">1ヶ月</button>
    <span style="display:inline-flex; align-items:center; gap:.3rem;">
      <input type="number" id="custom-days" min="1" max="365" placeholder="日数" style="width:6rem;">
      <span class="muted">日（最大365）</span>
    </span>
  </div>

  <button id="publish">公開する</button>
  <div id="result" style="display:none; margin-top:1.2rem; background:var(--mist); border-radius:8px; padding:1rem;">
    <div class="muted">公開URL</div>
    <div style="display:flex; gap:.5rem; align-items:center; margin-top:.3rem;">
      <input type="text" id="result-url" readonly>
      <button class="ghost" onclick="copyUrl()">コピー</button>
    </div>
  </div>
  <div id="error" style="display:none; color:#bf616a; margin-top:1rem;"></div>
</div>

<script>
let files = [];           // {path, content}
let selectedTtl = 86400;  // 既定: 1日
const $ = (id) => document.getElementById(id);

const replaceId = new URLSearchParams(location.search).get("replace");
if (replaceId) {
  $("replace-banner").style.display = "block";
  $("replace-id").textContent = replaceId;
  $("expiry-row").style.display = "none";
  $("publish").textContent = "差し替える";
}
function exitReplace() { location.href = "/"; }

document.querySelectorAll(".preset").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedTtl = parseInt(btn.dataset.sec, 10);
    $("custom-days").value = "";
    document.querySelectorAll(".preset").forEach(b => b.style.background = "");
    btn.style.background = "var(--mist)";
  });
});
document.querySelector('.preset[data-sec="86400"]').style.background = "var(--mist)";
$("custom-days").addEventListener("input", () => {
  const d = parseInt($("custom-days").value, 10);
  if (d >= 1 && d <= 365) {
    selectedTtl = d * 86400;
    document.querySelectorAll(".preset").forEach(b => b.style.background = "");
  }
});

function renderFileList() {
  $("filelist").innerHTML = files.map((f, i) =>
    '<li>📄 ' + f.path + ' <button class="ghost" style="padding:.1rem .5rem;" onclick="removeFile(' + i + ')">×</button></li>'
  ).join("");
}
function removeFile(i) { files.splice(i, 1); renderFileList(); }
function addFiles(fileList) {
  for (const f of fileList) {
    const reader = new FileReader();
    reader.onload = () => {
      files = files.filter(x => x.path !== f.name);
      files.push({ path: f.name, content: reader.result });
      renderFileList();
    };
    reader.readAsText(f);
  }
}
const dz = $("dropzone");
dz.addEventListener("dragover", e => { e.preventDefault(); dz.style.background = "var(--mist)"; });
dz.addEventListener("dragleave", () => { dz.style.background = ""; });
dz.addEventListener("drop", e => { e.preventDefault(); dz.style.background = ""; addFiles(e.dataTransfer.files); });
$("filepick").addEventListener("change", e => addFiles(e.target.files));

$("publish").addEventListener("click", async () => {
  $("error").style.display = "none";
  const payload = { files: [...files], expiresIn: selectedTtl };
  const pasted = $("paste").value.trim();
  if (pasted) {
    const name = $("paste-name").value.trim() || "index.md";
    payload.files = payload.files.filter(f => f.path !== name);
    payload.files.unshift({ path: name, content: pasted });
  }
  if (payload.files.length === 0) { showError("ファイルを追加するかテキストを貼り付けてください"); return; }
  const url = replaceId ? "/api/sites/" + replaceId : "/api/sites";
  const res = await fetch(url, {
    method: replaceId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { showError(data.error || ("エラー: " + res.status)); return; }
  $("result").style.display = "block";
  $("result-url").value = data.url;
});
function showError(msg) { $("error").textContent = msg; $("error").style.display = "block"; }
function copyUrl() { navigator.clipboard.writeText($("result-url").value); }
</script>`;
  return page("utakata — 作成", body);
}

export function managePage(): string {
  const body = `
<div class="card">
  <h2 style="margin-top:0;">じぶんのサイト</h2>
  <div id="list" class="muted">読み込み中…</div>
</div>
<script>
const $ = (id) => document.getElementById(id);
function fmtRemaining(expiresAt) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "まもなく消滅";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return "残り " + d + "日" + h + "時間";
  if (h > 0) return "残り " + h + "時間" + m + "分";
  return "残り " + m + "分";
}
async function load() {
  const res = await fetch("/api/sites");
  if (!res.ok) { $("list").textContent = "取得に失敗しました"; return; }
  const { sites } = await res.json();
  if (sites.length === 0) { $("list").textContent = "まだサイトがありません。作成ページからどうぞ。"; return; }
  $("list").innerHTML = '<table style="width:100%; border-collapse:collapse;">' +
    "<tr><th style='text-align:left; padding:.4rem;'>タイトル</th><th style='text-align:left; padding:.4rem;'>残り期限</th><th></th></tr>" +
    sites.map(s =>
      "<tr style='border-top:1px solid #e4ecf3;'>" +
      "<td style='padding:.5rem .4rem;'><a href='/s/" + s.id + "/' target='_blank'>" + esc(s.title) + "</a><br><span class='muted'>/s/" + s.id + "/</span></td>" +
      "<td style='padding:.5rem .4rem; white-space:nowrap;'>" + fmtRemaining(s.expiresAt) + "</td>" +
      "<td style='padding:.5rem .4rem; white-space:nowrap; text-align:right;'>" +
      "<button class='ghost' onclick='extend(\\"" + s.id + "\\")'>延長</button> " +
      "<button class='ghost' onclick='location.href=\\"/?replace=" + s.id + "\\"'>差し替え</button> " +
      "<button class='danger' onclick='del(\\"" + s.id + "\\")'>削除</button>" +
      "</td></tr>"
    ).join("") + "</table>";
}
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
async function extend(id) {
  const days = prompt("何日延長しますか？（今から最大365日）", "7");
  if (!days) return;
  const n = parseInt(days, 10);
  if (!(n >= 1 && n <= 365)) { alert("1〜365 の日数を入れてください"); return; }
  const res = await fetch("/api/sites/" + id + "/expiry", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: n * 86400 }),
  });
  if (!res.ok) { alert("延長に失敗しました"); return; }
  load();
}
async function del(id) {
  if (!confirm("このサイトを削除しますか？")) return;
  const res = await fetch("/api/sites/" + id, { method: "DELETE" });
  if (!res.ok) { alert("削除に失敗しました"); return; }
  load();
}
load();
</script>`;
  return page("utakata — 一覧", body);
}
