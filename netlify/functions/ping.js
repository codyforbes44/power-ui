// Netlify Function: /api/ping
// Returns 200 OK so ServerSync.probe() succeeds and knows server features are not available.
// This is intentionally minimal — it just signals "I'm a static Netlify deploy, no server sync."
exports.handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify({ ok: true, mode: 'static', sync: false }),
});
