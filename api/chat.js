import Anthropic from '@anthropic-ai/sdk';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimit(ip)) {
    return res.status(429).json({ error: 'しばらく時間をおいてから再度お試しください。' });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  const cleaned = messages
    .filter((m) => m?.role && m?.content && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) }));

  if (cleaned.length === 0) return res.status(400).json({ error: 'invalid messages' });

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
}
