export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
