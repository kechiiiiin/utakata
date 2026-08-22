import { marked, Lexer } from "marked";
import type { Tokens } from "marked";
import { escapeHtml } from "./util";

/**
 * Obsidian コールアウト（> [!note] タイトル …）対応。
 * 未知のタイプは note 扱い。折りたたみ記法（[!note]- / [!note]+）は通常表示。
 */
type CalloutStyle = { icon: string; palette: "blue" | "green" | "yellow" | "red" };

const CALLOUTS: Record<string, CalloutStyle> = {
  note: { icon: "📝", palette: "blue" },
  info: { icon: "ℹ️", palette: "blue" },
  abstract: { icon: "📋", palette: "blue" },
  summary: { icon: "📋", palette: "blue" },
  tldr: { icon: "📋", palette: "blue" },
  todo: { icon: "☑️", palette: "blue" },
  question: { icon: "❓", palette: "blue" },
  help: { icon: "❓", palette: "blue" },
  faq: { icon: "❓", palette: "blue" },
  quote: { icon: "💬", palette: "blue" },
  cite: { icon: "💬", palette: "blue" },
  example: { icon: "🔎", palette: "blue" },
  tip: { icon: "💡", palette: "green" },
  hint: { icon: "💡", palette: "green" },
  success: { icon: "✅", palette: "green" },
  check: { icon: "✅", palette: "green" },
  done: { icon: "✅", palette: "green" },
  warning: { icon: "⚠️", palette: "yellow" },
  caution: { icon: "⚠️", palette: "yellow" },
  attention: { icon: "⚠️", palette: "yellow" },
  important: { icon: "❗", palette: "yellow" },
  danger: { icon: "🔥", palette: "red" },
  error: { icon: "🔥", palette: "red" },
  failure: { icon: "❌", palette: "red" },
  fail: { icon: "❌", palette: "red" },
  missing: { icon: "❌", palette: "red" },
  bug: { icon: "🐛", palette: "red" },
};

// 1行目: [!type] / [!type]- / [!type]+ （後ろにタイトル任意）、2行目以降が本文
const CALLOUT_RE = /^\[!([\w-]+)\][+-]?(?:[ \t]+([^\n]*))?[ \t]*(?:\n([\s\S]*))?$/;

marked.use({
  renderer: {
    // GFM のタスクリスト（- [ ] / - [x]）。marked は既定で disabled を付けるが、
    // 泡沫では「当日その場で潰していくチェックリスト」として使いたいので押せるようにする。
    // チェック状態は閲覧端末の localStorage にのみ残る（サーバへは送らない）。
    checkbox({ checked }: Tokens.Checkbox): string {
      return `<input type="checkbox" class="task-check"${checked ? " checked" : ""}> `;
    },
    blockquote(token: Tokens.Blockquote): string {
      const m = token.text.match(CALLOUT_RE);
      if (!m) {
        return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
      }
      const type = m[1].toLowerCase();
      const style = CALLOUTS[type] ?? CALLOUTS.note;
      const titleMd = (m[2] ?? "").trim() || type.charAt(0).toUpperCase() + type.slice(1);
      const bodyMd = m[3] ?? "";
      const titleHtml = this.parser.parseInline(Lexer.lexInline(titleMd));
      const bodyHtml = bodyMd.trim()
        ? `<div class="callout-body">\n${this.parser.parse(Lexer.lex(bodyMd, { gfm: true }))}</div>\n`
        : "";
      return `<div class="callout callout-${style.palette}">
<div class="callout-title"><span class="callout-icon">${style.icon}</span>${titleHtml}</div>
${bodyHtml}</div>
`;
    },
  },
});

/**
 * [[リンク]] を同一サイト内のファイル群で解決する。
 * - [[target]] / [[target|表示名]] に対応
 * - target がファイル群に見つかれば（拡張子省略可・大文字小文字無視）サイト内リンク化
 * - 見つからなければ <strong> 相当の強調のみ（md リンクにせず **表示名**）
 */
export function resolveWikiLinks(md: string, sitePaths: string[], baseUrl: string): string {
  // パス解決テーブル: "page" → "page.md" など
  const table = new Map<string, string>();
  for (const p of sitePaths) {
    table.set(p.toLowerCase(), p);
    const noExt = p.replace(/\.(md|html?)$/i, "");
    if (!table.has(noExt.toLowerCase())) table.set(noExt.toLowerCase(), p);
  }
  return md.replace(/\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g, (_m, target: string, alias?: string) => {
    const label = (alias ?? target).trim();
    const hit = table.get(target.trim().toLowerCase());
    if (hit) {
      const href = `${baseUrl}/${hit.split("/").map(encodeURIComponent).join("/")}`;
      return `[${label}](${href})`;
    }
    return `**${label}**`;
  });
}

export async function renderMarkdown(
  md: string,
  sitePaths: string[],
  baseUrl: string,
  title: string
): Promise<string> {
  const resolved = resolveWikiLinks(md, sitePaths, baseUrl);
  const body = await marked.parse(resolved, { gfm: true, breaks: false });
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem;
         font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
         line-height: 1.8; color: #3b4252; background: #fdfdfd; }
  h1, h2, h3, h4 { line-height: 1.4; color: #2e3440; }
  h1 { border-bottom: 2px solid #dfe7ef; padding-bottom: .4rem; }
  h2 { border-bottom: 1px solid #e8eef4; padding-bottom: .3rem; }
  a { color: #5e81ac; }
  code { background: #eef2f6; padding: .15em .4em; border-radius: 4px; font-size: .9em; }
  pre { background: #2e3440; color: #e5e9f0; padding: 1rem 1.2rem; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; color: inherit; }
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #d8dee9; padding: .4rem .8rem; }
  th { background: #eceff4; }
  blockquote { border-left: 4px solid #b8c9dc; margin-left: 0; padding-left: 1rem; color: #5c6b7f; }
  img { max-width: 100%; }
  .callout { border-radius: 8px; padding: .8rem 1rem; margin: 1rem 0;
             border-left: 4px solid; background: #eef4f9; }
  .callout-title { font-weight: 600; display: flex; align-items: baseline; gap: .5em; }
  .callout-icon { flex: none; }
  .callout-body { margin-top: .4rem; }
  .callout-body > :first-child { margin-top: 0; }
  .callout-body > :last-child { margin-bottom: 0; }
  .callout-blue { border-color: #7ba7cc; background: #edf4fa; }
  .callout-blue > .callout-title { color: #4a6f96; }
  .callout-green { border-color: #a3be8c; background: #f1f6ec; }
  .callout-green > .callout-title { color: #5f7a4a; }
  .callout-yellow { border-color: #e0c580; background: #fbf6e9; }
  .callout-yellow > .callout-title { color: #93763a; }
  .callout-red { border-color: #d08a92; background: #faf0f1; }
  .callout-red > .callout-title { color: #a04b56; }
</style>
</head>
<body>
${body}
<script>
(function(){
  var boxes=[].slice.call(document.querySelectorAll('input.task-check'));
  if(!boxes.length) return;
  var KEY='utakata-check:'+location.pathname;
  var saved={};
  try{ saved=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  function save(){
    var o={};
    boxes.forEach(function(b,i){ if(b.checked) o[i]=1; });
    try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){}
  }
  boxes.forEach(function(b,i){
    if(saved[i]) b.checked=true;
    b.addEventListener('change',save);
  });
})();
</script>
</body>
</html>`;
}
