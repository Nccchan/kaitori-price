import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';

import { buildManifest } from './build_manifest.mjs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHAT_SYSTEM_PROMPT = `あなたは「にこにこ買取」のAIアシスタント「にこにこBot」です。
トレーディングカードの買取専門店のお客様サポートを担当しています。
明るく丁寧な口調で、簡潔にお答えください。

【お店について】
- 店名: にこにこ買取
- 取り扱い: ポケモンカード・ワンピースカード・ドラゴンボールカード（BOX・カートン）
- 公式X: @niko_kaitori
- 買取価格は毎日更新されます
- すべての検品は監視カメラで記録・保存しています

【買取の種類・条件】
- ポケモンカード: シュリンクあり・シュリンクなし、どちらも買取可能
- ワンピースカード: 箱（1BOX）またはカートン単位のみ。シュリンクなし買取は行っていません
- ドラゴンボールカード: 箱（1BOX）またはカートン単位のみ。シュリンクなし買取は行っていません
- カートン（ケース）は減額対象となる場合があります。可能な限りBOX単位でのお申し込みをお願いしています

【申込フロー】
1. このページの価格表で商品を確認する
2. 「カートに追加」ボタンで申込カートへ追加
3. カート内の「申し込む」ボタンをタップ
4. フォームにお名前・電話番号を入力
5. 「利用規約に同意して申し込む」ボタンで申込完了
6. 担当者よりLINEにてご連絡いたします
7. 着払いで商品を発送
8. 検品完了後、ご指定口座へ入金

【よくある質問】
Q: 送料は？
A: 着払いでお送りください。発送方法（ヤマト運輸など）はご相談可能です。

Q: いつ入金されますか？
A: 商品到着後、可能な限り当日〜翌日中に査定・振込いたします。

Q: カートンで送っても大丈夫ですか？
A: カートン（ケース）は減額対象となります。可能な限りBOX単位でお申し込みいただけると助かります。

Q: シュリンクなしでも買取できますか？
A: ポケモンカードはシュリンクなしでも買取可能です。ワンピースカード・ドラゴンボールカードはシュリンクなしの買取は行っていません。

Q: 段ボールのへこみや傷があっても大丈夫ですか？
A: 軽微なへこみ・傷は問題ない場合が多いです。気になる場合はLINEで写真をお送りいただければ事前確認できます。

Q: においがついている商品は買取できますか？
A: 強いにおいの付着がある場合は買取不可となります。

Q: ケース（プラケース等）に入れて送ってもいいですか？
A: 基本的にはお断りしております。段ボールでの梱包をお願いします。

Q: キャンセルはできますか？
A: ご発送前であればキャンセル可能な場合があります。公式LINEよりご連絡ください。

Q: 本人確認書類は必要ですか？
A: 高額取引の場合、住民票などの本人確認書類をお願いする場合があります。写真（裏表）でのご提出も可能です。

Q: 複数商品まとめて申し込めますか？
A: はい、カートに複数商品を追加してから一括でお申し込みいただけます。

Q: 募集していない商品はどうなりますか？
A: 現在募集していない商品は除外してお見積りいたします。価格表に掲載のない商品はLINEでご相談ください。

具体的な価格はページ上の価格表をご確認いただくようご案内ください。
回答は3〜5文程度でコンパクトにまとめてください。`;

// レート制限（IP別・1分あたり最大20リクエスト）
const rateLimitMap = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > 20;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'images');

const CATEGORIES = new Set(['pokemon', 'onepiece', 'dragonball']);

function safeFileBase(s) {
  return String(s || '')
    .trim()
    .replace(/[\/]/g, '-')
    .replace(/\s+/g, '');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

const app = express();

app.get('/admin', (_req, res) => res.redirect('/admin.html'));

app.post('/api/chat', express.json({ limit: '20kb' }), async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimit(ip)) {
    return res.status(429).json({ error: 'しばらく時間をおいてから再度お試しください。' });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  const cleaned = messages
    .filter((m) => m?.role && m?.content && typeof m.content === 'string')
    .slice(-10) // 直近10件のみ送信
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) }));

  if (cleaned.length === 0) return res.status(400).json({ error: 'invalid messages' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: CHAT_SYSTEM_PROMPT,
      messages: cleaned,
    });
    const text = response.content?.[0]?.text || 'うまく回答できませんでした。';
    res.json({ message: text });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('API key')) {
      res.status(500).json({ error: 'AIサービスの設定が必要です。管理者にお問い合わせください。' });
    } else {
      res.status(500).json({ error: '一時的なエラーが発生しました。しばらく後にお試しください。' });
    }
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const category = String(req.body?.category || '').trim();
    const codeRaw = String(req.body?.code || '').trim();
    const f = req.file;

    if (!CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'invalid category' });
    }
    if (!codeRaw) {
      return res.status(400).json({ error: 'code is required' });
    }
    if (!f || !f.buffer) {
      return res.status(400).json({ error: 'file is required' });
    }

    const code = safeFileBase(codeRaw);
    if (!code) {
      return res.status(400).json({ error: 'invalid code' });
    }

    const outDir = path.join(IMAGES, category);
    await mkdir(outDir, { recursive: true });

    const destAbs = path.join(outDir, `${code}.png`);

    const png = await sharp(f.buffer)
      .rotate() // respect EXIF
      .resize(600, 600, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(destAbs, png);
    await buildManifest();

    const savedPath = `./images/${category}/${code}.png`;
    res.json({ ok: true, savedPath });
  } catch (e) {
    res.status(500).json({ error: e?.message ? String(e.message) : String(e) });
  }
});

// static
app.use(
  express.static(ROOT, {
    etag: false,
    lastModified: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(path.join('images', 'manifest.json'))) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }),
);

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5175);

const server = app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Admin server running: http://${host}:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Admin page: http://${host}:${port}/admin.html`);
});

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

