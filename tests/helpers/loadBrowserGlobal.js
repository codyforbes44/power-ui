'use strict';

// app/*.js are loaded as plain <script> tags in the browser (no module
// system) and expose their public API as a single top-level `const X = …`.
// To unit-test the pure logic inside them (cost math, TF-IDF scoring, model
// registry lookups) without a real browser, this loader evaluates the file
// in a `vm` sandbox that provides just enough of the browser surface
// (localStorage/sessionStorage/crypto) for module-init code to run, and
// returns the requested global.
//
// This is intentionally NOT a DOM shim — files that touch `document` at
// call time (not just at load time) are exercised by the Playwright E2E
// suite instead, where they run in a real browser.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

/**
 * @param {string} relativePath - path to the app/*.js file, relative to repo root
 * @param {string} globalName - the top-level const it defines (e.g. 'MODELS_DATA')
 * @param {object} [extraGlobals] - additional sandbox globals for this specific module
 */
function loadBrowserGlobal(relativePath, globalName, extraGlobals = {}) {
  const filePath = path.join(__dirname, '..', '..', relativePath);
  let source = fs.readFileSync(filePath, 'utf8');

  // Strip ES Module imports and exports to support script-mode vm running
  source = source.replace(/^[ \t]*import\s+[\s\S]*?from\s+['"].*?['"];?/gm, '');
  source = source.replace(/^[ \t]*export\s+default\s+/gm, '');
  source = source.replace(/^[ \t]*export\s+/gm, '');

  const sandbox = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    crypto: webcrypto,
    console,
    fetch: async () => { throw new Error('fetch() is not available in the unit-test sandbox'); },
    addEventListener: () => {},
    removeEventListener: () => {},
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  // Top-level `const`/`let` in a vm-run script bind to that script's own
  // lexical scope, not to the context object — unlike `var`, they never
  // become properties of the sandbox. Appending an epilogue in the *same*
  // script keeps it in that lexical scope, so it can still see the const
  // and copy it onto the sandbox explicitly.
  const instrumented = `${source}\nthis.__EXPORTED__ = ${globalName};`;
  vm.runInContext(instrumented, context, { filename: filePath });

  if (context.__EXPORTED__ === undefined) {
    throw new Error(`${relativePath} did not define global '${globalName}'`);
  }
  return context.__EXPORTED__;
}

module.exports = { loadBrowserGlobal, makeStorage };
