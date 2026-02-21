import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, name, receptionId, items } = req.body || {};
  if (!to || !name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@example.com';

  const totalBoxes = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalAmount = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);

  const rowsHtml = items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">
        ${escHtml(item.name)}${item.model ? `（${escHtml(item.model)}）` : ''}<br>
        <small style="color:#888;">${escHtml(item.shrinkLabel || '')}</small>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${item.quantity}箱</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">¥${(item.price || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">¥${((item.price || 0) * (item.quantity || 0)).toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>お申込み受付確認</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- ヘッダー -->
        <tr>
          <td style="background:#1a56db;padding:24px 32px;">
            <div style="color:#fff;font-size:20px;font-weight:bold;">にこにこ買取</div>
            <div style="color:#bfdbfe;font-size:13px;margin-top:4px;">お申込み受付確認メール</div>
          </td>
        </tr>

        <!-- 本文 -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;">${escHtml(name)} 様</p>
            <p style="margin:0 0 24px;">この度はにこにこ買取へのお申込みありがとうございます。<br>
            以下の内容で受付いたしました。</p>

            ${receptionId ? `
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:16px;margin-bottom:24px;">
              <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">受付番号</div>
              <div style="font-size:22px;font-weight:bold;color:#1a56db;letter-spacing:2px;">${escHtml(receptionId)}</div>
            </div>
            ` : ''}

            <!-- 商品テーブル -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 12px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">商品</th>
                  <th style="padding:10px 12px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;">数量</th>
                  <th style="padding:10px 12px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;">単価</th>
                  <th style="padding:10px 12px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;">小計</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr style="background:#f9fafb;">
                  <td colspan="2" style="padding:10px 12px;font-weight:600;">合計</td>
                  <td style="padding:10px 12px;text-align:right;color:#6b7280;">${totalBoxes}箱</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;color:#1a56db;">¥${totalAmount.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>

            <!-- 注意事項 -->
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:16px;font-size:13px;color:#78350f;">
              <div style="font-weight:600;margin-bottom:8px;">⚠️ 発送時のご注意</div>
              <ul style="margin:0;padding-left:20px;line-height:1.8;">
                <li>申込当日便にて発送、原則翌日弊社着でお手配ください</li>
                <li>店舗シール・ハードケースは取り除いてからご発送ください（1点につき200円減額）</li>
                <li>ヤマト運輸・20箱以上で着払い発送が可能です（一部地域除く）</li>
              </ul>
            </div>
          </td>
        </tr>

        <!-- フッター -->
        <tr>
          <td style="background:#f9fafb;padding:24px 32px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
            <div>にこにこ買取 | 公式X: @niko_kaitori</div>
            <div style="margin-top:4px;">このメールに心当たりがない場合はそのまま破棄してください。</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from,
      to,
      subject: `【にこにこ買取】お申込み受付のご確認${receptionId ? ` (受付番号: ${receptionId})` : ''}`,
      html,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('send-receipt error:', e);
    res.status(500).json({ error: e.message || 'メール送信に失敗しました' });
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
