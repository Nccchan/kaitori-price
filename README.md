# にこにこ買取 価格表サイト

Google スプレッドシートをマスタとして、ポケモンカード / ONE PIECE / ドラゴンボールの買取価格をWebで見やすく表示する静的サイトです。カートに商品を追加して買取申込（Recore連携）までできます。

## 主な機能

- 買取価格表の表示（スプレッドシートからリアルタイム取得）
- カートに追加 → シュリンクあり/なし選択
- チェックアウトフォーム（氏名・電話番号のみの最小構成）
- Recore co-api へ買取申込を送信（`POST /bad/offer`）
- LINEミニアプリ会員連携（設定時に氏名・電話番号を自動入力）
- カートは localStorage で永続化

## セットアップ（必須）

### 1. Recore APIキーの設定

`app.js` の冒頭にある定数を書き換えてください。

```javascript
// Recoreより発行されたAPIキー
const RECORE_API_KEY = '<ここに設定>';

// LINEミニアプリのWebアプリURL（不要なら空文字のまま）
const MEMBER_APP_URL = '';
```

### 2. LINEミニアプリ連携（任意）

`MEMBER_APP_URL` にLINEミニアプリのURLを設定すると、LINEから開いた場合に会員情報（氏名・電話番号）が自動入力されます。

## 個人情報の取り扱い

このサイト側にデータベースや個人情報の保管はありません。

```
お客様がフォームに入力
    ↓ HTTPS暗号化
Recore のサーバー（買取管理システム）
    ↓
Recore の管理画面に申込として記録
```

カートの内容（商品名・数量・金額）はRecoreの**備考欄（comment）**にテキストで送信されます。

## スプレッドシート

`https://docs.google.com/spreadsheets/d/1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw/edit`

列構成：A=日付 / B=商品名 / C=型式 / D=シュリンクあり価格 / E=シュリンクなし価格

## 画像フォルダ（ローカル管理）

カテゴリ別に配置します。

- `images/pokemon/`
- `images/onepiece/`
- `images/dragonball/`

### 画像ファイル名ルール

**型式（シートの「型式」列）と同じ名前**にしてください。

例：
- 型式 `SV11B` → `images/pokemon/SV11B.png`
- 型式 `SV11W-dx` → `images/pokemon/SV11W-dx.webp`

対応拡張子：`.webp` / `.png` / `.jpg` / `.jpeg` / `.svg`

### 画像を表示する手順

1. 画像を `images/<カテゴリ>/` に入れる
2. manifest を更新する

```bash
node scripts/build_manifest.mjs
# または
python3 scripts/build_manifest.py
```

3. ブラウザをリロード

## ローカル起動

```bash
npm install
npm run dev
# → http://127.0.0.1:5175
```

管理画面（画像アップロード）は `http://127.0.0.1:5175/admin.html`

アップロードすると自動で **600x600 PNG** に変換し、`manifest.json` を更新します。

## 表示されない時のチェック

- スプレッドシートが **リンクを知っている人が閲覧できる** 設定になっているか
- 会社/組織アカウントの制限で外部公開がブロックされていないか
- `RECORE_API_KEY` が正しく設定されているか（申込送信時）
