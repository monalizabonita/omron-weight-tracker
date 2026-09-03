import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/site-access.js';

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

function withAccessCode(run) {
  const previous = process.env.VACCINATION_SECRET;
  process.env.VACCINATION_SECRET = 'site-test-code';
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.VACCINATION_SECRET;
    else process.env.VACCINATION_SECRET = previous;
  }
}

test('site access accepts the configured bearer code without returning it', () => {
  withAccessCode(() => {
    const res = responseRecorder();
    handler({ method: 'POST', headers: { authorization: 'Bearer site-test-code' } }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.body, undefined);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  });
});

test('site access rejects an invalid code', () => {
  withAccessCode(() => {
    const res = responseRecorder();
    handler({ method: 'POST', headers: { authorization: 'Bearer wrong-code' } }, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /not accepted/i);
  });
});

test('site access rejects unsupported methods', () => {
  withAccessCode(() => {
    const res = responseRecorder();
    handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'POST');
  });
});
