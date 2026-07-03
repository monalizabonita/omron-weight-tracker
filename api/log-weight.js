import { waitUntil } from '@vercel/functions';

const REPO = process.env.GH_REPO;
const FILE_PATH = 'data/weight-history.json';

function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function saveToGithub(weight, unit, date) {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const ghHeaders = {
    Authorization: `token ${process.env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };

  let history = [];
  let sha;
  const getResp = await fetch(apiUrl, { headers: ghHeaders });
  if (getResp.ok) {
    const getJson = await getResp.json();
    sha = getJson.sha;
    try {
      history = JSON.parse(Buffer.from(getJson.content, 'base64').toString('utf-8'));
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  } else if (getResp.status !== 404) {
    console.error('Failed to read existing history from GitHub:', getResp.status, await getResp.text());
    return;
  }

  history = history.filter(h => h.date !== date);
  history.push({
    date,
    weight,
    unit: unit === 'lb' ? 'lb' : 'kg',
    logged_at: new Date().toISOString(),
  });
  history.sort((a, b) => a.date.localeCompare(b.date));

  const content = Buffer.from(JSON.stringify(history, null, 2) + '\n').toString('base64');
  const putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Log weight for ${date}`,
      content,
      sha,
    }),
  });

  if (!putResp.ok) {
    console.error('Failed to commit to GitHub:', putResp.status, await putResp.text());
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = (req.headers['authorization'] || '').trim().toLowerCase();
  const expected = `bearer ${(process.env.WEBHOOK_SECRET || '').trim()}`.toLowerCase();
  if (!auth || auth !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rawBody = req.body || {};
  const body = {};
  for (const key of Object.keys(rawBody)) {
    body[key.toLowerCase()] = rawBody[key];
  }

  const weight = typeof body.weight === 'number' ? body.weight : parseFloat(body.weight);
  const rawDate = typeof body.date === 'string' ? body.date.trim() : String(body.date ?? '').trim();
  const date = rawDate || todayInManila();
  const unit = typeof body.unit === 'string' ? body.unit.trim().toLowerCase() : '';

  if (!Number.isFinite(weight)) {
    res.status(400).json({
      error: 'Body must include a numeric "weight"',
      received: rawBody,
    });
    return;
  }

  res.status(202).json({ ok: true, queued: true });
  waitUntil(saveToGithub(weight, unit, date));
}
