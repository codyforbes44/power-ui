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

// Default to a valid same-origin request so tests that exercise other logic
// aren't rejected by the open-relay guard. Origin-specific tests override.
const SAME_ORIGIN = { host: 'my-deploy.netlify.app', origin: 'https://my-deploy.netlify.app' };

function makeEvent(body, method = 'POST', headers = SAME_ORIGIN) {
  return { httpMethod: method, body: JSON.stringify(body), headers };
}

test.afterEach(() => {
  nock.cleanAll();
});

test('rejects a POST whose Origin does not match its own Host (open-relay guard)', async () => {
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: '/v1/messages', payload: { a: 1 } },
    'POST',
    { host: 'my-deploy.netlify.app', origin: 'https://attacker.example' }
  ));
  assert.equal(res.statusCode, 403);
});

test('allows a POST whose Origin matches its own Host (same-origin browser call)', async () => {
  const scope = nock('https://api.anthropic.com').post('/v1/messages').reply(200, { ok: true });
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: '/v1/messages', apiKey: 'k', payload: { a: 1 } },
    'POST',
    { host: 'my-deploy.netlify.app', origin: 'https://my-deploy.netlify.app' }
  ));
  assert.equal(res.statusCode, 200);
  assert.ok(scope.isDone());
});

test('rejects a POST with no Origin header at all (curl / server-to-server open-relay guard)', async () => {
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: '/v1/messages', apiKey: 'k', payload: { a: 1 } },
    'POST',
    { host: 'my-deploy.netlify.app' }
  ));
  assert.equal(res.statusCode, 403);
});

test('echoes the validated Origin in Access-Control-Allow-Origin, never "*"', async () => {
  const scope = nock('https://api.anthropic.com').post('/v1/messages').reply(200, { ok: true });
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: '/v1/messages', apiKey: 'k', payload: { a: 1 } },
    'POST',
    { host: 'my-deploy.netlify.app', origin: 'https://my-deploy.netlify.app' }
  ));
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://my-deploy.netlify.app');
  assert.notEqual(res.headers['Access-Control-Allow-Origin'], '*');
  assert.ok(scope.isDone());
});

const okHeaders = SAME_ORIGIN;

test('rejects a path that would change the upstream host (protocol-relative)', async () => {
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: '//attacker.example/v1/messages', payload: { a: 1 } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Invalid path/);
});

test('rejects a path containing @ (userinfo host swap)', async () => {
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: '/@attacker.example/', payload: { a: 1 } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
});

test('rejects a path not starting with /', async () => {
  const res = await handler(makeEvent(
    { provider: 'anthropic', path: 'v1/messages', payload: { a: 1 } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
});

test('fetch_url rejects a non-https scheme', async () => {
  const res = await handler(makeEvent(
    { provider: 'fetch_url', path: '/x', payload: { url: 'http://example.com' } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /https/);
});

test('fetch_url rejects a URL that resolves to a private/loopback address', async () => {
  const res = await handler(makeEvent(
    { provider: 'fetch_url', path: '/x', payload: { url: 'https://127.0.0.1/secret' } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /private/i);
});

test('fetch_url rejects the cloud metadata endpoint', async () => {
  const res = await handler(makeEvent(
    { provider: 'fetch_url', path: '/x', payload: { url: 'https://169.254.169.254/latest/meta-data/' } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /private/i);
});

test('fetch_url rejects a .internal hostname', async () => {
  const res = await handler(makeEvent(
    { provider: 'fetch_url', path: '/x', payload: { url: 'https://foo.internal/x' } },
    'POST', okHeaders
  ));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /not allowed/i);
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

test('CORS preflight (OPTIONS) from a same-origin caller short-circuits with 204', async () => {
  const res = await handler({ httpMethod: 'OPTIONS', headers: SAME_ORIGIN });
  assert.equal(res.statusCode, 204);
});

test('CORS preflight (OPTIONS) with no/invalid Origin is rejected with 403', async () => {
  const res = await handler({ httpMethod: 'OPTIONS' });
  assert.equal(res.statusCode, 403);
});

test('non-POST/OPTIONS methods are rejected with 405', async () => {
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('invalid JSON body is rejected with 400', async () => {
  const res = await handler({ httpMethod: 'POST', body: '{not json', headers: SAME_ORIGIN });
  assert.equal(res.statusCode, 400);
});
