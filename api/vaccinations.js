import { configuredSecret, decryptRecord, isAuthorized, readEncryptedStore } from '../lib/vaccination-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let secret;
  try {
    secret = configuredSecret();
  } catch {
    res.status(503).json({ error: 'Health records are not configured' });
    return;
  }
  if (!isAuthorized(req, secret)) {
    res.status(401).json({ error: 'Invalid health access code' });
    return;
  }

  try {
    const store = await readEncryptedStore();
    const records = store.records
      .map(envelope => decryptRecord(envelope, secret))
      .sort((a, b) => b.date.localeCompare(a.date));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(records);
  } catch (error) {
    console.error('Unable to read vaccination records:', error.message);
    res.status(502).json({ error: 'Unable to load vaccination records right now' });
  }
}
