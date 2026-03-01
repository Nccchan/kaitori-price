// Google Docs 利用規約HTML プロキシ
// フロントエンドから直接 Google Docs を fetch すると CORS エラーになるため、
// このサーバーレス関数経由でフェッチして返す。
// Vercel Edge Cache で 5分キャッシュ（Google Docs 更新後最大5分で反映）。

const GDOC_URL =
  'https://docs.google.com/document/d/e/2PACX-1vS1h6sRK8xDU2h-gFr93PmFFH8B0i5pvL_K-xEIoXI2D1IkfEWbcRx1GE82BTIyJw/pub?embedded=true';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const r = await fetch(GDOC_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KaitoriBot/1.0)' },
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const html = await r.text();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(502).end();
  }
}
