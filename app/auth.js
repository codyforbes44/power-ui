/* ============================================================
   CLAUDE POWER UI v2 — Authentication System
   Local auth: SHA-256 hashing · Role-based access · Session tokens
   ============================================================ */

// ──────────────────────────────────────────────────────────
// Cryptographic Polyfill for Insecure Contexts (e.g. mobile LAN access)
// ──────────────────────────────────────────────────────────
(function() {
  let needPolyfill = false;
  try {
    if (!window.crypto || !window.crypto.subtle) {
      needPolyfill = true;
    }
  } catch (e) {
    needPolyfill = true;
  }

  if (!needPolyfill) return;

  // Self-contained SHA-256 implementation
  function sha256(bytes) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    const H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);

    const l = bytes.length;
    const n = ((l + 8) >> 6) + 1;
    const w = new Uint32Array(n * 16);
    for (let i = 0; i < l; i++) {
      w[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
    }
    w[l >> 2] |= 0x80 << (24 - (l & 3) * 8);
    w[n * 16 - 1] = l * 8;

    const W = new Uint32Array(64);
    const v = new Uint32Array(8);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 16; j++) W[j] = w[i * 16 + j];
      for (let j = 16; j < 64; j++) {
        const s0 = ((W[j - 15] >>> 7) | (W[j - 15] << 25)) ^ ((W[j - 15] >>> 18) | (W[j - 15] << 14)) ^ (W[j - 15] >>> 3);
        const s1 = ((W[j - 2] >>> 17) | (W[j - 2] << 15)) ^ ((W[j - 2] >>> 19) | (W[j - 2] << 13)) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
      }

      for (let j = 0; j < 8; j++) v[j] = H[j];

      for (let j = 0; j < 64; j++) {
        const S1 = ((v[4] >>> 6) | (v[4] << 26)) ^ ((v[4] >>> 11) | (v[4] << 21)) ^ ((v[4] >>> 25) | (v[4] << 7));
        const ch = (v[4] & v[5]) ^ (~v[4] & v[6]);
        const temp1 = (v[7] + S1 + ch + K[j] + W[j]) | 0;
        const S0 = ((v[0] >>> 2) | (v[0] << 30)) ^ ((v[0] >>> 13) | (v[0] << 19)) ^ ((v[0] >>> 22) | (v[0] << 10));
        const maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
        const temp2 = (S0 + maj) | 0;

        v[7] = v[6];
        v[6] = v[5];
        v[5] = v[4];
        v[4] = (v[3] + temp1) | 0;
        v[3] = v[2];
        v[2] = v[1];
        v[1] = v[0];
        v[0] = (temp1 + temp2) | 0;
      }

      for (let j = 0; j < 8; j++) H[j] = (H[j] + v[j]) | 0;
    }

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      out[i * 4]     = H[i] >>> 24;
      out[i * 4 + 1] = H[i] >>> 16;
      out[i * 4 + 2] = H[i] >>> 8;
      out[i * 4 + 3] = H[i];
    }
    return out;
  }

  // Self-contained HMAC-SHA256 implementation
  function hmac_sha256(key, message) {
    let k = new Uint8Array(64);
    if (key.length > 64) {
      k.set(sha256(key));
    } else {
      k.set(key);
    }

    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      ipad[i] = k[i] ^ 0x36;
      opad[i] = k[i] ^ 0x5c;
    }

    const innerMsg = new Uint8Array(64 + message.length);
    innerMsg.set(ipad);
    innerMsg.set(message, 64);
    const innerHash = sha256(innerMsg);

    const outerMsg = new Uint8Array(64 + 32);
    outerMsg.set(opad);
    outerMsg.set(innerHash, 64);
    return sha256(outerMsg);
  }

  // Self-contained PBKDF2-SHA256 implementation
  function pbkdf2_sha256(password, salt, iterations, keyLen) {
    const derivedKey = new Uint8Array(keyLen);
    const blockCount = Math.ceil(keyLen / 32);
    const u = new Uint8Array(32);
    const t = new Uint8Array(32);
    const d = new Uint8Array(salt.length + 4);
    d.set(salt);

    for (let i = 1; i <= blockCount; i++) {
      d[salt.length]     = (i >>> 24) & 0xff;
      d[salt.length + 1] = (i >>> 16) & 0xff;
      d[salt.length + 2] = (i >>> 8) & 0xff;
      d[salt.length + 3] = i & 0xff;

      let ui = hmac_sha256(password, d);
      t.set(ui);

      for (let j = 1; j < iterations; j++) {
        ui = hmac_sha256(password, ui);
        for (let k = 0; k < 32; k++) {
          t[k] ^= ui[k];
        }
      }

      const offset = (i - 1) * 32;
      const count = Math.min(32, keyLen - offset);
      for (let k = 0; k < count; k++) {
        derivedKey[offset + k] = t[k];
      }
    }

    return derivedKey;
  }

  // Self-contained SHA-256 CTR stream cipher (acting as AES-GCM replacement for vault)
  function cryptSHA256CTR(keyBytes, ivBytes, dataBytes) {
    const out = new Uint8Array(dataBytes.length);
    const blockInput = new Uint8Array(keyBytes.length + ivBytes.length + 4);
    blockInput.set(keyBytes, 0);
    blockInput.set(ivBytes, keyBytes.length);
    
    const numBlocks = Math.ceil(dataBytes.length / 32);
    for (let i = 0; i < numBlocks; i++) {
      blockInput[blockInput.length - 4] = (i >>> 24) & 0xff;
      blockInput[blockInput.length - 3] = (i >>> 16) & 0xff;
      blockInput[blockInput.length - 2] = (i >>> 8) & 0xff;
      blockInput[blockInput.length - 1] = i & 0xff;
      
      const blockHash = sha256(blockInput);
      const offset = i * 32;
      const limit = Math.min(32, dataBytes.length - offset);
      for (let j = 0; j < limit; j++) {
        out[offset + j] = dataBytes[offset + j] ^ blockHash[j];
      }
    }
    return out;
  }

  const polyfillSubtle = {
    async digest(algo, data) {
      if (algo.toUpperCase() !== 'SHA-256') throw new Error('Unsupported digest algorithm');
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      return sha256(bytes).buffer;
    },
    async importKey(format, keyData, algorithm, extractable, keyUsages) {
      const rawKey = keyData instanceof Uint8Array ? keyData : new Uint8Array(keyData);
      return {
        type: 'secret',
        extractable,
        algorithm,
        usages: keyUsages,
        _rawKey: rawKey
      };
    },
    async deriveBits(algorithm, baseKey, numberOfBits) {
      if (algorithm.name.toUpperCase() !== 'PBKDF2') throw new Error('Unsupported derivation algorithm');
      const password = baseKey._rawKey;
      const salt = algorithm.salt instanceof Uint8Array ? algorithm.salt : new Uint8Array(algorithm.salt);
      const iterations = algorithm.iterations;
      const keyLen = numberOfBits / 8;
      return pbkdf2_sha256(password, salt, iterations, keyLen).buffer;
    },
    async encrypt(algorithm, key, data) {
      const iv = algorithm.iv instanceof Uint8Array ? algorithm.iv : new Uint8Array(algorithm.iv);
      const plaintext = data instanceof Uint8Array ? data : new Uint8Array(data);
      return cryptSHA256CTR(key._rawKey, iv, plaintext).buffer;
    },
    async decrypt(algorithm, key, data) {
      const iv = algorithm.iv instanceof Uint8Array ? algorithm.iv : new Uint8Array(algorithm.iv);
      const ciphertext = data instanceof Uint8Array ? data : new Uint8Array(data);
      return cryptSHA256CTR(key._rawKey, iv, ciphertext).buffer;
    }
  };

  try {
    if (!window.crypto) {
      window.crypto = {};
    }
    if (!window.crypto.subtle) {
      Object.defineProperty(window.crypto, 'subtle', {
        value: polyfillSubtle,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
    if (!window.crypto.getRandomValues) {
      window.crypto.getRandomValues = function(array) {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      };
    }
  } catch (e) {
    try {
      window.crypto = {
        subtle: polyfillSubtle,
        getRandomValues: function(array) {
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
          }
          return array;
        }
      };
    } catch (err) {}
  }
})();

export const AuthSystem = (() => {

  const USERS_KEY   = 'cpu_auth_users';
  const SESSION_KEY = 'cpu_auth_session';
  const TOKEN_KEY   = 'cpu_auth_token'; // sessionStorage — auto-clears on tab close

  // Usernames that are always granted admin role regardless of how they sign up.
  // Add the app owner's username here to guarantee permanent admin access.
  const SUPER_ADMINS = new Set(['cody', 'admin']);

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
  // Firebase Auth bridge (best-effort, local-first)
  // ──────────────────────────────────────────────────────────
  // The primary AuthSystem is local (localStorage). We ALSO sign the same
  // credentials into Firebase Email/Password Auth so that request.auth.uid
  // is populated and firestore.rules can enforce per-user isolation.
  //
  // The synthetic email is DETERMINISTIC: same username → same email → same
  // Firebase UID on every device, which is what preserves cross-device sync.
  // Usernames are therefore treated as IMMUTABLE for sync stability — renaming
  // a username would change its Firebase UID and orphan the synced state.
  // (AuthSystem exposes no rename path, so this holds today.)
  //
  // Every call here is guarded and time-bounded: a Firebase failure or a slow
  // network must NEVER block or delay the local AuthSystem flow (tests also
  // run with no Firebase SDK loaded at all).
  const FIREBASE_EMAIL_DOMAIN = 'async-power-ui-2026.firebaseapp.com';
  const FIREBASE_MIN_PASSWORD = 6; // Firebase Email/Password minimum length

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Build a deterministic, COLLISION-SAFE synthetic email for a username.
  // A readable sanitized prefix ([a-z0-9._-], ≤24 chars) is ALWAYS combined
  // with a sha-256 suffix of the full lowercased username, so distinct
  // usernames that sanitize to the same prefix (e.g. "john+doe" and "johndoe"
  // both → "johndoe") still map to DIFFERENT emails → different Firebase UIDs.
  // Without the always-on hash suffix those two accounts would merge into one
  // Firebase UID and share state. Deterministic across devices; local-part is
  // ≤24+1+16 = 41 chars, well within the 64-char RFC limit.
  async function firebaseSyntheticEmail(username) {
    const lower = String(username == null ? '' : username).trim().toLowerCase();
    const sanitized = lower.replace(/[^a-z0-9._-]/g, '').replace(/^\.+/, '').replace(/\.+$/, '');
    const safe = sanitized.slice(0, 24) || 'u';
    const suffix = (await sha256Hex(lower)).slice(0, 16);
    return `${safe}_${suffix}@${FIREBASE_EMAIL_DOMAIN}`;
  }

  // Resolve once window.firebaseAuth exists (the Auth SDK loads dynamically
  // after page load), bounded by timeoutMs so it never hangs. Resolves null
  // if the SDK never becomes available in time.
  function waitForFirebaseAuth(timeoutMs = 5000) {
    if (window.firebaseAuth) return Promise.resolve(window.firebaseAuth);
    return new Promise(resolve => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.firebaseAuth) { clearInterval(iv); resolve(window.firebaseAuth); }
        else if (Date.now() - start >= timeoutMs) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  async function _ensureFirebaseUserInner(username, password, oldUserId) {
    const fb = await waitForFirebaseAuth(5000);
    if (!fb) return null; // Auth SDK not ready in time — best-effort no-op
    const email = await firebaseSyntheticEmail(username);
    let fbUser = null;
    try {
      const cred = await fb.signInWithEmailAndPassword(email, password);
      fbUser = (cred && cred.user) ? cred.user : (fb.currentUser || null);
    } catch (err) {
      const code = err && err.code;
      if (code === 'auth/user-not-found' ||
          code === 'auth/invalid-login-credentials' ||
          code === 'auth/invalid-credential') {
        // No Firebase account yet — create one with the same credentials.
        if (!password || password.length < FIREBASE_MIN_PASSWORD) {
          console.warn(`ensureFirebaseUser: password shorter than Firebase minimum (${FIREBASE_MIN_PASSWORD}) — skipping cloud account creation`);
          return null;
        }
        try {
          const cred = await fb.createUserWithEmailAndPassword(email, password);
          fbUser = (cred && cred.user) ? cred.user : (fb.currentUser || null);
        } catch (createErr) {
          const ccode = createErr && createErr.code;
          if (ccode === 'auth/email-already-in-use') {
            // Race: account created between our sign-in and create attempts.
            try {
              const cred = await fb.signInWithEmailAndPassword(email, password);
              fbUser = (cred && cred.user) ? cred.user : (fb.currentUser || null);
            } catch (e2) {
              console.warn('ensureFirebaseUser: retry sign-in failed', e2 && e2.code);
              return null;
            }
          } else if (ccode === 'auth/weak-password') {
            console.warn('ensureFirebaseUser: firebase rejected weak password — cloud auth unavailable for this account');
            return null;
          } else {
            console.warn('ensureFirebaseUser: create failed', ccode);
            return null;
          }
        }
      } else {
        // Wrong password on an existing Firebase account, network error,
        // provider disabled, etc. — log and continue with local auth only.
        console.warn('ensureFirebaseUser: sign-in failed', code || (err && err.message));
        return null;
      }
    }

    // Signed into Firebase — kick off the one-time Firestore state migration
    // (old AuthSystem-id doc → Firebase-UID doc) in the BACKGROUND.
    if (fbUser && oldUserId && typeof window.__cpuMigrateFirestoreState === 'function') {
      Promise.resolve(window.__cpuMigrateFirestoreState(oldUserId)).catch(() => {});
    }
    return fbUser;
  }

  // Public entry point: bounded by a timeout so a hung Firebase network can
  // never leave a pending promise around. login() fires this WITHOUT awaiting
  // (local-first). Note: the loser of the race is NOT cancelled, so a slow
  // sign-in that completes after the timeout still triggers the background
  // migration above — the timeout only caps what the caller could await.
  function ensureFirebaseUser(username, password, oldUserId) {
    const work = _ensureFirebaseUserInner(username, password, oldUserId)
      .catch(e => { console.warn('ensureFirebaseUser: error', e && (e.code || e.message)); return null; });
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 6000));
    return Promise.race([work, timeout]);
  }

  function getFirebaseUid() {
    try { return (window.firebaseAuth && window.firebaseAuth.currentUser && window.firebaseAuth.currentUser.uid) || null; }
    catch { return null; }
  }

  // ──────────────────────────────────────────────────────────
  // User operations
  // ──────────────────────────────────────────────────────────
  async function createUser({ username, password, displayName = '', role = 'user' }) {
    const users = loadUsers();
    const uname = username.trim().toLowerCase();
    if (!uname || uname.length < 2) throw new Error('Username must be at least 2 characters.');
    if (users.find(u => u.username === uname)) throw new Error(`Username "${uname}" is already taken.`);
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

    // Super-admins always get admin role, regardless of what was passed
    const assignedRole = SUPER_ADMINS.has(uname) ? 'admin' : role;

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt); // always pbkdf2

    const user = {
      id:          randomHex(8),
      username:    uname,
      displayName: displayName.trim() || uname,
      role:        assignedRole,
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
    // NOTE: intentionally NO Firebase call here. createUser can be invoked by
    // an admin creating OTHER users; signInWithEmailAndPassword /
    // createUserWithEmailAndPassword would hijack window.firebaseAuth.currentUser
    // (Firebase is a singleton per tab), corrupting the admin's own sync UID.
    // The Firebase account is created/linked lazily in login(), where the
    // acting user is signing in as themselves.
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
    // Best-effort: keep the Firebase Auth password in sync — but ONLY when the
    // caller is changing THEIR OWN password. An admin resetting another user's
    // password must never mutate the admin's own Firebase credential. Guard on
    // both (a) the target userId matching the current session and (b) the
    // signed-in Firebase account's email matching that user's synthetic email.
    try {
      const session = loadSession();
      const fbUser  = window.firebaseAuth && window.firebaseAuth.currentUser;
      if (!fbUser) {
        console.warn('updatePassword: not signed into Firebase — cloud password not updated');
      } else if (!session || session.userId !== userId) {
        console.warn('updatePassword: target is not the current session user — skipping Firebase password sync');
      } else {
        const expectedEmail = await firebaseSyntheticEmail(session.username);
        if (fbUser.email && fbUser.email.toLowerCase() === expectedEmail.toLowerCase()) {
          await fbUser.updatePassword(newPassword);
        } else {
          console.warn('updatePassword: Firebase currentUser email does not match session user — skipping Firebase password sync');
        }
      }
    } catch (e) {
      console.warn('updatePassword: firebase sync skipped', e && (e.code || e.message));
    }
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

    // Local-first: the session + vault key are already established, so login()
    // returns immediately. Signing into Firebase Auth (which populates
    // request.auth.uid for firestore.rules) and the one-time Firestore state
    // migration run in the BACKGROUND — fire-and-forget, NOT awaited. This is
    // deliberate: a slow or blocked Firebase network must never delay login.
    // ensureFirebaseUser waits for the Auth SDK (bounded), races a ~6s timeout,
    // and triggers window.__cpuMigrateFirestoreState(user.id) internally after
    // a successful sign-in, so the migration is not duplicated here.
    ensureFirebaseUser(uname, password, user.id).catch(() => {});

    return sanitize(user);
  }

  function logout() {
    clearSession();
    // Best-effort: also sign out of Firebase Auth.
    try {
      if (window.firebaseAuth) window.firebaseAuth.signOut().catch(() => {});
    } catch (e) { /* ignore */ }
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
    if (!session) return false;
    // Check session role first (fast path)
    if (session.role === 'admin') return true;
    // Fallback: check the stored user record — covers cases where the session
    // was created before a SUPER_ADMINS promotion ran (e.g. cody signed up
    // before the admin designation was deployed). Also updates the session
    // in-place so subsequent calls use the fast path.
    const user = getUser(session.userId);
    if (user?.role === 'admin') {
      session.role = 'admin';
      saveSession(session);
      return true;
    }
    return false;
  }

  function isSuperAdmin() {
    const session = loadSession();
    if (!session) return false;
    // Fast path: the session snapshot already identifies a super-admin.
    if (SUPER_ADMINS.has(session.username) || session.role === 'super_admin') return true;
    // Fallback: consult the authoritative stored user record — mirrors the
    // fallback isAdmin() already has. A session created before the super-admin
    // designation was deployed can carry a stale role or a missing/renamed
    // username field; without this, agent-chat.html's super-admin gate rejects
    // a user (e.g. cody) that isAdmin()-based surfaces (admin dashboard, the
    // main app's SUPER badge) accept. Repair the session in-place so later
    // fast-path checks succeed.
    const user = getUser(session.userId);
    if (user && (SUPER_ADMINS.has(user.username) || user.role === 'super_admin')) {
      if (user.role === 'super_admin') session.role = 'super_admin';
      else if (session.role !== 'admin') session.role = 'admin';
      saveSession(session);
      return true;
    }
    return false;
  }

  // ──────────────────────────────────────────────────────────
  // Route guards
  // ──────────────────────────────────────────────────────────
  // login() creates a valid session immediately, before the caller has
  // acted on user.mustChangePassword — that flag was previously only
  // enforced by the login form's own submit handler choosing to render
  // renderForcePasswordChange(). Any other navigation to an authenticated
  // page (back button, new tab, direct URL, a reload after login) skipped
  // it entirely: the session was already valid, so isLoggedIn() passed and
  // the app just booted normally on the untouched default password. This
  // re-checks the flag at every auth gate, not just the one code path.
  function checkPasswordChangeRequired() {
    const user = getCurrentUser();
    if (user?.mustChangePassword) {
      // If we're on admin.html (no #app element), hide the loading overlay first
      // so the password-change form isn't buried under the spinner.
      const loadingEl = document.getElementById('admin-loading');
      if (loadingEl) loadingEl.style.display = 'none';
      renderForcePasswordChange(user);
      return true;
    }
    return false;
  }

  function requireAuth(redirectTo = 'index.html') {
    if (!isLoggedIn()) {
      if (window.location.href.indexOf(redirectTo) === -1) {
        sessionStorage.setItem('cpu_auth_redirect', window.location.href);
        // On pages without a local #app element (e.g. admin.html), the relative
        // 'index.html' redirect resolves to /app/index.html which may 404 or loop.
        // Use the public login page as an absolute fallback to avoid a silent hang.
        const target = document.getElementById('app')
          ? redirectTo
          : (redirectTo === 'index.html' ? '/public/login.html' : redirectTo);
        window.location.href = target;
      }
      return false;
    }
    if (checkPasswordChangeRequired()) return false;
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
  // Process intents forwarded from /public/login.html
  // ──────────────────────────────────────────────────────────
  /**
   * Handle a Netlify Identity (Google OAuth) login.
   * Creates a local user account if one does not already exist,
   * then establishes a local session so requireAuth() passes.
   */
  async function netlifyIdentityLogin(niUser) {
    if (!niUser || !niUser.id) return null;
    const users = loadUsers();
    // Use email as the canonical identifier for NI users
    const email  = niUser.email || '';
    const uname  = 'ni_' + niUser.id.slice(0, 12); // stable local username
    let user = users.find(u => u.niId === niUser.id || u.username === uname);

    if (!user) {
      // Auto-create a local account for this NI identity
      const salt = randomHex(16);
      // Use NI token as pseudo-password (never actually used for PW login)
      const passwordHash = await hashPassword(niUser.token || niUser.id, salt, 'pbkdf2');
      user = {
        id:          randomHex(8),
        username:    uname,
        displayName: niUser.name || email.split('@')[0] || 'User',
        email,
        role:        'user',
        niId:        niUser.id,
        niProvider:  niUser.provider || 'google',
        salt,
        passwordHash,
        hashAlgo:    'pbkdf2',
        createdAt:   Date.now(),
        lastLogin:   Date.now(),
        active:      true,
        messageCount:0,
        totalCost:   0,
      };
      users.push(user);
      saveUsers(users);
      console.log(`✦ AuthSystem: auto-created NI user → ${uname} (${email})`);
    } else {
      // Update last login
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) { users[idx].lastLogin = Date.now(); saveUsers(users); }
    }

    // Derive a stable vault key from the NI token so vault functions work
    await deriveVaultKey(niUser.token || niUser.id, user.salt);

    const session = {
      userId:    user.id,
      username:  user.username,
      role:      user.role,
      token:     generateToken(),
      createdAt: Date.now(),
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
    };
    saveSession(session);
    return sanitize(user);
  }

  async function initAndMigrate() {
    // ── Process intents forwarded from /public/login.html ──
    // These are set by the login page before redirecting here.

    // 1. Netlify Identity (Google OAuth) session
    const niRaw = sessionStorage.getItem('cpu_ni_login');
    if (niRaw) {
      sessionStorage.removeItem('cpu_ni_login');
      try {
        const niUser = JSON.parse(niRaw);
        await netlifyIdentityLogin(niUser);
        // Clear URL param without reload
        const url = new URL(location.href);
        url.searchParams.delete('ni');
        history.replaceState({}, '', url);
        return; // session established — skip normal init
      } catch(e) { console.warn('AuthSystem: NI login error', e); }
    }

    // 2. Signup intent (new account registration)
    const suRaw = sessionStorage.getItem('cpu_signup_intent');
    if (suRaw) {
      sessionStorage.removeItem('cpu_signup_intent');
      try {
        const { username, displayName, password } = JSON.parse(suRaw);
        // Ensure first-run admin exists before we add the new user
        const existing = loadUsers();
        if (existing.length === 0) {
          // No admin yet — run first-run init first, then create the user below
          const salt = randomHex(16);
          const passwordHash = await hashPassword('admin123', salt, 'pbkdf2');
          const admin = {
            id: randomHex(8), username: 'admin', displayName: 'Admin',
            role: 'admin', salt, passwordHash, hashAlgo: 'pbkdf2',
            createdAt: Date.now(), lastLogin: null, active: true,
            messageCount: 0, totalCost: 0, mustChangePassword: true,
          };
          saveUsers([admin]);
          console.log('✦ AuthSystem: auto-created admin on first signup');
        }
        await createUser({ username, displayName, password, role: 'user' });
        const user = await login(username, password);
        const url = new URL(location.href);
        url.searchParams.delete('signup');
        history.replaceState({}, '', url);
        console.log(`✦ AuthSystem: signup + login → ${username}`);
        return;
      } catch(e) {
        console.warn('AuthSystem: signup intent error', e);
        sessionStorage.setItem('cpu_auth_error', e.message || 'Failed to create account. Please try again.');
      }
    }

    // 3. Login intent (credential-based login from login page)
    const liRaw = sessionStorage.getItem('cpu_login_intent');
    if (liRaw) {
      sessionStorage.removeItem('cpu_login_intent');
      try {
        const { username, password } = JSON.parse(liRaw);
        await login(username, password);
        const url = new URL(location.href);
        url.searchParams.delete('login');
        history.replaceState({}, '', url);
        console.log(`✦ AuthSystem: login intent → ${username}`);
        return;
      } catch(e) {
        sessionStorage.setItem('cpu_auth_error', e.message || 'Invalid username or password.');
        console.warn('AuthSystem: login intent error', e);
      }
    }

    // ── One-time role migration: promote super-admins ─────
    // Ensures any existing SUPER_ADMINS user has the admin role,
    // e.g. if they registered before this code was deployed.
    const allUsers = loadUsers();
    let changed = false;
    allUsers.forEach(u => {
      if (SUPER_ADMINS.has(u.username) && u.role !== 'admin') {
        u.role = 'admin';
        changed = true;
        console.log(`✦ AuthSystem: promoted ${u.username} → admin (super-admin rule)`);
      }
    });
    if (changed) saveUsers(allUsers);

    // Also update any active session for a just-promoted user
    const sess = loadSession();
    if (sess && SUPER_ADMINS.has(sess.username) && sess.role !== 'admin') {
      sess.role = 'admin';
      saveSession(sess);
    }

    // ── First-run: create default admin ───────────────────
    const users = loadUsers();
    if (users.length > 0) return; // already initialized

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
          <h1 class="auth-title">Async</h1>
          <p class="auth-subtitle">Sign in to your workspace</p>

          ${error ? `<div class="auth-error-banner">${esc(error)}</div>` : ''}

          <!-- Google / OAuth sign-in -->
          <button class="auth-google-btn" id="auth-google-btn" onclick="window.__authGoogleSignIn()" type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.233 17.64 11.926 17.64 9.2Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div class="auth-divider">
            <span class="auth-divider-line"></span>
            <span class="auth-divider-label">or sign in with username</span>
            <span class="auth-divider-line"></span>
          </div>

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

          <div style="display:flex;justify-content:space-between;margin-top:16px;flex-wrap:wrap;gap:8px">
            <p class="auth-footer-note" style="margin:0;color:#64748b;font-size:.75rem">
              Need help? <a href="mailto:support@asyncai.app" style="color:#6366f1;text-decoration:none;">Contact support</a>
            </p>
            <a class="auth-footer-note" style="margin:0;color:#6366f1;text-decoration:none" href="/public/login.html?tab=signup">Create account →</a>
          </div>
        </div>
        <div id="toast-container"></div>
      </div>
    `;

    // Expose Google sign-in handler globally so the inline button onclick can call it
    window.__authGoogleSignIn = function() {
      // Redirect to the dedicated login page which has the full NI widget
      sessionStorage.setItem('cpu_auth_redirect', window.location.href);
      window.location.href = '/public/login.html';
    };

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
        if (user.mustChangePassword) {
          renderForcePasswordChange(user);
          return;
        }
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
    isSuperAdmin,
    requireAuth,
    requireAdmin,
    checkPasswordChangeRequired,
    recordMessageSent,
    renderLoginScreen,
    refreshVaultKey,   // for re-deriving vault key after external password change
    netlifyIdentityLogin,   // Google OAuth bridge
    getFirebaseUid,    // Firebase Auth UID (null if not signed into Firebase)
  };

})();

// ============================================================
// ApiKeyVault — AES-GCM encrypted API key storage
// Keys are encrypted with a per-user key derived from their password.
// The decryption key lives only in sessionStorage (cleared on tab close).
// ============================================================
export const ApiKeyVault = (() => {
  const VAULT_LS  = 'cpu_apikeys_v2';  // ciphertext in localStorage
  const VAULT_ARIA_LS = 'cpu_apikeys_aria_v2'; // dedicated Aria keys
  const VAULT_SS  = 'cpu_vault_key';   // raw key bytes (base64) in sessionStorage

  async function _getKey() {
    const b64 = sessionStorage.getItem(VAULT_SS);
    if (!b64) return null;
    try {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    } catch { return null; }
  }

  /** Encrypt apiKeys object and write to localStorage. */
  async function save(apiKeys) {
    const key = await _getKey();
    if (!key) {
      // Vault key unavailable (e.g. session cleared) — skip silently
      console.warn('ApiKeyVault: no vault key available, API keys not encrypted');
      return;
    }
    const iv        = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(apiKeys));
    const cipher    = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    try {
      localStorage.setItem(VAULT_LS, JSON.stringify({
        v:    2,
        iv:   Array.from(iv),
        data: Array.from(new Uint8Array(cipher)),
      }));
    } catch (e) {
      console.warn('ApiKeyVault: save failed', e.message);
    }
  }

  /** Decrypt and return apiKeys object, or {} if unavailable/locked. */
  async function load() {
    const stored = localStorage.getItem(VAULT_LS);
    if (!stored) return {};
    const key = await _getKey();
    if (!key) return null; // null = vault exists but locked (needs unlock)
    try {
      const { iv, data } = JSON.parse(stored);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { return {}; }
  }

  /** Encrypt apiKeys object and write to Aria's dedicated vault. */
  async function saveAria(apiKeys) {
    const key = await _getKey();
    if (!key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(apiKeys));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    try {
      localStorage.setItem(VAULT_ARIA_LS, JSON.stringify({
        v: 2, iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)),
      }));
    } catch (e) { console.warn('ApiKeyVault: saveAria failed', e.message); }
  }

  /** Decrypt and return Aria's dedicated apiKeys object, or {} if unavailable. */
  async function loadAria() {
    const stored = localStorage.getItem(VAULT_ARIA_LS);
    if (!stored) return {};
    const key = await _getKey();
    if (!key) return null;
    try {
      const { iv, data } = JSON.parse(stored);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { return {}; }
  }


  /**
   * Migrate plaintext API keys from legacy state blob into the vault.
   * Called once on first boot after upgrade.
   */
  async function migrateFromPlaintext(plainKeys) {
    if (!plainKeys || !Object.values(plainKeys).some(v => v)) return;
    if (localStorage.getItem(VAULT_LS)) return; // already migrated
    await save(plainKeys);
    console.log('ApiKeyVault: migrated plaintext keys to AES-GCM vault ✓');
  }

  /** Returns true if a vault blob exists (regardless of lock state). */
  function hasVault() { return !!localStorage.getItem(VAULT_LS); }

  // ──────────────────────────────────────────────────────────
  // Per-item encrypted storage (agent integration & web-search keys)
  // Each secret is encrypted individually under its own localStorage
  // key, reusing the same session vault key as the provider-key blob.
  // ──────────────────────────────────────────────────────────
  const INTKEY_PREFIX = 'cpu_intkey_';    // + integration id
  const WEBSEARCH_KEY = 'cpu_websearch_key';
  const LOCKED_MSG    = 'API key vault is locked — unlock it (re-enter your password) before saving or reading agent keys.';

  async function _encItem(value) {
    const key = await _getKey();
    if (!key) throw new Error(LOCKED_MSG);
    const iv     = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(value))
    );
    return JSON.stringify({ v: 2, iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) });
  }

  async function _decItem(stored) {
    const key = await _getKey();
    if (!key) throw new Error(LOCKED_MSG);
    const { iv, data } = JSON.parse(stored);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data)
    );
    return new TextDecoder().decode(plain);
  }

  /** Encrypt & store an integration key. Empty value removes it. Throws if vault locked. */
  async function setIntegrationKey(id, keyStr) {
    if (!id) throw new Error('setIntegrationKey: integration id required');
    if (!keyStr) { localStorage.removeItem(INTKEY_PREFIX + id); return; }
    localStorage.setItem(INTKEY_PREFIX + id, await _encItem(keyStr));
  }

  /** Decrypt & return an integration key, '' if none, throws if vault locked. */
  async function getIntegrationKey(id) {
    const stored = localStorage.getItem(INTKEY_PREFIX + id);
    if (!stored) return '';
    return _decItem(stored);
  }

  function removeIntegrationKey(id) { localStorage.removeItem(INTKEY_PREFIX + id); }

  /** Encrypt & store the web-search key. Empty value removes it. Throws if vault locked. */
  async function setWebSearchKey(keyStr) {
    if (!keyStr) { localStorage.removeItem(WEBSEARCH_KEY); return; }
    localStorage.setItem(WEBSEARCH_KEY, await _encItem(keyStr));
  }

  /** Decrypt & return the web-search key, '' if none, throws if vault locked. */
  async function getWebSearchKey() {
    const stored = localStorage.getItem(WEBSEARCH_KEY);
    if (!stored) return '';
    return _decItem(stored);
  }

  /** True if an integration key ciphertext exists (regardless of lock state). */
  function hasIntegrationKey(id) { return !!localStorage.getItem(INTKEY_PREFIX + id); }
  /** True if a web-search key ciphertext exists (regardless of lock state). */
  function hasWebSearchKey() { return !!localStorage.getItem(WEBSEARCH_KEY); }

  return {
    save, load, saveAria, loadAria, migrateFromPlaintext, hasVault,
    setIntegrationKey, getIntegrationKey, removeIntegrationKey, hasIntegrationKey,
    setWebSearchKey, getWebSearchKey, hasWebSearchKey,
  };
})();
window.AuthSystem = AuthSystem;
window.ApiKeyVault = ApiKeyVault;

