'use strict';

const { test, expect, saveApiKey } = require('./fixtures');

test('configuring agent personality and presets in agent-chat', async ({ loggedInPage: page }) => {
  // Capture console and error events
  page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  // 1. Navigate to agent-chat.html
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');

  // Verify elements exist
  const sydBtn = page.locator('#syd-btn');
  await expect(sydBtn).toBeVisible();
  await expect(sydBtn).toContainText('Agent Personality');

  // 2. Open the personality drawer
  await sydBtn.click();
  const drawer = page.locator('#syd');
  await expect(drawer).toBeVisible();

  // Verify form inputs exist
  const nameInput = page.locator('#sys-name');
  const emojiInput = page.locator('#sys-emoji');
  const promptInput = page.locator('#sys-ta');
  const presetSelect = page.locator('#preset-sel');

  await expect(nameInput).toBeVisible();
  await expect(emojiInput).toBeVisible();
  await expect(promptInput).toBeVisible();
  await expect(presetSelect).toBeVisible();

  // 3. Select the Woody Ford Marketing Agent preset
  await presetSelect.selectOption('wf-marketing');

  // Verify inputs updated
  await expect(nameInput).toHaveValue('WF Marketing AI');
  await expect(emojiInput).toHaveValue('🛻');
  await expect(promptInput).toHaveValue(/Woody Ford Marketing Agent/);

  // 4. Click Apply & Save
  await page.click('button:has-text("Apply & Save")');

  // Verify drawer closes and UI updates
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('#sbnm')).toContainText('WF Marketing AI');
  await expect(page.locator('#hname')).toContainText('WF Marketing AI');
  await expect(page.locator('#sbav')).toContainText('🛻');

  // 5. Re-open drawer and verify custom preset creation
  await sydBtn.click();
  await expect(drawer).toBeVisible();

  // Customize values
  await nameInput.fill('Test Bot');
  await emojiInput.fill('🤖');
  await promptInput.fill('You are a test robot assistant.');

  // Set up window.prompt handler to automatically answer the preset name prompt
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Enter a name for this personality preset');
    await dialog.accept('My Custom Preset');
  });

  // Click Save as Preset
  await page.click('button:has-text("Save as Preset")');

  // Verify preset dropdown updated and selected the custom preset
  await expect(presetSelect).toHaveValue(/custom_/);
  await expect(presetSelect.locator('option:checked')).toContainText('My Custom Preset');

  // Verify delete button is visible for custom preset
  const delBtn = page.locator('#del-preset-btn');
  await expect(delBtn).toBeVisible();

  // 6. Delete custom preset
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Are you sure you want to delete this custom preset');
    await dialog.accept();
  });
  await delBtn.click();

  // Verify values reset and delete button is hidden
  await expect(presetSelect).toHaveValue('');
  await expect(delBtn).not.toBeVisible();
});

test('Reference Gallery image upload, AI description generation, and management', async ({ loggedInPage: page }) => {
  page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  // 1. Configure a mock Anthropic API key via Admin UI so the client can run image analysis
  await saveApiKey(page, 'anthropic', 'sk-ant-mockkey123');

  // 2. Navigate to agent-chat.html
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');

  // 3. Open the personality drawer
  const sydBtn = page.locator('#syd-btn');
  await expect(sydBtn).toBeVisible();
  await sydBtn.click();
  const drawer = page.locator('#syd');
  await expect(drawer).toBeVisible();

  // Click on "Reference Gallery" tab
  await page.click('#syd-tab-btn-gallery');
  
  // Verify empty state
  await expect(page.locator('#ref-gallery-grid')).toContainText('No reference images yet');

  // 4. Mock the Anthropic vision API call for image description generation
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const sse = [
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 50 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '{"title": "Red Sports Car", "description": "A shiny red convertible sports car parked on a scenic coastal highway overlooking the ocean."}' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 45 } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse.join('\n\n') + '\n\n',
    });
  });

  // 5. Simulate image upload by filling the file input
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('button:has-text("Upload Image")');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'sports-car.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  });

  // Verify status is hidden (settled)
  const statusEl = page.locator('#ref-upload-status');
  await expect(statusEl).not.toBeVisible({ timeout: 10_000 });

  // 6. Verify image added to grid
  const galleryItem = page.locator('.ref-gal-item');
  await expect(galleryItem).toBeVisible();
  await expect(galleryItem).toContainText('Red Sports Car');

  // 7. Verify detail panel opened automatically
  const detailPanel = page.locator('#ref-detail-panel');
  await expect(detailPanel).toBeVisible();
  
  const titleInput = page.locator('#ref-detail-title');
  const descInput = page.locator('#ref-detail-desc');
  await expect(titleInput).toHaveValue('Red Sports Car');
  await expect(descInput).toHaveValue(/shiny red convertible sports car/);

  // 8. Edit and save details
  await titleInput.fill('Classic Red Car');
  await descInput.fill('An old-school vintage red coupe.');
  await page.click('button:has-text("Save Changes")');

  // Verify updated title propagates to the grid item
  await expect(galleryItem).toContainText('Classic Red Car');

  // 9. Click "Attach to Chat"
  await page.click('button:has-text("Attach to Chat")');

  // Verify drawer closes and attachment is added to the composer
  await expect(drawer).not.toBeVisible();
  const attachmentBar = page.locator('#attachment-bar');
  await expect(attachmentBar).toBeVisible();
  await expect(attachmentBar).toContainText('Classic Red Car.png');
});

test('Agent-chat session can retrieve and access items from Knowledge Base and Memory', async ({ loggedInPage: page }) => {
  page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  // 1. Configure a mock Anthropic API key via Admin UI
  await saveApiKey(page, 'anthropic', 'sk-ant-mockkey123');

  // 2. Navigate to admin.html and select the Agent tab
  await page.goto('/app/admin.html');
  await page.waitForURL('**/admin.html');
  
  // Click on "Agent" panel in Admin sidebar
  const hamburger = page.locator('button[onclick="AdminApp.toggleSidebar()"]');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.click('#nav-item-agent');

  // Click on "Knowledge Base" tab in the Agent Config panel
  await page.click('#agent-tabbtn-kb');
  
  // Upload a mock text file to the Knowledge Base
  await page.setInputFiles('#kb-file-input', {
    name: 'secret-recipe.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('The secret ingredient to Woody Ford special marketing sauce is caramelized OK onions.')
  });

  // Verify the document is added to the document list
  await expect(page.locator('.kb-doc-title')).toContainText('secret-recipe.txt');

  // Click on "Memory" tab in the Agent Config panel
  await page.click('#agent-tabbtn-memory');
  
  // Click "+ Add" button
  await page.click('button:has-text("+ Add")');
  
  // Fill the new memory key, value, and save
  await page.fill('#mem-new-key', 'Woody Ford Address');
  await page.fill('#mem-new-val', '123 Ford Street, Madill, OK');
  await page.click('button[onclick="AgentPanel.saveNewMemory()"]');

  // Verify the memory shows up in the memory list
  await expect(page.locator('#mem-list')).toContainText('Woody Ford Address');

  // 3. Navigate to agent-chat.html
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');

  // Verify stats in sidebar match
  await expect(page.locator('#stk')).toContainText('1');
  await expect(page.locator('#stme')).toContainText('1');

  // 4. Mock the Anthropic message generation
  let interceptedSystemPrompt = '';
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const request = route.request();
    const postData = request.postDataJSON();
    interceptedSystemPrompt = postData.system || '';
    
    const sse = [
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 50 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'I found the address: 123 Ford Street, Madill, OK and the secret ingredient is caramelized OK onions.' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 45 } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse.join('\n\n') + '\n\n',
    });
  });

  // 5. Send a chat message asking about the secret ingredient and address
  await page.fill('#inp', 'What is the Woody Ford address and secret ingredient?');
  await page.click('#snd');

  // Verify message completes
  await expect(page.locator('#msgs')).toContainText('caramelized OK onions');

  // Verify that the system prompt indeed contained the injected KB and Memory contents!
  expect(interceptedSystemPrompt).toContain('The secret ingredient to Woody Ford special marketing sauce is caramelized OK onions.');
  expect(interceptedSystemPrompt).toContain('Woody Ford Address');
  expect(interceptedSystemPrompt).toContain('123 Ford Street, Madill, OK');
});

test('Each personality configuration has exclusive containment of its Knowledge Base and Memory', async ({ loggedInPage: page }) => {
  page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  // 1. Configure a mock Anthropic API key
  await saveApiKey(page, 'anthropic', 'sk-ant-test-key-not-real');

  // 2. Go to agent-chat.html and select "default" preset (Personality)
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');
  
  await page.click('#syd-btn'); // Open personality drawer
  const presetSelect = page.locator('#preset-sel');
  await presetSelect.selectOption('default');
  await page.click('button:has-text("Apply & Save")');

  // 3. Go to admin.html and add KB and Memory for Aria (default)
  await page.goto('/app/admin.html');
  await page.waitForURL('**/admin.html');
  
  const hamburger = page.locator('button[onclick="AdminApp.toggleSidebar()"]');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.click('#nav-item-agent');

  // KB tab upload
  await page.click('#agent-tabbtn-kb');
  await page.setInputFiles('#kb-file-input', {
    name: 'aria-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Aria special knowledge: The Opera House is famous.')
  });
  await expect(page.locator('.kb-doc-title')).toContainText('aria-notes.txt');

  // Memory tab add
  await page.click('#agent-tabbtn-memory');
  await page.click('button:has-text("+ Add")');
  await page.fill('#mem-new-key', 'Aria Fact');
  await page.fill('#mem-new-val', 'Aria loves stargazing.');
  await page.click('button[onclick="AgentPanel.saveNewMemory()"]');
  await expect(page.locator('#mem-list')).toContainText('Aria Fact');

  // 4. Return to agent-chat.html, switch preset to "wf-marketing"
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');
  
  // Verify Aria stats count
  await expect(page.locator('#stk')).toContainText('1');
  await expect(page.locator('#stme')).toContainText('1');

  await page.click('#syd-btn'); // Open personality drawer
  await presetSelect.selectOption('wf-marketing');
  await page.click('button:has-text("Apply & Save")');

  // Verify stats reset for Woody Ford Marketing (containment proof!)
  await expect(page.locator('#stk')).toContainText('0');
  await expect(page.locator('#stme')).toContainText('0');

  // 5. Add Woody Ford KB and Memory
  await page.goto('/app/admin.html');
  await page.waitForURL('**/admin.html');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.click('#nav-item-agent');

  // KB tab upload
  await page.click('#agent-tabbtn-kb');
  await page.setInputFiles('#kb-file-input', {
    name: 'wf-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Woody Ford special marketing knowledge: Madill OK is the hometown.')
  });
  await expect(page.locator('.kb-doc-title')).toContainText('wf-notes.txt');

  // Memory tab add
  await page.click('#agent-tabbtn-memory');
  await page.click('button:has-text("+ Add")');
  await page.fill('#mem-new-key', 'Woody Ford Fact');
  await page.fill('#mem-new-val', 'Woody Ford loves trucks.');
  await page.click('button[onclick="AgentPanel.saveNewMemory()"]');
  await expect(page.locator('#mem-list')).toContainText('Woody Ford Fact');

  // 6. Return to agent-chat.html and test containment
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');

  // Woody Ford is active, stats should show 1 each
  await expect(page.locator('#stk')).toContainText('1');
  await expect(page.locator('#stme')).toContainText('1');

  // Mock message generation & check prompt containment
  let interceptedSystemPrompt = '';
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const request = route.request();
    const postData = request.postDataJSON();
    interceptedSystemPrompt = postData.system || '';
    
    const prompt = (postData.messages?.[postData.messages.length - 1]?.content || '').toLowerCase();
    const replyText = prompt.includes('aria') ? 'Aria loves stargazing' : 'Madill OK';
    
    const sse = [
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 50 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: replyText } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 10 } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse.join('\n\n') + '\n\n',
    });
  });

  // Send message for Woody Ford Marketing
  await page.fill('#inp', 'Tell me about Woody Ford Fact');
  await page.click('#snd');
  await expect(page.locator('#msgs')).toContainText('Madill OK');

  // Verify Woody Ford prompt contains Woody Ford knowledge, not Aria
  expect(interceptedSystemPrompt).toContain('Woody Ford special marketing knowledge');
  expect(interceptedSystemPrompt).toContain('Woody Ford Fact');
  expect(interceptedSystemPrompt).not.toContain('Aria special knowledge');
  expect(interceptedSystemPrompt).not.toContain('Aria Fact');

  // Reset interceptor, switch back to Aria (default)
  interceptedSystemPrompt = '';
  await page.click('#syd-btn');
  await presetSelect.selectOption('default');
  await page.click('button:has-text("Apply & Save")');

  // Aria active, stats should show 1 each
  await expect(page.locator('#stk')).toContainText('1');
  await expect(page.locator('#stme')).toContainText('1');

  // Send message for Aria
  await page.fill('#inp', 'Tell me about Aria Fact');
  await page.click('#snd');
  await expect(page.locator('#msgs')).toContainText('Aria loves stargazing');

  // Verify Aria prompt contains Aria knowledge, not Woody Ford
  expect(interceptedSystemPrompt).toContain('Aria special knowledge');
  expect(interceptedSystemPrompt).toContain('Aria Fact');
  expect(interceptedSystemPrompt).not.toContain('Woody Ford special marketing knowledge');
  expect(interceptedSystemPrompt).not.toContain('Woody Ford Fact');
});
