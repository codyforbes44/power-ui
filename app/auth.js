/* ============================================================
   CLAUDE POWER UI v2 — Authentication System
   Local auth: SHA-256 hashing · Role-based access · Session tokens
   ============================================================ */

const AuthSystem = (() => {

  const USERS_KEY   = 'cpu_auth_users';
  const SESSION_KEY = 'cpu_auth_session';
  const TOKEN_KEY   = 'cpu_auth_token'; // sessionStorage — auto-clears on tab close

  // ──────────────────────────────────────────────────────────
  // Storage helpers
  // ──────────────────────────────────────────────────────────
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
  }
  function saveUsers(arr) { localStorage.setItem(USERS_KEY, JSON.stringify(arr)); }

  function loadSession() {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return null;
      const session = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!session || session.token !== token) return null;
      if (Date.now() > session.expiresAt) {
        clearSession();
        return null;
      }
      return session;
    } catch { return null; }
  }

  function saveSession(session) {
    sessionStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  // ────────────────────────────────────────────────────────
  // Crypto: PBKDF2-SHA256 password hashing + AES-GCM vault key
  // ────────────────────────────────────────────────────────
  const ENC = new TextEncoder();
  const VAULT_KEY_SS = 'cpu_vault_key'; // sessionStorage — cleared on tab close

  function randomHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /**
   * Hash a password.
   * @param {string} algo - 'pbkdf2' (default) or 'sha256' (legacy migration path only)
   */
  async function hashPassword(password, salt, algo = 'pbkdf2') {
    if (algo === 'sha256') {
      // Legacy — used only when migrating existing sha256 accounts
      const buf = await crypto.subtle.digest('SHA-256', ENC.encode(password + salt));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    // PBKDF2-SHA256 · 310,000 iterations (NIST SP 800-132 minimum)
    const keyMat = await crypto.subtle.importKey('raw', ENC.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits   = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: ENC.encode(salt), iterations: 310_000, hash: 'SHA-256' },
      keyMat, 256
    );
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function verifyPassword(password, salt, storedHash, algo = 'pbkdf2') {
    const hash = await hashPassword(password, salt, algo);
    return hash === storedHash;
  }

  /**
   * Derive a 256-bit AES-GCM key from the user's password.
   * Stored in sessionStorage — cleared automatically when the tab closes.
   * Used by ApiKeyVault in app.js to encrypt/decrypt API keys at rest.
   */
  async function deriveVaultKey(password, salt) {
    const keyMat = await crypto.subtle.importKey('raw', ENC.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits   = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: ENC.encode(salt + '_vault'), iterations: 100_000, hash: 'SHA-256' },
      keyMat, 256
    );
    sessionStorage.setItem(VAULT_KEY_SS, btoa(String.fromCharCode(...new Uint8Array(bits))));
  }

  /** Re-derive vault key after a password change (new salt is now in localStorage). */
  async function refreshVaultKey(password) {
    const session = loadSession();
    if (!session) return;
    const user = loadUsers().find(u => u.id === session.userId);
    if (!user) return;
    await deriveVaultKey(password, user.salt);
  }

  function generateToken() { return randomHex(32); }

  // ──────────────────────────────────────────────────────────
  // User operations
  // ──────────────────────────────────────────────────────────
  async function createUser({ username, password, displayName = '', role = 'user' }) {
    const users = loadUsers();
    const uname = username.trim().toLowerCase();
    if (!uname || uname.length < 2) throw new Error('Username must be at least 2 characters.');
    if (users.find(u => u.username === uname)) throw new Error(`Username "${uname}" is already taken.`);
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt); // always pbkdf2

    const user = {
      id:          randomHex(8),
      username:    uname,
      displayName: displayName.trim() || uname,
      role,
      salt,
      passwordHash,
      hashAlgo:    'pbkdf2',
      createdAt:   Date.now(),
      lastLogin:   null,
      active:      true,
      messageCount:0,
      totalCost:   0,
    };
    users.push(user);
    saveUsers(users);
    return sanitize(user);
  }

  async function updatePassword(userId, newPassword) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('User not found.');
    if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    const salt = randomHex(16);
    users[idx].salt         = salt;
    users[idx].passwordHash = await hashPassword(newPassword, salt); // pbkdf2
    users[idx].hashAlgo     = 'pbkdf2';
    saveUsers(users);
    return salt; // returned so callers can re-derive the vault key
  }

  function updateUser(userId, patch) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('User not found.');
    const allowed = ['displayName', 'role', 'active'];
    allowed.forEach(k => { if (patch[k] !== undefined) users[idx][k] = patch[k]; });
    saveUsers(users);
    return sanitize(users[idx]);
  }

  function deleteUser(userId) {
    const users = loadUsers().filter(u => u.id !== userId);
    saveUsers(users);
  }

  function sanitize(user) {
    const { salt, passwordHash, ...safe } = user;
    return safe;
  }

  function listUsers() { return loadUsers().map(sanitize); }

  function getUser(userId) {
    const u = loadUsers().find(u => u.id === userId);
    return u ? sanitize(u) : null;
  }

  // ──────────────────────────────────────────────────────────
  // Login / Logout
  // ──────────────────────────────────────────────────────────
  async function login(username, password) {
    const uname = username.trim().toLowerCase();
    const users  = loadUsers();
    const user   = users.find(u => u.username === uname);

    if (!user)        throw new Error('Invalid username or password.');
    if (!user.active) throw new Error('This account has been deactivated.');

    // Use the stored algorithm (default sha256 for legacy accounts with no hashAlgo field)
    const algo  = user.hashAlgo || 'sha256';
    const valid = await verifyPassword(password, user.salt, user.passwordHash, algo);
    if (!valid) throw new Error('Invalid username or password.');

    // Transparent PBKDF2 migration: if this account still uses SHA-256,
    // re-hash silently with PBKDF2 now that we have the plaintext password.
    const idx = users.findIndex(u => u.id === user.id);
    if (algo === 'sha256') {
      const newHash = await hashPassword(password, user.salt, 'pbkdf2');
      users[idx].passwordHash = newHash;
      users[idx].hashAlgo     = 'pbkdf2';
      saveUsers(users);
      console.log(`✦ AuthSystem: migrated ${uname} → PBKDF2`);
    }

    // Derive AES-GCM vault key from password and store in sessionStorage
    await deriveVaultKey(password, users[idx].salt);

    // Update last login
    users[idx].lastLogin = Date.now();
    saveUsers(users);

    const session = {
      userId:    user.id,
      username:  user.username,
      role:      user.role,
      token:     generateToken(),
      createdAt: Date.now(),
      expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8-hour session
    };
    saveSession(session);
    return sanitize(user);
  }

  function logout() {
    clearSession();
  }

  // ──────────────────────────────────────────────────────────
  // Session accessors
  // ──────────────────────────────────────────────────────────
  function getCurrentSession() { return loadSession(); }

  function getCurrentUser() {
    const session = loadSession();
    if (!session) return null;
    return getUser(session.userId);
  }

  function isLoggedIn() { return !!loadSession(); }

  function isAdmin() {
    const session = loadSession();
    return session?.role === 'admin';
  }

  // ──────────────────────────────────────────────────────────
  // Route guards
  // ──────────────────────────────────────────────────────────
  function requireAuth(redirectTo = 'index.html') {
    if (!isLoggedIn()) {
      if (window.location.href.indexOf(redirectTo) === -1) {
        sessionStorage.setItem('cpu_auth_redirect', window.location.href);
        window.location.href = redirectTo;
      }
      return false;
    }
    return true;
  }

  function requireAdmin(redirectTo = 'index.html') {
    if (!requireAuth(redirectTo)) return false;
    if (!isAdmin()) {
      sessionStorage.setItem('cpu_auth_error', 'Insufficient permissions — admin access required.');
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────
  // User stat tracking (called by analytics)
  // ──────────────────────────────────────────────────────────
  function recordMessageSent(cost = 0) {
    const session = loadSession();
    if (!session) return;
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === session.userId);
    if (idx === -1) return;
    users[idx].messageCount = (users[idx].messageCount || 0) + 1;
    users[idx].totalCost    = (users[idx].totalCost    || 0) + cost;
    saveUsers(users);
  }

  // ──────────────────────────────────────────────────────────
  // First-run: migrate existing state, create admin user
  // ──────────────────────────────────────────────────────────
  async function initAndMigrate() {
    const users = loadUsers();
    if (users.length > 0) return; // already initialized

    // Create default admin with PBKDF2 from the start
    const salt = randomHex(16);
    const passwordHash = await hashPassword('admin123', salt, 'pbkdf2');
    const admin = {
      id:                 randomHex(8),
      username:           'admin',
      displayName:        'Admin',
      role:               'admin',
      salt,
      passwordHash,
      hashAlgo:           'pbkdf2',
      createdAt:          Date.now(),
      lastLogin:          null,
      active:             true,
      messageCount:       0,
      totalCost:          0,
      mustChangePassword: true,
    };
    saveUsers([admin]);
    console.log('✦ AuthSystem: created default admin (PBKDF2) — change password on first login');
  }

  // ──────────────────────────────────────────────────────────
  // UI: render login screen (called by app.js on boot if not logged in)
  // ──────────────────────────────────────────────────────────
  function renderLoginScreen() {
    document.body.classList.add('auth-screen');
    const app = document.getElementById('app');
    if (!app) return;

    const error = sessionStorage.getItem('cpu_auth_error') || '';
    sessionStorage.removeItem('cpu_auth_error');

    app.innerHTML = `
      <div class="auth-overlay">
        <div class="auth-card">
          <div class="auth-logo-wrap">
            <div class="auth-logo">✦</div>
          </div>
          <h1 class="auth-title">Claude Power UI</h1>
          <p class="auth-subtitle">Sign in to your workspace</p>

          ${error ? `<div class="auth-error-banner">${esc(error)}</div>` : ''}

          <form class="auth-form" id="login-form" autocomplete="on">
            <div class="auth-field">
              <label class="auth-label" for="auth-username">Username</label>
              <input
                class="auth-input"
                id="auth-username"
                name="username"
                type="text"
                placeholder="Enter username"
                autocomplete="username"
                autofocus
              />
            </div>
            <div class="auth-field">
              <label class="auth-label" for="auth-password">Password</label>
              <input
                class="auth-input"
                id="auth-password"
                name="password"
                type="password"
                placeholder="Enter password"
                autocomplete="current-password"
              />
            </div>
            <div class="auth-error" id="auth-error-msg" style="display:none"></div>
            <button class="auth-submit" type="submit" id="auth-submit-btn">
              <span id="auth-submit-text">Sign In</span>
              <span id="auth-submit-spinner" style="display:none">⟳</span>
            </button>
          </form>

          <p class="auth-footer-note">
            First time? Use <strong>admin</strong> / <strong>admin123</strong><br/>
            You will be prompted to set a new password on first login.
          </p>
        </div>
        <div id="toast-container"></div>
      </div>
    `;

    // Attach submit handler
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      const btn      = document.getElementById('auth-submit-btn');
      const errEl    = document.getElementById('auth-error-msg');
      const spinner  = document.getElementById('auth-submit-spinner');
      const btnText  = document.getElementById('auth-submit-text');

      errEl.style.display = 'none';
      btn.disabled = true;
      spinner.style.display = 'inline';
      btnText.textContent = 'Signing in…';

      try {
        const user = await login(username, password);
        // Check if password change is required
        if (user.mustChangePassword) {
          renderForcePasswordChange(user);
          return;
        }
        // Restore redirect or reload
        const redirect = sessionStorage.getItem('cpu_auth_redirect');
        sessionStorage.removeItem('cpu_auth_redirect');
        if (redirect && redirect !== window.location.href) {
          window.location.href = redirect;
        } else {
          window.location.reload();
        }
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        spinner.style.display = 'none';
        btnText.textContent = 'Sign In';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-password').focus();
      }
    });
  }

  // Helper for the login screen (no access to main app's esc())
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ──────────────────────────────────────────────────────────
  // Force password change screen (shown after first login)
  // ──────────────────────────────────────────────────────────
  function renderForcePasswordChange(user) {
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `
      <div class="auth-overlay">
        <div class="auth-card">
          <div class="auth-logo-wrap"><div class="auth-logo">🔑</div></div>
          <h1 class="auth-title">Set a New Password</h1>
          <p class="auth-subtitle">Welcome! For security, please choose a new password before continuing.</p>
          <form class="auth-form" id="change-pw-form" autocomplete="off">
            <div class="auth-field">
              <label class="auth-label" for="new-pw">New Password</label>
              <input class="auth-input" id="new-pw" type="password" placeholder="Min 6 characters" autofocus />
            </div>
            <div class="auth-field">
              <label class="auth-label" for="confirm-pw">Confirm Password</label>
              <input class="auth-input" id="confirm-pw" type="password" placeholder="Repeat new password" />
            </div>
            <div class="auth-error" id="change-pw-error" style="display:none"></div>
            <button class="auth-submit" type="submit">Set Password &amp; Continue</button>
          </form>
        </div>
      </div>
    `;
    document.getElementById('change-pw-form').addEventListener('submit', async e => {
      e.preventDefault();
      const pw1 = document.getElementById('new-pw').value;
      const pw2 = document.getElementById('confirm-pw').value;
      const errEl = document.getElementById('change-pw-error');
      errEl.style.display = 'none';
      if (pw1.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
      if (pw1 !== pw2)   { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
      try {
        const newSalt = await updatePassword(user.id, pw1);
        // Derive new vault key with new password + new salt (old vault key is now invalid)
        await deriveVaultKey(pw1, newSalt);
        // Clear the mustChangePassword flag
        const users = loadUsers();
        const idx = users.findIndex(u => u.id === user.id);
        if (idx !== -1) { users[idx].mustChangePassword = false; saveUsers(users); }
        window.location.reload();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────
  return {
    init:              initAndMigrate,
    login,
    logout,
    createUser,
    updatePassword,
    updateUser,
    deleteUser,
    listUsers,
    getUser,
    getCurrentUser,
    getCurrentSession,
    isLoggedIn,
    isAdmin,
    requireAuth,
    requireAdmin,
    recordMessageSent,
    renderLoginScreen,
    refreshVaultKey,   // for re-deriving vault key after external password change
  };

})();
