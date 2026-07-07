# utakata

> md / html を貼り付け or ドラッグ&ドロップすると、**期限付きの推測不能URL**で一時サイトが生まれる Web サービス。
> 名前の由来は「泡沫（うたかた）」——生まれて、しばらく漂って、静かに消える。

- **URL 形式**: `https://<domain>/s/<推測不能ID>/`（128bit 乱数の base62、22文字）
- **期限**: 1時間 / 1日 / 1週間 / 1ヶ月 のプリセット＋カスタム日数（上限365日、無期限なし）。KV の `expirationTtl` で自動消滅
- **認証**: Google OIDC＋メール許可リスト（Phase 1 は kechiiiiin@gmail.com のみ）
- **md**: marked でレンダリング。`[[リンク]]` は同時アップロードしたファイル間で解決（相手不在なら強調表示のみ）
- **html**: 無加工でそのまま配信（JS も動く）
- **スタック**: Cloudflare Workers + Hono + KV

## ローカル開発

```sh
npm install
npx wrangler dev        # http://localhost:8787
npx tsc --noEmit        # 型チェック
```

`.dev.vars`（gitignore 済み）に開発用の環境変数を置く:

```
DEV_AUTH_BYPASS=1
SESSION_SECRET=dev-only-secret-not-for-production
```

`DEV_AUTH_BYPASS=1` のとき `/auth/login` が Google を経由せず kechiiiiin@gmail.com としてログイン扱いになる（**production には絶対にこの変数を設定しないこと**。設定されない限り本番では無効）。

## Google OAuth クライアント作成手順

1. [Google Cloud Console → API とサービス → 認証情報](https://console.cloud.google.com/apis/credentials) を開く（プロジェクトがなければ作成）
2. 「OAuth 同意画面」を設定（外部 / アプリ名 utakata / 自分のメールで可。テストユーザーに kechiiiiin@gmail.com を追加）
3. 「認証情報を作成 → OAuth クライアント ID → ウェブアプリケーション」
4. **承認済みのリダイレクト URI** に以下を登録:
   - 本番: `https://utakata.kechiiiiin.workers.dev/auth/callback`
   - （ローカルで実 OAuth を試す場合のみ）`http://localhost:8787/auth/callback`
5. 発行された クライアント ID / クライアント シークレット を控える

## シークレット設定

```sh
npx wrangler secret put GOOGLE_CLIENT_ID      # ↑で発行された ID
npx wrangler secret put GOOGLE_CLIENT_SECRET  # ↑で発行されたシークレット
npx wrangler secret put SESSION_SECRET        # 例: openssl rand -base64 32
```

許可メールは `wrangler.jsonc` の `vars.ALLOWED_EMAILS`（カンマ区切り）。

## デプロイ

```sh
npx wrangler deploy
```

## API

| メソッド/パス | 用途 |
|---|---|
| `GET /auth/login` → `GET /auth/callback` | Google OIDC ログイン |
| `POST /api/sites` | サイト作成 `{files: [{path, content}], expiresIn: 秒}` → URL 返却 |
| `GET /api/sites` | 自分のサイト一覧（lazy cleanup 付き） |
| `PUT /api/sites/:id` | 内容差し替え（同一URL・期限維持） |
| `PATCH /api/sites/:id/expiry` | 期限延長 `{expiresIn: 秒}`（延長時点から最大365日） |
| `DELETE /api/sites/:id` | 削除 |
| `GET /s/:id/` `GET /s/:id/:path` | 公開配信（認証不要・`X-Robots-Tag: noindex`） |

## KV キー設計

| キー | 値 | TTL |
|---|---|---|
| `site:<id>:meta` | メタ JSON（owner sub・期限・ファイル一覧・entry・タイトル） | サイト期限 |
| `site:<id>:file:<path>` | ファイル本文（md は生のまま、配信時レンダリング） | サイト期限 |
| `user:<sub>:sites` | サイトダイジェスト配列 | なし（永続・lazy cleanup） |
| `session:<token>` | セッション JSON | 30日 |
