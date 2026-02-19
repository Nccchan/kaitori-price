import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

import { buildManifest } from './build_manifest.mjs';

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

