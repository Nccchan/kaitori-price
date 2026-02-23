# にこにこ買取 価格表サイト

Google スプレッドシートをマスタとして、ポケモンカード / ONE PIECE / ドラゴンボールの買取価格をWebで見やすく表示する静的サイトです。カートに商品を追加して買取申込（Recore連携）までできます。

本番URL: https://kaitori-price.vercel.app/

## 主な機能

- 買取価格表の表示（スプレッドシートからリアルタイム取得）
- カートに追加 → シュリンクあり/なし（ポケモン）または箱/カートン（OP・DB）選択
- カートは30分で自動クリア（localStorageに保存）
- チェックアウトフォーム（氏名・電話・メール・振込先口座）
- Recore co-api へ買取申込を送信（`/api/submit-offer` 経由）
- 申込完了後に見積書・「次にやること」3ステップを表示
- 申込完了メール自動送信（Resend）
- 前回入力した個人情報をlocalStorageに保存して次回自動入力
- AIチャットボット（Claude Haiku・右下フローティング）
- LINEミニアプリ会員連携（設定時に氏名・電話番号を自動入力）
- テストモード（`?testMode=1`）

## アーキテクチャ

```
[ブラウザ]
  ├─ 価格表示   ← Google Sheets (GViz API) からリアルタイム取得
  ├─ カート     ← localStorage に保存（30分で自動クリア）
  ├─ 申込送信   ← /api/submit-offer (Vercel Function) → Recore API
  ├─ AIチャット  ← /api/chat (Vercel Function) → Claude Haiku
  └─ 完了メール  ← /api/send-receipt (Vercel Function) → Resend
```

## セットアップ

### 1. Vercel 環境変数の設定

Vercel のダッシュボードで以下の環境変数を設定してください（**コードには書かない**）。

| 変数名 | 用途 |
|--------|------|
| `RECORE_API_KEY` | Recore 買取申込API認証キー |
| `ANTHROPIC_API_KEY` | AIチャットボット |
| `RESEND_API_KEY` | 申込完了メール送信 |
| `RESEND_FROM_EMAIL` | 送信元メールアドレス（例: `info@aigive.jp`） |

ローカル開発時は `.env` ファイルに同じ変数を記載してください（gitignore済み）。

### 2. LINEミニアプリ連携（任意）

`app.js` 冒頭の `MEMBER_APP_URL` にLINEミニアプリのURLを設定すると、LINEから開いた場合に会員情報（氏名・電話番号）が自動入力されます。RecoreのLINEミニアプリ承認後に発行されるURLを設定してください。

## 個人情報の取り扱い

このサイト側にデータベースや個人情報の保管はありません。

```
お客様がフォームに入力
    ↓ HTTPS暗号化
/api/submit-offer（Vercel Serverless Function）
    ↓
Recore のサーバー（買取管理システム）に申込として記録
```

カートの内容（商品名・数量・金額）はRecoreの**備考欄（comment）**にテキストで送信されます。

## スプレッドシート

`https://docs.google.com/spreadsheets/d/1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw/edit`

列構成：A=日付 / B=商品名 / C=型式 / D=シュリンクあり（または箱）価格 / E=シュリンクなし（またはカートン）価格

## 画像フォルダ（ローカル管理）

カテゴリ別に配置します。

- `images/pokemon/`
- `images/onepiece/`
- `images/dragonball/`

**型式（シートの「型式」列）と同じファイル名**にしてください。

例：型式 `SV11B` → `images/pokemon/SV11B.png`

対応拡張子：`.webp` / `.png` / `.jpg` / `.jpeg` / `.svg`

### 画像を追加する手順

1. 画像を `images/<カテゴリ>/` に入れる
2. manifest を更新する

```bash
node scripts/build_manifest.mjs
```

3. ブラウザをリロード

## ローカル起動

```bash
npm install
npm run dev
# → http://127.0.0.1:5175
```

管理画面（画像アップロード）は `http://127.0.0.1:5175/admin.html`（ローカルのみ・本番非公開）

アップロードすると自動で **600x600 PNG** に変換し、`manifest.json` を更新します。

## テストモード

| URL パラメータ | 動作 |
|--------------|------|
| `?testMode=1` | RecoreAPIをスキップ・バリデーション免除・TEST01で完了 |
| `?testMode=1&testPriceChange=1` | 上記 + カート価格を+100円ズラして価格変動検知をシミュレート |

## 表示されない時のチェック

- スプレッドシートが **リンクを知っている人が閲覧できる** 設定になっているか
- 会社/組織アカウントの制限で外部公開がブロックされていないか
- Vercel 環境変数 `RECORE_API_KEY` が設定されているか（申込送信時）
