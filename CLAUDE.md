# CLAUDE.md — にこにこ買取 プロジェクトメモ

Claude Code 起動時に自動で読み込まれるファイルです。
過去のやり取りの記録・開発ルール・注意事項をここに蓄積します。

---

## プロジェクト概要

- **サービス名**: にこにこ買取
- **内容**: トレーディングカード（ポケモン・ONE PIECE・ドラゴンボール）の郵送買取サイト
- **本番URL**: https://kaitori-price.vercel.app/
- **テストURL**: https://kaitori-price.vercel.app/?testMode=1&testPriceChange=1
- **主要ファイル**:
  - `index.html` — メインページ（価格表・カート・ご利用方法）
  - `style.css` — スタイル
  - `app.js` — 価格データ読み込み・カート・チェックアウト処理
  - `admin.html` — 管理画面（ローカルのみ・インターネット非公開）
  - `api/chat.js` — AIチャットボット（Vercel Serverless Function）
  - `api/send-receipt.js` — 申込完了メール送信（Resend使用）
  - `scripts/analyze_line_chats.mjs` — LINE会話CSV一括解析スクリプト
  - `training_data/` — LINE会話CSVデータ（gitignore済み・個人情報含む）

---

## アーキテクチャ

```
[ブラウザ]
  ├─ 価格表示   ← Google Sheets (GViz API) からリアルタイム取得
  ├─ カート     ← localStorage に保存
  ├─ 申込送信   ← Recore API (co-api.recore-pos.com/bad/offer) へ POST
  ├─ AIチャット  ← /api/chat (Vercel Function) → Claude Haiku 4.5
  └─ 完了メール  ← /api/send-receipt (Vercel Function) → Resend

[管理画面]
  └─ npm run dev (ローカルのみ) → 画像アップロード・リサイズ
```

### セキュリティ設計
- **顧客個人情報はこのサーバーに保存されない** — 申込はすべてRecore側に送信
- APIキーはVercel環境変数に保管（フロントエンドのコードに書かない）
- 管理画面・画像アップロードはローカルのみ（vercel.jsonで/adminと/api/uploadをブロック）

---

## 環境変数（Vercelに設定済み）

| 変数名 | 用途 | 設定状況 |
|--------|------|---------|
| `ANTHROPIC_API_KEY` | AIチャットボット | 設定済み |
| `RESEND_API_KEY` | 申込完了メール送信 | 設定済み |
| `RESEND_FROM_EMAIL` | 送信元メールアドレス | `info@aigive.jp` |

ローカル開発時は `/home/user/kaitori-price/.env` に同じ変数を設定（gitignore済み）。

---

## 実装済み機能

### カート・申込フロー
- 商品カードの「カートに追加」ボタン
- シュリンクあり/なし（ポケモン）または箱/カートン（OP・DB）の種別選択
- カートはlocalStorageで永続化
- 申込フォーム（最小構成）：姓・名・電話番号・メールアドレス（任意）・備考（任意）
- 利用規約モーダル（Google Docs埋め込み）→ 「同意して申し込む」

### Recore API連携
- エンドポイント: `POST https://co-api.recore-pos.com/bad/offer`
- 認証: `X-Identification` ヘッダ（`app.js` の `RECORE_API_KEY` 定数）
- **APIキー未設定のため現在は接続不可** → `app.js` 冒頭の定数に設定が必要
- カート内容は `comment` フィールドにテキスト形式で送信（商品名・数量・単価・合計）
- `is_pickup: false`（ヤマト自動集荷なし）
- `message_channel: 'LINE'`（LINE通知）

### LINE ミニアプリ連携（申請中）
- コードは実装済み（`recore.member.message('member')` で会員情報自動入力）
- **`MEMBER_APP_URL` が未設定** → Recoreから承認後にURLが発行される
- 承認後は `app.js` 冒頭の `MEMBER_APP_URL` 定数にURLを設定するだけ
- **TODO: Recoreサポートに「会員アプリのベースURL（MEMBER_APP_URL）」を問い合わせる**

### 申込完了画面（見積書フォーマット）
- 申込成功後に見積書を画面表示（商品リスト・合計金額・受付ID）
- 印刷ボタン付き
- Recore接続後は受付IDが自動表示される予定
- **申込後にResendでメール送信**（見積書HTML形式）

### AIチャットボット
- 右下フローティングUI（💬 ヘルプ ボタン）
- Claude Haiku 4.5 使用（コスト効率重視）
- システムプロンプトはLINE会話履歴595件・約9,000Q&Aから強化済み
- IP別レート制限（1分20回）
- 会話履歴を直近10件保持

### テストモード
- `?testMode=1` — RecoreAPIスキップ・バリデーション免除・ダミーデータ補完・TEST01で完了
- `?testMode=1&testPriceChange=1` — 上記 + カート価格を+100円ズラして価格変動検知をシミュレート

### 価格陳腐化バグ対策
- チェックアウトモーダルを開く際に最新データと突き合わせ
- 差異があれば警告ダイアログを表示し最新価格に自動修正

### カテゴリ別ラベル仕様
| カテゴリ | D列(c[3]) | E列(c[4]) |
|--------|-----------|-----------|
| ポケモン | シュリンクあり | シュリンクなし |
| ワンピース | 箱 | カートン |
| ドラゴンボール | 箱 | カートン |

---

## 開発ルール

- **ブランチ**: `claude/` プレフィックス必須
- **デザイン**: シンプル・モバイルファースト。過剰な装飾は避ける
- 利用者はITリテラシーが高くないため、重要情報は**目立つ位置に繰り返し配置**する
- **個人情報を含むファイルはgitignore**（training_data/の.csv・.zip、.envなど）
- 管理画面・画像アップロードは**ローカルのみ**（インターネット公開しない）

---

## 買取ルール（表示内容の根拠）

### 本人確認書類
- 初回郵送取引：3ヶ月以内に取得した住民票または印鑑証明書写しの原本 ＋ 本人確認書類
- 2回目以降：本人確認書類のみ

### 買取有効期限
- 当日便にて発送・弊社には翌日到着分のみ有効
- 遠方で中1日以上かかる場合は事前申請・承認が必要

### 自動減額ルール
- 「店舗シール付着」「ハードケース入り」：1点につき200円減額
- 発送後のキャンセル・返却不可
- 回避方法：シールを剥がす・ケースから出した状態で発送

### 送料無料キャンペーン
- 適用条件：20箱以上かつヤマト運輸利用
- 通常地域：着払い発送可・送料無料
- 九州・四国：送料半額弊社負担（買取金額から相殺）
- 沖縄・北海道・離島：送料お客様負担（元払い）
- 注意：過度に大きな箱・過剰分割（目安60箱/1梱包超）は適用外になる場合あり

---

## 未完了タスク（TODO）

| 優先度 | タスク | 備考 |
|--------|--------|------|
| 高 | Recoreサポートに `MEMBER_APP_URL` を問い合わせる | LINEミニアプリ承認後に発行 |
| 高 | RecoreのAPIキーを `app.js` の `RECORE_API_KEY` に設定 | 現在は申込が飛ばない状態 |
| 中 | LINEミニアプリ承認後: `MEMBER_APP_URL` を設定し会員情報自動入力を有効化 | コード実装済み |
| 中 | LINEミニアプリ承認後: Recore APIレスポンスの受付IDを完了画面に表示 | `renderReceipt()` で対応済み |
| 低 | AIチャットのQ&Aをさらに精緻化（LINEチャット履歴追加分析） | `training_data/` にCSVを追加後 `node scripts/analyze_line_chats.mjs` を実行 |

---

## 変更ログ

### 2026-02-21（前セッション）

**大規模リニューアル**

| 依頼 | 対応ファイル | 変更内容 |
|------|-------------|---------|
| カート機能・チェックアウト機能を追加 | `app.js` `index.html` `style.css` | カートUI・localStorage永続化・申込フォーム・Recore API連携 |
| Recore APIのcommentフィールドでカート情報を送信 | `app.js` | 商品名・数量・単価・合計をテキスト整形して送信 |
| 申込完了画面を見積書フォーマットに刷新 | `app.js` `index.html` `style.css` | 受付ID・商品リスト・注意事項・印刷ボタン |
| 受付ID発行フローを6ステップに再構成 | `index.html` | Step3に「受付ID・見積書が自動発行」を追加 |
| 利用規約モーダルを申込前に表示 | `app.js` `index.html` `style.css` | Google Docs埋め込み・「同意して申し込む」フロー |
| OP・DBのラベルを箱/カートンに変更 | `app.js` `index.html` | シュリンク概念なし、CATEGORIES に boxMode 追加 |
| AIチャットボット設置 | `api/chat.js` `app.js` `index.html` `style.css` | Claude Haiku・システムプロンプト・クイックリプライ |
| テストモード追加 | `app.js` `index.html` | `?testMode=1` でAPIスキップ・`testPriceChange=1`で価格変動シミュレート |
| カート価格陳腐化バグ修正 | `app.js` | チェックアウト時に最新データと突き合わせ・警告表示 |
| ブランドアイコン・ロゴ設置 | `index.html` `style.css` | `images/icon_130x130.png`・`images/logo_horizontal.png` |
| Vercelデプロイ構成 | `vercel.json` `api/chat.js` | 管理画面・アップロードAPIを非公開・チャットAPIをServerless化 |
| LINEチャット履歴595件を解析しAI回答強化 | `api/chat.js` `scripts/analyze_line_chats.mjs` | 9,000件のQ&Aからよくある質問を抽出・システムプロンプト更新 |
| Resendメール送信API追加 | `api/send-receipt.js` `app.js` `package.json` | 申込完了後に見積書HTMLメールを自動送信 |

### 2026-02-21（本セッション）

| 依頼 | 対応ファイル | 変更内容 |
|------|-------------|---------|
| 必要書類・注意事項・送料キャンペーン詳細をご利用方法に追加 | `index.html` `style.css` | 「必要書類」セクション（初回/2回目以降）、「注意事項」セクション（有効期限・自動減額）、送料キャンペーンの地域別詳細を追加 |
| 上部にもボタンを設置してほしい（利用者がわかるよう） | `index.html` `style.css` | タブ直下にクイックナビボタン3点を追加（ご利用方法・必要書類・送料発送）。ページ下部のご利用方法セクションへジャンプする機能 |
| CLAUDE.md を大幅更新 | `CLAUDE.md` | 前セッションの全変更内容・アーキテクチャ・TODO・環境変数を記録 |
