import { configuredSecret, isAuthorized } from '../lib/vaccination-store.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let secret;
  try {
    secret = configuredSecret();
  } catch {
    res.status(503).json({ error: 'Health dashboard access is not configured' });
    return;
  }

  if (!isAuthorized(req, secret)) {
    res.status(401).json({ error: 'That access code was not accepted.' });
    return;
  }

  res.status(204).end();
}
