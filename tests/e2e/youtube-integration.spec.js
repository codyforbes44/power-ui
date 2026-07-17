'use strict';

const { test, expect, saveApiKey } = require('./fixtures');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, x-key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

async function saveYoutubeCookies(page, cookiesVal) {
  await page.goto('/app/admin.html');
  const hamburger = page.locator('button[onclick="AdminApp.toggleSidebar()"]');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.click('#nav-item-connections');
  const input = page.locator('#key-input-youtube_cookies');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(cookiesVal);
  await page.click('button[onclick="AdminApp.saveYoutubeCookies()"]');
  await expect(page.locator('#pill-youtube_cookies')).toContainText('Configured', { timeout: 5_000 });
}

test.describe('YouTube Integration', () => {

  test('Search and play a video via /play slash command', async ({ loggedInPage: page }) => {
    // 1. Configure the YouTube API Key in settings
    await saveApiKey(page, 'youtube', 'yt-mock-api-key');

    // 2. Mock Netlify proxy YouTube Search response
    await page.route('**/functions/proxy', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }

      const body = JSON.parse(request.postData() || '{}');
      if (body.provider === 'youtube' && body.path === '/search') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS_HEADERS,
          body: JSON.stringify({
            items: [
              {
                id: { videoId: 'dQw4w9WgXcQ' },
                snippet: {
                  title: 'Rick Astley - Never Gonna Give You Up',
                  description: 'Official music video.'
                }
              }
            ]
          }),
        });
        return;
      }

      await route.fallback();
    });

    // 3. Go to app, trigger play command
    await page.goto('/app/');
    await expect(page.locator('#message-input')).toBeVisible();

    await page.fill('#message-input', '/play rick astley');
    await page.click('#send-btn');

    // 4. Verify user message and iframe render
    const userMsg = page.locator('.message.user .message-bubble');
    await expect(userMsg).toContainText('/play rick astley');

    const iframe = page.locator('.yt-embed-container iframe');
    await expect(iframe).toBeVisible({ timeout: 15_000 });
    await expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('Create a playlist via /playlist slash command using cookies', async ({ loggedInPage: page }) => {
    // 1. Configure YouTube API Key and YouTube Cookies in settings
    await saveApiKey(page, 'youtube', 'yt-mock-api-key');
    await saveYoutubeCookies(page, 'SID=mock-sid; HSID=mock-hsid;');

    // 2. Mock Netlify proxy YouTube Innertube Playlist Create response
    await page.route('**/functions/proxy', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }

      const body = JSON.parse(request.postData() || '{}');
      if (body.provider === 'youtube_innertube' && body.path.startsWith('/youtubei/v1/playlist/create')) {
        // Assert cookies were passed correctly
        expect(body.apiKey).toBe('SID=mock-sid; HSID=mock-hsid;');
        expect(body.payload.title).toBe('My lofi playlist');
        expect(body.payload.videoIds).toEqual(['dQw4w9WgXcQ']);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS_HEADERS,
          body: JSON.stringify({
            playlistId: 'PL_mock_lofi_playlist_123'
          }),
        });
        return;
      }

      await route.fallback();
    });

    // 3. Go to app, trigger playlist command
    await page.goto('/app/');
    await expect(page.locator('#message-input')).toBeVisible();

    await page.fill('#message-input', '/playlist "My lofi playlist" dQw4w9WgXcQ');
    await page.click('#send-btn');

    // 4. Verify success bubble is rendered
    const assistantMsg = page.locator('.message.assistant .message-bubble');
    await expect(assistantMsg).toContainText('Playlist My lofi playlist created successfully!', { timeout: 15_000 });

    const link = assistantMsg.locator('a');
    await expect(link).toHaveAttribute('href', 'https://www.youtube.com/playlist?list=PL_mock_lofi_playlist_123');
  });

});
