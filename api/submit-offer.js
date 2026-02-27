export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ブラックリストチェック（電話番号）
  // 環境変数 BLACKLIST_PHONES にカンマ区切りで設定: 09012345678,09087654321
  const blacklistRaw = process.env.BLACKLIST_PHONES || '';
  if (blacklistRaw) {
    const blacklist = blacklistRaw.split(',').map(p => p.trim().replace(/-/g, ''));
    const reqPhone = (req.body?.tel || '').replace(/-/g, '');
    if (reqPhone && blacklist.includes(reqPhone)) {
      return res.status(403).json({ code: 'BLACKLISTED' });
    }
  }

  const apiKey = process.env.RECORE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://co-api.recore-pos.com/bad/offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Identification': apiKey,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json().catch(() => null);
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'リクエストに失敗しました' });
  }
}
