export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RECORE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { case_id, ...payload } = req.body;
  if (!case_id) {
    return res.status(400).json({ error: 'case_id is required' });
  }

  try {
    const response = await fetch(`https://co-api.recore-pos.com/bad_cases/${case_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Identification': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'リクエストに失敗しました' });
  }
}
