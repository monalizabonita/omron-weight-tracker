import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configuredSecret,
  decryptRecord,
  encryptRecord,
  replaceEncryptedRecord,
  validateVaccination,
} from '../lib/vaccination-store.js';

test('dedicated vaccination secret does not replace the weight webhook secret', () => {
  const previousVaccination = process.env.VACCINATION_SECRET;
  const previousWebhook = process.env.WEBHOOK_SECRET;
  process.env.VACCINATION_SECRET = 'vaccination-only-test-secret';
  process.env.WEBHOOK_SECRET = 'weight-only-test-secret';
  try {
    assert.equal(configuredSecret(), 'vaccination-only-test-secret');
  } finally {
    if (previousVaccination === undefined) delete process.env.VACCINATION_SECRET;
    else process.env.VACCINATION_SECRET = previousVaccination;
    if (previousWebhook === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = previousWebhook;
  }
});

test('vaccination records round-trip through authenticated encryption', () => {
  const record = {
    id: '07f1099f-9dda-4f33-bb95-809ace609a6c',
    vaccine: 'Influenza',
    dose: 'Annual dose',
    date: '2026-08-12',
    provider: 'Clinic',
    lot_number: 'ABC123',
    next_due_date: '2027-08-12',
    notes: 'No reaction',
  };
  const envelope = encryptRecord(record, 'test-only-secret');
  assert.deepEqual(decryptRecord(envelope, 'test-only-secret'), record);
  assert.equal(JSON.stringify(envelope).includes('Influenza'), false);
  assert.throws(() => decryptRecord(envelope, 'wrong-secret'));
});

test('editing preserves identity and creation time while re-encrypting the record', () => {
  const secret = 'edit-test-secret';
  const original = {
    id: '07f1099f-9dda-4f33-bb95-809ace609a6c',
    vaccine: 'Influenza',
    dose: 'Dose 1',
    date: '2026-08-12',
    provider: '',
    lot_number: '',
    next_due_date: '',
    notes: '',
    logged_at: '2026-08-13T01:02:03.000Z',
  };
  const before = encryptRecord(original, secret);
  const editedAt = new Date('2026-09-01T06:00:00.000Z');
  const result = replaceEncryptedRecord([before], original.id, {
    ...original,
    vaccine: 'Updated influenza',
    notes: 'Edited note',
  }, secret, editedAt);

  assert.ok(result);
  assert.equal(result.records.length, 1);
  assert.notEqual(result.records[0].ciphertext, before.ciphertext);
  assert.equal(JSON.stringify(result.records[0]).includes('Updated influenza'), false);
  const updated = decryptRecord(result.records[0], secret);
  assert.equal(updated.id, original.id);
  assert.equal(updated.logged_at, original.logged_at);
  assert.equal(updated.updated_at, editedAt.toISOString());
  assert.equal(updated.notes, 'Edited note');
});

test('vaccination input is normalized and validated', () => {
  const result = validateVaccination({
    vaccine: '  COVID-19  ',
    dose: ' Booster ',
    date: '2026-08-12',
    next_due_date: '2027-08-12',
    notes: '  Felt fine  ',
  }, '2026-09-01');
  assert.equal(result.error, undefined);
  assert.equal(result.value.vaccine, 'COVID-19');
  assert.equal(result.value.dose, 'Booster');
  assert.equal(result.value.notes, 'Felt fine');
});

test('future and invalid vaccination dates are rejected', () => {
  assert.match(validateVaccination({ vaccine: 'Flu', date: '2026-09-02' }, '2026-09-01').error, /future/);
  assert.match(validateVaccination({ vaccine: 'Flu', date: '2026-02-30' }, '2026-09-01').error, /valid/);
});
