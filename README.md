# にこにこ買取 価格表サイト

Google スプレッドシートをマスタとして、ポケモンカード / ONE PIECE / ドラゴンボールの買取価格をWebで見やすく表示するための静的サイトです。

## スプレッドシート
- `https://docs.google.com/spreadsheets/d/1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw/edit`

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

### 画像を表示する手順（重要）
1) 画像を `images/<カテゴリ>/` に入れる（例: `images/pokemon/SV11B.png`）
2) 画像一覧を作る（manifest生成）

```bash
python3 scripts/build_manifest.py
```

Python が無い環境（例: Windows）なら、Node.js 版でもOKです。

```bash
node scripts/build_manifest.mjs
```

3) ブラウザをリロード

### 全商品ぶんの画像を自動生成（プレースホルダー）
「画像が未登録の商品にも、とにかく全部画像を出したい」場合は、スプレッドシートの型式一覧から `.svg` を自動生成できます。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate_placeholders.ps1
node scripts/build_manifest.mjs
```

## Shopify から実物画像を取得（600x600）
Shopify の `products.json` から商品画像を取得して、`600x600` の PNG に変換して保存します。

```powershell
# 例: ポケモン（全件）
powershell -ExecutionPolicy Bypass -File scripts/fetch_shopify_images.ps1 -Category pokemon

# manifest 更新
node scripts/build_manifest.mjs
```

必要なら `-Codes "SV11B,SV11W"` や `-Limit 10` で対象を絞れます。

※ この `manifest.json` 方式にすると、存在しない画像を探しに行かないので 404 が大量に出なくなります。

## ローカル起動（推奨）
ブラウザで直接 `index.html` を開くより、ローカルサーバー経由の方が確実です。

```bash
cd kaitori-price
python3 -m http.server 5173 --bind 127.0.0.1
```

その後、ブラウザで `http://127.0.0.1:5173` を開きます。

## 管理画面（画像アップロード）
静的サイトだけだとブラウザから `images/` に保存できないため、ローカル用の管理サーバーを使います。

1) 依存を入れる

```bash
npm install
```

2) 管理サーバー起動（価格表も同じポートで配信されます）

```bash
npm run dev
```

3) 管理画面を開く
- `http://127.0.0.1:5175/admin.html`

アップロードすると自動で **600x600 PNG** に変換し、`images/<カテゴリ>/<型式>.png` として保存＆`manifest.json` を更新します。

## 表示されない時のチェック
- スプレッドシートが **リンクを知っている人が閲覧できる** 設定になっているか
- 会社/組織アカウントの制限で外部公開がブロックされていないか

## GitHubに接続する？（任意）
**おすすめです**（履歴管理＋GitHub Pagesで公開が簡単）。

やる場合は、
- リポジトリ作成
- コミット
- GitHub Pages有効化
までこちらで進められます。
