import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptRecord,
  encryptRecord,
  validateVaccination,
} from '../lib/vaccination-store.js';

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
