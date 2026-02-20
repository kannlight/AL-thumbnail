# 工程7: デプロイ

## 目的
完成したアプリケーションを Firebase App Hosting にデプロイし、本番環境で動作することを確認する。

## 前提条件
- 全工程（1〜6）が完了していること
- Firebase プロジェクトが作成済みであること
- Google Cloud プロジェクトに必要な API が有効化されていること

---

## タスク一覧

### 7-1. Firebase App Hosting の設定確認

`apphosting.yaml` が正しく設定されていることを確認する。

```yaml
# apphosting.yaml（例）
runConfig:
  minInstances: 0
  maxInstances: 2
  memoryMiB: 512
  cpu: 1

env:
  - variable: GEMINI_API_KEY
    secret: gemini-api-key       # Secret Manager のシークレット名
  - variable: AUTH_PASSWORD
    secret: al-thumbnail-password
  - variable: MCP_SERVER_URL
    value: https://your-mcp-server-url
```

> [!IMPORTANT]
> `GEMINI_API_KEY` と `AUTH_PASSWORD` は Secret Manager で管理し、`apphosting.yaml` では `secret` フィールドで参照すること。  
> 平文の値を直接書かないこと。

### 7-2. Secret Manager の設定

本番環境で使用するシークレットを登録する。

```bash
# Gemini API キー
gcloud secrets create gemini-api-key --project=YOUR_PROJECT_ID
echo -n "your-api-key" | gcloud secrets versions add gemini-api-key --data-file=- --project=YOUR_PROJECT_ID

# パスワード（工程2で作成済みなら確認のみ）
gcloud secrets create al-thumbnail-password --project=YOUR_PROJECT_ID
echo -n "your-password" | gcloud secrets versions add al-thumbnail-password --data-file=- --project=YOUR_PROJECT_ID
```

Firebase App Hosting のサービスアカウントに `roles/secretmanager.secretAccessor` を付与する。

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_APP_HOSTING_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 7-3. ビルド確認

デプロイ前にローカルでプロダクションビルドが成功することを確認する。

```bash
npm run build
```

以下を確認:
- ビルドエラーがないこと
- 型エラーがないこと
- ESLint エラーがないこと

### 7-4. デプロイ実行

Firebase App Hosting はリポジトリ連携により自動デプロイが行われる。

手動デプロイの場合:
```bash
firebase apphosting:backends:create --project=YOUR_PROJECT_ID
```

> [!NOTE]
> App Hosting は Git リポジトリ（GitHub）との連携が前提です。  
> メインブランチへのプッシュで自動デプロイが走るように設定してください。

### 7-5. 本番動作確認チェックリスト

デプロイ後、以下の項目を手動で確認する。

| # | 確認項目 | 合格基準 |
|---|---|---|
| 1 | パスワード画面表示 | アクセス時にパスワード入力画面が表示される |
| 2 | 認証 | 正しいパスワードでチャット画面に遷移する |
| 3 | 認証拒否 | 間違ったパスワードでエラーが表示される |
| 4 | 直接アクセス防止 | `/chat` に直接アクセスするとパスワード画面にリダイレクトされる |
| 5 | テキスト送信 | メッセージを送信しAIの応答が返る |
| 6 | 画像生成 | 画像が正しく生成・表示される |
| 7 | マルチターン | 修正指示が文脈を維持して動作する |
| 8 | 画像ダウンロード | 生成画像をダウンロードできる |
| 9 | MCP連携 | カードイラストを参照した画像が生成される |
| 10 | モバイル表示 | スマートフォンで正常に表示・操作できる |
| 11 | HTTPS | HTTPS で正しく動作する |

---

## トラブルシューティング

| 症状 | 原因の可能性 | 対処 |
|---|---|---|
| 500 エラー | Secret Manager へのアクセス権限不足 | サービスアカウントの権限を確認 |
| API キーエラー | 環境変数が読み込まれていない | `apphosting.yaml` の `env` 設定を確認 |
| MCP接続失敗 | MCPサーバーURLが間違っている / サーバーが停止 | URL確認、MCPサーバーのログ確認 |
| 画像が表示されない | Content-Security-Policy による制限 | CSP ヘッダーの調整 |
| ビルドエラー | Node.js バージョン不一致 | `package.json` の `engines` フィールドを確認 |

---

## 完了条件
- [ ] 本番 URL でアプリケーションにアクセスできる
- [ ] 上記チェックリストの全項目が合格する
- [ ] HTTPS でセキュアに通信できる
- [ ] Secret Manager からシークレットが正しく取得される
