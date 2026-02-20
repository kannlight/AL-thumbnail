# 工程1: プロジェクト初期設定

## 目的
Next.js プロジェクトの雛形を作成し、開発に必要な基本環境を整える。

## 前提条件
- Node.js 20 以上がインストールされていること
- Firebase CLI がインストールされていること（`npm install -g firebase-tools`）
- Google Cloud プロジェクトが作成済みであること

---

## タスク一覧

### 1-1. Next.js プロジェクトの作成

```bash
npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

> [!NOTE]
> `--tailwind` は任意ですが、レスポンシブデザインの実装効率を考慮し採用を推奨します。不要であれば外してください。

### 1-2. 必要パッケージのインストール

```bash
# Gemini API SDK
npm install @google/genai

# その他ユーティリティ（必要に応じて追加）
npm install clsx
```

### 1-3. ディレクトリ構造の策定

以下の構造で初期ディレクトリを作成すること。

```
src/
├── app/
│   ├── layout.tsx          # ルートレイアウト
│   ├── page.tsx            # パスワードゲートウェイ画面
│   ├── chat/
│   │   └── page.tsx        # メインチャット画面
│   └── api/
│       ├── auth/
│       │   └── route.ts    # パスワード認証エンドポイント
│       └── chat/
│           └── route.ts    # Gemini API 連携エンドポイント
├── components/
│   ├── ui/                 # 汎用UIコンポーネント
│   └── chat/               # チャット固有コンポーネント
├── lib/
│   ├── gemini.ts           # Gemini クライアント初期化
│   ├── mcp.ts              # MCPクライアント
│   └── auth.ts             # 認証ユーティリティ
├── hooks/                  # カスタムフック
├── types/                  # 型定義
│   └── index.ts
└── stores/                 # クライアント状態管理（会話履歴等）
```

### 1-4. 環境変数の設定

`.env.local` に以下の変数を定義する（値は各自の環境に合わせる）。

```env
# Gemini API
GEMINI_API_KEY=your-api-key-here

# 認証パスワード（ローカル開発用。本番は Secret Manager を使用）
AUTH_PASSWORD=your-password-here

# MCPサーバー
MCP_SERVER_URL=http://localhost:xxxx
```

`.env.example` も同じキー名（値は空）で作成し、Git に含めること。

### 1-5. Firebase App Hosting の初期設定

```bash
firebase init apphosting
```

> [!IMPORTANT]
> App Hosting の設定時に、使用する Google Cloud プロジェクトとリポジトリの連携を行うこと。
> 詳細は [Firebase App Hosting ドキュメント](https://firebase.google.com/docs/app-hosting) を参照。

### 1-6. `.gitignore` の確認

以下が `.gitignore` に含まれていることを確認する。

```
.env.local
.env*.local
node_modules/
.next/
```

---

## 完了条件
- [ ] `npm run dev` でローカル開発サーバーが起動し、デフォルトページが表示される
- [ ] 上記ディレクトリ構造が作成されている
- [ ] `.env.local` と `.env.example` が設定されている
- [ ] Firebase App Hosting の初期設定が完了している
- [ ] Git リポジトリに初期コミットが完了している
