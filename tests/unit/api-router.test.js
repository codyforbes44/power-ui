'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserGlobal } = require('../helpers/loadBrowserGlobal');

test('ApiRouter formats Gemini message sequence correctly', async () => {
  let capturedPayload = null;

  // Mock fetch to capture the payload sent to Gemini API
  const mockFetch = async (url, options) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        // Return an empty async iterable/stream mock response
        body: {
          getReader() {
            return {
              read() {
                return Promise.resolve({ done: true });
              }
            };
          }
        }
      };
    }
    return { ok: false, status: 404 };
  };

  const ApiRouter = loadBrowserGlobal('app/api-router.js', 'ApiRouter', {
    fetch: mockFetch,
    USE_PROXY: false,
    PROXY_URL: '',
    location: { hostname: 'localhost', protocol: 'http:' },
    TextDecoder: require('util').TextDecoder
  });

  const messages = [
    { role: 'user', content: 'What is 2+2?' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'calculate', arguments: '{"expression":"2+2"}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call_1', content: '4', name: 'calculate' },
    { role: 'user', content: 'What is 3+3?' }
  ];

  // Consume the stream generator
  const gen = ApiRouter.stream('google', 'gemini-2.5-pro', 'mock-key', messages, 'system prompt');
  for await (const chunk of gen) {
    // just consume the generator
  }

  assert.ok(capturedPayload, 'Payload should be captured');
  const contents = capturedPayload.contents;
  assert.equal(contents.length, 3, 'Should have exactly 3 turns due to role consolidation');
  
  // Turn 0: User
  assert.equal(contents[0].role, 'user');
  assert.equal(contents[0].parts[0].text, 'What is 2+2?');

  // Turn 1: Model (functionCall)
  assert.equal(contents[1].role, 'model');
  assert.ok(contents[1].parts[0].functionCall, 'Should contain functionCall');
  assert.equal(contents[1].parts[0].functionCall.name, 'calculate');

  // Turn 2: User (functionResponse + subsequent User message merged)
  assert.equal(contents[2].role, 'user');
  assert.equal(contents[2].parts.length, 2, 'Should have 2 parts in Turn 2');
  
  assert.ok(contents[2].parts[0].functionResponse, 'First part should contain functionResponse');
  assert.equal(contents[2].parts[0].functionResponse.name, 'calculate');
  assert.deepEqual(contents[2].parts[0].functionResponse.response, { content: '4' });

  assert.equal(contents[2].parts[1].text, 'What is 3+3?');
});
