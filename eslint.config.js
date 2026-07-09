// ESLint flat config for a zero-build, multi-script-tag app.
// There is no module system: every app/*.js file runs in the same global
// scope in the browser, so cross-file symbols are declared as globals below
// rather than imported. The highest-value rule here is `no-redeclare` — it
// is what would have caught a duplicate top-level `function` declaration
// silently shadowing another (exactly the class of bug that shipped dead
// code in a previous change).

const js = require('@eslint/js');
const globals = require('globals');

// Top-level `const X = ...` objects each app/*.js file exposes to the
// others via the shared global scope (see app/index.html script order).
const crossFileGlobals = {
  AdminApp: 'readonly',
  Analytics: 'readonly',
  ApiKeyVault: 'readonly',
  ApiRouter: 'readonly',
  AuthSystem: 'readonly',
  BUILT_IN_TOOLS: 'writable',
  GALLERY_TEMPLATES: 'readonly',
  ImageRouter: 'readonly',
  MODELS_DATA: 'readonly',
  MemorySystem: 'readonly',
  SKILLS_DATA: 'readonly',
  STATE: 'writable',
  STORAGE_KEY: 'readonly',
  ServerSync: 'readonly',
  TG_CATEGORIES: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['app/**/*.js'],
    ignores: ['app/cli.py', 'app/server.py'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...crossFileGlobals,
      },
    },
    rules: {
      // builtinGlobals: false — only flag redeclaring a name *within this
      // file's own scope* (e.g. two top-level `function foo()`), not
      // "shadowing" the crossFileGlobals declared above. This is the rule
      // that would have caught the duplicate sendMessageDirect() bug.
      'no-redeclare': ['error', { builtinGlobals: false }],
      // Many top-level functions here are only referenced from inline
      // onclick="..." handlers in the HTML, which a JS-only linter can't
      // see — no-unused-vars would be mostly false positives.
      'no-unused-vars': 'off',
      // Cross-file top-level `function` declarations (e.g. handleSend, toast)
      // are called across script tags via the shared global scope; a static
      // per-file linter can't see those without a much larger manual globals
      // list, so no-undef would be mostly false positives here.
      'no-undef': 'off',
      // Empty `catch {}` is a deliberate "best effort, ignore" pattern used
      // throughout this codebase (parse errors, optional cleanup, etc).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Pre-existing regex/string escapes — not a correctness bug, and
      // auto-fixing regex literals without reviewing each one risks
      // silently changing matching behavior. Tracked, not blocking.
      'no-useless-escape': 'warn',
    },
  },
  {
    files: ['netlify/functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    // E2E specs pass closures to page.evaluate()/page.route() that execute
    // in the *browser* page, not in this Node test process — they reference
    // app globals (ServerSync, ImageRouter, ...) the same way app/*.js does.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...crossFileGlobals },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // Node-side scripts (asset generators, one-off tooling), same treatment
    // as netlify/functions — plus browser globals, since these also pass a
    // closure to Playwright's page.evaluate() that runs client-side.
    files: ['tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
