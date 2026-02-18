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

対応拡張子：`.webp` / `.png` / `.jpg` / `.jpeg`

### 画像を表示する手順（重要）
1) 画像を `images/<カテゴリ>/` に入れる（例: `images/pokemon/SV11B.png`）
2) 画像一覧を作る（manifest生成）

```bash
python3 scripts/build_manifest.py
```

3) ブラウザをリロード

※ この `manifest.json` 方式にすると、存在しない画像を探しに行かないので 404 が大量に出なくなります。

## ローカル起動（推奨）
ブラウザで直接 `index.html` を開くより、ローカルサーバー経由の方が確実です。

```bash
cd kaitori-price
python3 -m http.server 5173 --bind 127.0.0.1
```

その後、ブラウザで `http://127.0.0.1:5173` を開きます。

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
