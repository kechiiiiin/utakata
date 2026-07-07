import { marked } from "marked";
import { escapeHtml } from "./util";

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
</style>
</head>
<body>
${body}
</body>
</html>`;
}
