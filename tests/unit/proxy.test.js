'use strict';

// Regression tests for netlify/functions/proxy.js — specifically the bug
// where GET-based polling requests (used by BFL/Replicate image generation)
// were rejected with 400 because the handler required a non-empty `payload`
// for every request and never forwarded the caller's HTTP method upstream
// (fetchProvider hardcoded POST). See app/image-router.js's polling calls.

const test = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');
const { handler } = require('../../netlify/functions/proxy.js');

function makeEvent(body, method = 'POST') {
  return { httpMethod: method, body: JSON.stringify(body) };
}

test.afterEach(() => {
  nock.cleanAll();
});

test('rejects a request with no provider or path', async () => {
  const res = await handler(makeEvent({ payload: { a: 1 } }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /provider, path/);
});

test('rejects a POST-style request with no payload', async () => {
  const res = await handler(makeEvent({ provider: 'bfl', path: '/v1/flux-pro-1.1' }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /payload/);
});

test('GET request is allowed through without a payload (image-gen polling)', async () => {
  const scope = nock('https://api.bfl.ml')
    .get('/v1/get_result')
    .query({ id: 'abc123' })
    .reply(200, { status: 'Ready', result: { sample: 'https://example.com/img.png' } });

  const res = await handler(makeEvent({
    provider: 'bfl',
    path: '/v1/get_result',
    apiKey: 'test-key',
    method: 'GET',
    queryParams: { id: 'abc123' },
  }));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).status, 'Ready');
  assert.ok(scope.isDone(), 'expected the mocked GET endpoint to be hit');
});

test('GET request upstream call actually uses method GET, not POST', async () => {
  let observedMethod = null;
  const scope = nock('https://api.replicate.com')
    .get('/v1/predictions/pred_1')
    .reply(function () {
      observedMethod = this.req.method;
      return [200, { status: 'processing' }];
    });

  await handler(makeEvent({
    provider: 'replicate',
    path: '/v1/predictions/pred_1',
    apiKey: 'test-key',
    method: 'GET',
  }));

  assert.equal(observedMethod, 'GET');
  assert.ok(scope.isDone());
});

test('POST request still forwards the JSON payload as the body', async () => {
  const scope = nock('https://api.bfl.ml')
    .post('/v1/flux-pro-1.1', { prompt: 'a cat', width: 1024, height: 1024 })
    .reply(200, { id: 'job-1' });

  const res = await handler(makeEvent({
    provider: 'bfl',
    path: '/v1/flux-pro-1.1',
    apiKey: 'test-key',
    payload: { prompt: 'a cat', width: 1024, height: 1024 },
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).id, 'job-1');
  assert.ok(scope.isDone());
});

test('unknown provider is rejected before any network call', async () => {
  const res = await handler(makeEvent({ provider: 'not-a-real-provider', path: '/x', payload: {} }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Unknown provider/);
});

test('anthropic requests get x-api-key + anthropic-version headers, not Bearer', async () => {
  let headers = null;
  const scope = nock('https://api.anthropic.com')
    .post('/v1/messages')
    .reply(function () {
      headers = this.req.headers;
      return [200, { ok: true }];
    });

  await handler(makeEvent({
    provider: 'anthropic',
    path: '/v1/messages',
    apiKey: 'sk-ant-test',
    payload: { model: 'claude-x', messages: [] },
  }));

  assert.equal(headers['x-api-key'], 'sk-ant-test');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(headers['authorization'], undefined);
  assert.ok(scope.isDone());
});

test('replicate requests use a Token authorization header', async () => {
  let headers = null;
  const scope = nock('https://api.replicate.com')
    .post('/v1/models/x/predictions')
    .reply(function () {
      headers = this.req.headers;
      return [200, { id: 'p1' }];
    });

  await handler(makeEvent({
    provider: 'replicate',
    path: '/v1/models/x/predictions',
    apiKey: 'rep-key',
    payload: { input: {} },
  }));

  assert.equal(headers['authorization'], 'Token rep-key');
  assert.ok(scope.isDone());
});

test('CORS preflight (OPTIONS) short-circuits with 204', async () => {
  const res = await handler({ httpMethod: 'OPTIONS' });
  assert.equal(res.statusCode, 204);
});

test('non-POST/OPTIONS methods are rejected with 405', async () => {
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('invalid JSON body is rejected with 400', async () => {
  const res = await handler({ httpMethod: 'POST', body: '{not json' });
  assert.equal(res.statusCode, 400);
});
