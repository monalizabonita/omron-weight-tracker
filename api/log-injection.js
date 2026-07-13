import { waitUntil } from '@vercel/functions';

const REPO = process.env.GH_REPO;
const FILE_PATH = 'data/injections.json';

function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function saveToGithub(date) {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const ghHeaders = {
    Authorization: `token ${process.env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };

  let entries = [];
  let sha;
  const getResp = await fetch(apiUrl, { headers: ghHeaders });
  if (getResp.ok) {
    const getJson = await getResp.json();
    sha = getJson.sha;
    try {
      entries = JSON.parse(Buffer.from(getJson.content, 'base64').toString('utf-8'));
      if (!Array.isArray(entries)) entries = [];
    } catch {
      entries = [];
    }
  } else if (getResp.status !== 404) {
    console.error('Failed to read existing injections from GitHub:', getResp.status, await getResp.text());
    return;
  }

  entries = entries.filter(e => e.date !== date);
  entries.push({ date, logged_at: new Date().toISOString() });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const content = Buffer.from(JSON.stringify(entries, null, 2) + '\n').toString('base64');
  const putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Log injection for ${date}`,
      content,
      sha,
    }),
  });

  if (!putResp.ok) {
    console.error('Failed to commit to GitHub:', putResp.status, await putResp.text());
  }
}

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const auth = (req.headers['authorization'] || '').trim().toLowerCase();
    const expected = `bearer ${(process.env.WEBHOOK_SECRET || '').trim()}`.toLowerCase();
    if (!auth || auth !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const date = typeof req.body?.date === 'string' ? req.body.date.trim() : '';
    if (!date) {
      res.status(400).json({ error: 'Body must include "date"' });
      return;
    }
    await deleteFromGithub(date);
    res.status(200).json({ ok: true });
    return;
  }

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
  const rawDate = typeof rawBody.date === 'string' ? rawBody.date.trim() : '';
  const date = rawDate || todayInManila();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format', received: rawBody });
    return;
  }

  res.status(202).json({ ok: true, queued: true });
  waitUntil(saveToGithub(date));
}

async function deleteFromGithub(date) {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const ghHeaders = {
    Authorization: `token ${process.env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };
  const getResp = await fetch(apiUrl, { headers: ghHeaders });
  if (!getResp.ok) return;
  const getJson = await getResp.json();
  let entries = [];
  try {
    entries = JSON.parse(Buffer.from(getJson.content, 'base64').toString('utf-8'));
    if (!Array.isArray(entries)) entries = [];
  } catch {
    entries = [];
  }
  entries = entries.filter(e => e.date !== date);
  const content = Buffer.from(JSON.stringify(entries, null, 2) + '\n').toString('base64');
  await fetch(apiUrl, {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify({ message: `Remove injection log for ${date}`, content, sha: getJson.sha }),
  });
}
