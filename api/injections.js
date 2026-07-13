const REPO = process.env.GH_REPO;
const FILE_PATH = 'data/injections.json';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
    const ghHeaders = {
      Authorization: `token ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    };

    const ghResp = await fetch(apiUrl, { headers: ghHeaders });
    if (ghResp.status === 404) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json([]);
      return;
    }
    if (!ghResp.ok) {
      res.status(502).json({ error: `GitHub returned ${ghResp.status}` });
      return;
    }

    const ghJson = await ghResp.json();
    const entries = JSON.parse(Buffer.from(ghJson.content, 'base64').toString('utf-8'));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(Array.isArray(entries) ? entries : []);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
