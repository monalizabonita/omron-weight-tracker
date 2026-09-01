import crypto from 'node:crypto';
import {
  configuredSecret,
  encryptRecord,
  isAuthorized,
  replaceEncryptedRecord,
  todayInManila,
  updateEncryptedStore,
  validateVaccination,
} from '../lib/vaccination-store.js';

export default async function handler(req, res) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, PATCH, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let secret;
  const recordNotFound = new Error('Vaccination record not found');
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
    if (req.method === 'DELETE') {
      const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        res.status(400).json({ error: 'A valid record ID is required' });
        return;
      }
      await updateEncryptedStore(records => records.filter(record => record.id !== id));
      res.status(200).json({ ok: true });
      return;
    }

    const result = validateVaccination(req.body || {}, todayInManila());
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    if (req.method === 'PATCH') {
      const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        res.status(400).json({ error: 'A valid record ID is required' });
        return;
      }
      let updatedRecord;
      await updateEncryptedStore(records => {
        const updated = replaceEncryptedRecord(records, id, result.value, secret);
        if (!updated) throw recordNotFound;
        updatedRecord = updated.record;
        return updated.records;
      });
      res.status(200).json({ ok: true, record: updatedRecord });
      return;
    }

    const record = {
      id: crypto.randomUUID(),
      ...result.value,
      logged_at: new Date().toISOString(),
    };
    const envelope = encryptRecord(record, secret);
    await updateEncryptedStore(records => [...records, envelope]);
    res.status(201).json({ ok: true, record });
  } catch (error) {
    if (error === recordNotFound) {
      res.status(404).json({ error: 'Vaccination record not found' });
      return;
    }
    console.error('Unable to update vaccination records:', error.message);
    res.status(502).json({ error: 'Unable to save vaccination records right now' });
  }
}
