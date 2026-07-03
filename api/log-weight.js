const REPO = process.env.GH_REPO;
const FILE_PATH = 'data/weight-history.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { weight, unit, date } = req.body || {};
  if (typeof weight !== 'number' || !Number.isFinite(weight) || !date) {
    res.status(400).json({ error: 'Body must include numeric "weight" and "date" (YYYY-MM-DD)' });
    return;
  }

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
    res.status(502).json({ error: 'Failed to read existing history from GitHub' });
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
    const detail = await putResp.text();
    res.status(502).json({ error: 'Failed to commit to GitHub', detail });
    return;
  }

  res.status(200).json({ ok: true, entries: history.length });
}
