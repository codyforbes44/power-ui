'use strict';

// renderMarkdown() lives inside app/app.js, which does heavy browser-dependent
// module-init work at load time. Rather than boot the whole module, we extract
// just the self-contained renderMarkdown function (it only uses String ops and
// its own inner helpers) and evaluate it in isolation. This keeps the XSS
// assertions fast and dependency-free.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in app.js`);
  // Find the opening brace, then match braces to locate the end.
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const appSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'app.js'),
  'utf8'
);
const renderMarkdown = new Function(
  `${extractFunction(appSource, 'renderMarkdown')}; return renderMarkdown;`
)();

// A payload is inert if none of its raw HTML-significant markup survived into
// the output. Because renderMarkdown escapes '<' -> '&lt;' up front, any
// attacker tag/attribute becomes literal display text (e.g. "&lt;img
// onerror=...&gt;") which the browser will NOT execute. So the security check
// is: no raw opening tag for a dangerous element, and no javascript: href.
function assertInert(input) {
  const out = renderMarkdown(input);
  assert.ok(!/<img/i.test(out), `raw <img> tag survived: ${out}`);
  assert.ok(!/<script/i.test(out), `raw <script> tag survived: ${out}`);
  assert.ok(!/<svg/i.test(out), `raw <svg> tag survived: ${out}`);
  // Event-handler attributes are only dangerous inside a real (unescaped) tag.
  // Confirm none appears immediately after an unescaped '<...'.
  assert.ok(!/<[a-z][^>]*\son(error|load|click)\s*=/i.test(out),
    `live event handler inside a real tag survived: ${out}`);
  assert.ok(!/href\s*=\s*["']?javascript:/i.test(out), `javascript: href survived: ${out}`);
  return out;
}

test('escapes raw img/onerror payload', () => {
  const out = assertInert('Hello <img src=x onerror=alert(document.cookie)>');
  assert.ok(out.includes('&lt;img'), `expected escaped img: ${out}`);
});

test('escapes raw script tag', () => {
  const out = assertInert('<script>alert(1)</script>');
  assert.ok(out.includes('&lt;script&gt;'), `expected escaped script: ${out}`);
});

test('escapes raw svg onload', () => {
  assertInert('<svg onload=alert(1)>');
});

test('neutralizes javascript: markdown link', () => {
  const out = assertInert('[x](javascript:alert(1))');
  assert.ok(out.includes('href="#"'), `expected href="#": ${out}`);
});

test('still renders legitimate markdown', () => {
  assert.ok(renderMarkdown('**bold**').includes('<strong>bold</strong>'));
  assert.ok(renderMarkdown('*it*').includes('<em>it</em>'));
  assert.ok(renderMarkdown('# Title').includes('<h1>Title</h1>'));
  assert.ok(renderMarkdown('> quote').includes('<blockquote>quote</blockquote>'));
  const link = renderMarkdown('[Anthropic](https://anthropic.com)');
  assert.ok(link.includes('href="https://anthropic.com"'), link);
  assert.ok(link.includes('>Anthropic</a>'), link);
});

test('code block content is escaped exactly once (no double-escape)', () => {
  const out = renderMarkdown('```js\nconst x = "<div>";\n```');
  assert.ok(out.includes('&lt;div&gt;'), `expected single-escaped tag: ${out}`);
  assert.ok(!out.includes('&amp;lt;'), `double-escaped: ${out}`);
  assert.ok(!/<div>/.test(out), `raw div survived in code block: ${out}`);
});

test('inline code is escaped', () => {
  const out = renderMarkdown('use `<b>` here');
  assert.ok(out.includes('<code>&lt;b&gt;</code>'), out);
});
