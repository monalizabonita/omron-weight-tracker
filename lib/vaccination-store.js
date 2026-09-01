import crypto from 'node:crypto';

const FILE_PATH = 'data/vaccinations.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function githubConfig() {
  const repo = (process.env.GH_REPO || '').trim();
  const token = (process.env.GH_TOKEN || '').trim();
  if (!repo || !token) throw new Error('Vaccination storage is not configured');
  return {
    apiUrl: `https://api.github.com/repos/${repo}/contents/${FILE_PATH}`,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
  };
}

export function configuredSecret() {
  const secret = (process.env.VACCINATION_SECRET || process.env.WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('Health records access is not configured');
  return secret;
}

export function isAuthorized(req, secret = configuredSecret()) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1].trim());
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function keyFor(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptRecord(record, secret = configuredSecret()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(record), 'utf8'),
    cipher.final(),
  ]);
  return {
    id: record.id,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export function decryptRecord(envelope, secret = configuredSecret()) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyFor(secret),
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8'));
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function validateVaccination(input, today) {
  const vaccine = text(input?.vaccine, 100);
  const date = text(input?.date, 10);
  const nextDueDate = text(input?.next_due_date, 10);
  if (!vaccine) return { error: 'Vaccine name is required.' };
  if (!validDate(date)) return { error: 'A valid vaccination date is required.' };
  if (date > today) return { error: 'Vaccination date cannot be in the future.' };
  if (nextDueDate && !validDate(nextDueDate)) return { error: 'Next due date is not valid.' };

  return {
    value: {
      vaccine,
      dose: text(input?.dose, 60),
      date,
      provider: text(input?.provider, 120),
      lot_number: text(input?.lot_number, 80),
      next_due_date: nextDueDate,
      notes: text(input?.notes, 500),
    },
  };
}

export function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function readEncryptedStore() {
  const { apiUrl, headers } = githubConfig();
  const response = await fetch(apiUrl, { headers });
  if (response.status === 404) return { sha: undefined, records: [] };
  if (!response.ok) throw new Error(`Vaccination storage read failed (${response.status})`);
  const body = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  } catch {
    throw new Error('Vaccination storage contains invalid data');
  }
  return {
    sha: body.sha,
    records: Array.isArray(parsed?.records) ? parsed.records : [],
  };
}

export async function updateEncryptedStore(mutate) {
  const { apiUrl, headers } = githubConfig();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readEncryptedStore();
    const records = await mutate(current.records.slice());
    const content = Buffer.from(JSON.stringify({ version: 1, records }, null, 2) + '\n').toString('base64');
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Update encrypted vaccination records',
        content,
        sha: current.sha,
      }),
    });
    if (response.ok) return;
    if (response.status !== 409 || attempt === 1) {
      throw new Error(`Vaccination storage update failed (${response.status})`);
    }
  }
}
