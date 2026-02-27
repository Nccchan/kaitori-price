# CLAUDE.md — にこにこ買取 プロジェクトメモ

Claude Code 起動時に自動で読み込まれるファイルです。
過去のやり取りの記録・開発ルール・注意事項をここに蓄積します。

---

## プロジェクト概要

- **サービス名**: にこにこ買取
- **内容**: トレーディングカード（ポケモン・ONE PIECE・ドラゴンボール・遊戯王）の郵送買取サイト
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
| `RECORE_API_KEY` | Recore買取申込API（`api/submit-offer.js`経由） | **未設定・Recoreから発行されたら設定** |

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
- 認証: `X-Identification` ヘッダ（Vercel環境変数 `RECORE_API_KEY`）
- **APIキー未設定のため現在は接続不可** → Vercel環境変数 `RECORE_API_KEY` に設定が必要
- フロントエンドは直接Recoreを呼ばず、`/api/submit-offer.js` を経由する（セキュリティ対策）
- カート内容は `offer_comment` フィールドにテキスト形式で送信（商品名・数量・単価・合計）
- `is_pickup: false`（ヤマト自動集荷なし）
- `message_channel: 'LINE'`（LINE通知）

#### Recore API 正式フィールド仕様（仕様書より）
仕様書URL: https://novasto.github.io/ReCORE.co-api/spec/bad_case.html

| フィールド | 型 | 制約 | 備考 |
|-----------|-----|------|------|
| last_name / first_name | string | 50文字 | 姓・名 |
| last_kana / first_kana | string | 50文字 | セイ・メイ |
| sex | string | MALE/FEMALE/OTHER | 性別 |
| birthdate | string | YYYY-MM-DD | **`birthday`ではなく`birthdate`** |
| tel | string | ハイフンあり・なし両方可 | `/^0[0-9]{9,10}$/` または `-`区切り形式 |
| email | string | 256文字 | メール |
| postal_code | string | `^[0-9]{3}-?[0-9]{4}$` | 郵便番号 |
| prefecture | string | 10文字 | 都道府県 |
| address1 | string | — | 市区町村 |
| address2 | string | — | 番地・建物名（任意） |
| message_channel | string | EMAIL/SMS/LINE | 希望連絡方法 |
| offer_comment | string | — | 申込時備考（**`comment`ではなく`offer_comment`**） |
| bank_code | string | **4桁数値のみ** | 銀行コード（銀行名ではなくコード） |
| bank_branch_code | string | **3桁数値のみ** | 支店コード（支店名ではなくコード） |
| bank_account_number | string | **7桁数値のみ** | 口座番号 |
| bank_account_name | string | 30文字・カタカナ等 | 口座名義 |
| member_jwt | string | — | LINEミニアプリJWT |

**⚠️ 現在のコードとの差異（要修正）:**
1. `comment` → `offer_comment` に変更が必要
2. `birthday` → `birthdate` に変更が必要
3. 銀行情報: APIは**名称ではなくコード（数値）**を要求する
   - `bank_name`（銀行名）→ `bank_code`（4桁）に変更が必要
   - `bank_branch_name`（支店名）→ `bank_branch_code`（3桁）に変更が必要
   - **銀行コードを入力させるUXは難しいため、GMO銀行振込APIかeKYCで対応するのが現実的**

### eKYC連携（未導入）
仕様書URL: https://docs.channel.io/helprecore/ja/articles/r0727-f2c89fac

- **費用**: 月額5,500円（税込）＋ 1件あたり330円（税込）
- **メリット**: 本人限定郵便・配送会社経由の本人確認が不要になる
- **デメリット**: 件数課金あり
- **申請**: ロゴ画像（横5:縦1・50KB以下）を用意してGoogleフォームから申請 → 約10営業日で利用開始
- **銀行情報との関係**: eKYCは本人確認のみ。銀行口座確認には別途GMO銀行振込APIが必要
- **注意**: 一部スマートフォンでeKYCが起動しない事象あり（担当営業に確認）

### 宅配買取導入フロー（全8ステップ）
仕様書URL: https://docs.channel.io/helprecore/ja/articles/宅配買取導入ドキュメント--ユーザーヘルプサイト-5530f29f

| ステップ | 内容 | 当サービス状況 |
|---------|------|-------------|
| STEP1 | サービス設計（事前査定・集荷体制・本人確認方式） | 完了 |
| STEP2 | 要件確定（フォーム・マイページ・eKYC・ヤマト連携等） | 進行中 |
| STEP3 | LINEミニアプリ申請 | **申請中** |
| STEP4 | ヤマト自動集荷連携 | 未対応（`is_pickup: false`） |
| STEP5 | eKYC連携 | 未対応 |
| STEP6 | 申込フォーム作成 | 完了 |
| STEP7 | 申込フォーム実装（LP公開） | 完了（Vercel） |
| STEP8 | 操作手順・オペレーション確認 | 未実施 |

**GMO銀行振込API**: 銀行コードで口座確認するAPI。銀行フォームの代替として検討が必要。

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
| 遊戯王 | 箱 | カートン |

---

## 開発ルール

- **ブランチ**: `claude/` プレフィックス必須
- **デザイン**: シンプル・モバイルファースト。過剰な装飾は避ける
- 利用者はITリテラシーが高くないため、重要情報は**目立つ位置に繰り返し配置**する
- **個人情報を含むファイルはgitignore**（training_data/の.csv・.zip、.envなど）
- 管理画面・画像アップロードは**ローカルのみ**（インターネット公開しない）

---

## 商品・カテゴリ追加手順

### A. 既存カテゴリに商品（弾）を追加する場合

#### 手順
1. **Google スプレッドシートに行を追加**
   - 対象シート（ポケモン／ワンピース／ドラゴンボール）を開く
   - 新商品の行を追加（商品コード・商品名・価格など）
   - 商品コードは `OP-15` `SV12` のように他と形式を揃える
   - 保存するだけで本番サイトに即時反映される（キャッシュなし）

2. **商品画像を用意してGitHubにアップロード**
   - ファイル名 = 商品コード（例: `OP-15.png`）
   - 推奨サイズ: 縦横比 3:4 程度・500KB 前後
   - GitHubのWebUI: `images/onepiece/` フォルダを開き「Add file → Upload files」
   - **アップロード先フォルダ（カテゴリ別）**:
     - ポケモン → `images/pokemon/`
     - ワンピース → `images/onepiece/`
     - ドラゴンボール → `images/dragonball/`

3. **Claude Code に manifest.json 更新を依頼**
   - GitHubへのアップロード後、Claude Codeに「manifest を更新して」と伝える
   - Claude Code が `node scripts/update-manifest.mjs` を実行してコミット・プッシュ
   - または自分でコマンド実行も可: `node scripts/update-manifest.mjs && git add images/manifest.json && git commit -m "manifest: XX を追加"`

   > **注意**: GitHub Web UI からアップロードした画像は `main` ブランチに入る。
   > Claude Code が動いているブランチ（`claude/...`）から `git cherry-pick` で取り込む必要がある。
   > この作業も「manifest を更新して」と依頼するだけで Claude Code が行う。

#### ファイル不要の場合
- 画像なしでもサイトは動作する（プレースホルダー画像 `images/placeholder.svg` が表示される）
- まず Google Sheets に行を追加して動作確認し、後から画像を追加しても問題ない

---

### B. 新しいカテゴリ（例: 遊戯王）を追加する場合

#### 手順
1. **Google スプレッドシートに新しいシートを追加**
   - スプレッドシート ID: `1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw`
   - シート名を決める（例: `遊戯王`）。この名前をそのまま `app.js` に書く

2. **`app.js` の `CATEGORIES` にエントリを追加**（Claude Code に依頼）
   ```js
   // app.js の CATEGORIES 定数（先頭付近）
   const CATEGORIES = {
     pokemon:    { label: 'ポケモンカード',  sheetName: 'ポケモン',     imageDir: 'pokemon'    },
     onepiece:   { label: 'ONE PIECE',      sheetName: 'ワンピース',   imageDir: 'onepiece',  boxMode: true },
     dragonball: { label: 'ドラゴンボール',  sheetName: 'ドラゴンボール', imageDir: 'dragonball', boxMode: true },
     // ↓ 新カテゴリを追加
     yugioh:     { label: '遊戯王',         sheetName: '遊戯王',       imageDir: 'yugioh',    boxMode: true },
   };
   ```
   - `boxMode: true` → 価格ラベルが「箱 / カートン」になる
   - `boxMode` なし（省略） → 「シュリンクあり / シュリンクなし」になる

3. **`index.html` のタブにカテゴリを追加**（Claude Code に依頼）
   ```html
   <button class="tab-btn" data-cat="yugioh">遊戯王</button>
   ```

4. **画像フォルダを作成し、画像をアップロード**
   - `images/yugioh/` フォルダを作成（GitHub Web UI で空ファイルを置くか、Claude Code に依頼）
   - 商品画像を `images/yugioh/` にアップロード

5. **manifest.json を更新**（Claude Code に依頼、または `node scripts/update-manifest.mjs`）

6. **カテゴリ別ラベル仕様表を CLAUDE.md に追記**（このファイルの「カテゴリ別ラベル仕様」を更新）

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
| 最高 | `comment` → `offer_comment` に修正（APIフィールド名誤り） | `app.js` の payload と `buildCommentText` |
| 最高 | `birthday` → `birthdate` に修正（APIフィールド名誤り） | `app.js` の payload・フォームID・バリデーション |
| 高 | 銀行情報フォームの方針決定（銀行名ではなく銀行コードが必要） | 選択肢: ①GMO銀行振込API ②eKYC ③手入力でコード入力 |
| 高 | RecoreのAPIキーを Vercel 環境変数 `RECORE_API_KEY` に設定 | 現在は申込が飛ばない状態 |
| 高 | Recoreサポートに `MEMBER_APP_URL` を問い合わせる | LINEミニアプリ承認後に発行 |
| 中 | LINEミニアプリ承認後: `MEMBER_APP_URL` を設定し会員情報自動入力を有効化 | コード実装済み |
| 中 | LINEミニアプリ承認後: Recore APIレスポンスの受付IDを完了画面に表示 | `renderReceipt()` で対応済み |
| 中 | eKYC導入検討（月額5,500円＋330円/件） | 本人確認の簡略化が目的 |
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

### 2026-02-22（本セッション）

| 依頼 | 対応ファイル | 変更内容 |
|------|-------------|---------|
| APIキーのセキュリティ修正 | `api/submit-offer.js` `app.js` | `RECORE_API_KEY` を `app.js`（公開ファイル）から削除し、Vercel環境変数に移動。フロントエンドは `/api/submit-offer` 経由でRecoreを呼ぶ |
| フロントエンド会員機能（localStorage） | `app.js` `index.html` `style.css` | 申込完了後に個人情報をlocalStorageに保存。次回チェックアウト時に自動入力＋「前回の情報を自動入力しました」バナー＋クリアボタン |

### 2026-02-23（本セッション）

| 依頼 | 対応ファイル | 変更内容 |
|------|-------------|---------|
| 申込完了後に「次にやること」3ステップを追加 | `index.html` `style.css` | 本人確認・発送・追跡番号連絡の3ステップを見積書の前に番号付きで表示。eKYCボタンをStep1内に統合し、下部の独立eKYCセクションを廃止 |

### 2026-02-24（本セッション）

| 依頼 | 対応ファイル | 変更内容 |
|------|-------------|---------|
| BASE-01・OPD-2025 の画像を追加 | `images/onepiece/` `images/manifest.json` | GitHubからcherry-pickしてmanifest.jsonに反映 |
| 商品・カテゴリ追加手順を記録 | `CLAUDE.md` | 既存カテゴリへの商品追加手順（A）・新カテゴリ追加手順（B）を追記 |

### 2026-02-27（本セッション）

| 依頼 | 対応ファイル | 変更内容 |
|------|-------------|---------|
| ダンボール手書き廃止・見積書印刷同封方式に統一 | `index.html` | ご利用方法Step3/4・申込完了の次にやることStep2・見積書注意事項から「受付IDをダンボールに記載」指示を削除 |
| 遊戯王カテゴリ追加（タブ非表示バグ修正） | `app.js` `index.html` | `CATEGORIES` に `yugioh` を追加、データ読み込みに追加、タブボタンを追加 |
