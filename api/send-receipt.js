import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@example.com';

function buildEmailText({ name, receptionId, items, totalBoxes, totalAmount }) {
  const lines = [
    `${name} 様`,
    '',
    'このたびはにこにこ買取へお申し込みいただきありがとうございます。',
    '以下の内容でお申し込みを受け付けました。',
    '',
    '─────────────────────────',
    `■ 受付番号：${receptionId || '（LINEにてお送りします）'}`,
    '─────────────────────────',
    '',
    '【お申し込み内容】',
  ];

  for (const item of items) {
    const sub = item.price * item.quantity;
    lines.push(`・${item.name}（${item.model}）${item.shrinkLabel}  ${item.quantity}箱  ¥${item.price.toLocaleString()} × ${item.quantity} = ¥${sub.toLocaleString()}`);
  }

  lines.push(
    '',
    `合計箱数：${totalBoxes}箱`,
    `合計買取金額：¥${totalAmount.toLocaleString()}`,
    '',
    '─────────────────────────',
    '',
    '【次のステップ】',
    '１．担当者よりLINEにてご連絡いたします',
    '２．着払いにて商品をご発送ください（ヤマト運輸推奨）',
    '３．商品到着後、当日〜翌日中に査定・振込いたします',
    '',
    '※ 発送前のキャンセルはLINEよりご連絡ください',
    '※ 価格は申込日当日の買取価格が適用されます',
    '',
    '─────────────────────────',
    'にこにこ買取',
    'https://kaitori-price.vercel.app',
  );

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, receptionId, items, totalBoxes, totalAmount } = req.body || {};

  if (!email || !name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'invalid request' });
  }

  const text = buildEmailText({ name, receptionId, items, totalBoxes, totalAmount });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `【にこにこ買取】お申し込み受付のご確認（受付番号：${receptionId || '確認中'}）`,
      text,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('send-receipt error:', e);
    res.status(500).json({ error: 'メール送信に失敗しました' });
  }
}
