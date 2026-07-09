'use strict';

// Regression test for the "duplicate sendMessageDirect()" bug: a leftover
// old implementation was silently shadowing the new tool-calling one (JS
// hoisting picks the last top-level function declaration), so no tool ever
// executed even though BUILT_IN_TOOLS/executeTool looked correct in
// isolation. Only an end-to-end run of the real send button through a real
// browser exercises the code path that broke — a unit test on executeTool()
// alone would have kept passing throughout that bug's lifetime.

const { test, expect, saveApiKey } = require('./fixtures');

test('sending a message that triggers a tool call executes the tool and renders both the call and the final answer', async ({ loggedInPage: page }) => {
  await saveApiKey(page, 'anthropic', 'sk-ant-test-key-not-real');
  await page.goto('/app/');
  await expect(page.locator('#message-input')).toBeVisible();

  let callCount = 0;
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    callCount += 1;
    const sse = callCount === 1
      ? [
          `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 20 } } })}`,
          `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_1', name: 'calculate' } })}`,
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"expression":"2+2"}' } })}`,
          `data: ${JSON.stringify({ type: 'content_block_stop' })}`,
          `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 12 } })}`,
          `data: ${JSON.stringify({ type: 'message_stop' })}`,
        ]
      : [
          `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 30 } } })}`,
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'The answer is 4.' } })}`,
          `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 6 } })}`,
          `data: ${JSON.stringify({ type: 'message_stop' })}`,
        ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse.join('\n\n') + '\n\n',
    });
  });

  await page.fill('#message-input', 'What is 2+2? Use the calculator tool.');
  await page.click('#send-btn');

  // Proves the tool-calling loop actually ran executeTool('calculate', ...)
  // rather than the old plain-streaming path silently winning.
  await expect(page.locator('.tool-call-block.tool-call-done')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.tool-call-name')).toContainText('calculate');

  // Proves the loop went on to make the *second* API call with the tool
  // result appended, and rendered that final answer.
  await expect(page.locator('.message-bubble').last()).toContainText('The answer is 4.', { timeout: 15_000 });

  expect(callCount).toBe(2);
});
