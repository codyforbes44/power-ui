// Firebase V8 SDK
const firebaseConfig = {
  apiKey: "AIzaSyCooVeed0T-B1xMG9z5yjNsREEhJl2ihqw",
  authDomain: "async-power-ui-2026.firebaseapp.com",
  projectId: "async-power-ui-2026",
  storageBucket: "async-power-ui-2026.firebasestorage.app",
  messagingSenderId: "170673568130",
  appId: "1:170673568130:web:a64bc404e7b15135ee779b"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();

  // Firebase Auth (compat). Loaded dynamically AFTER page load so a slow or
  // blocked auth CDN can never stall the app's initial render. All auth usage
  // (app/auth.js) is best-effort and no-ops until window.firebaseAuth exists.
  // Local persistence (compat default) keeps the user signed in across
  // sessions so request.auth.uid stays stable per device.
  function initFirebaseAuth() {
    try {
      if (window.firebaseAuth || typeof firebase.auth !== 'function') return;
      window.firebaseAuth = firebase.auth();
      window.firebaseAuth
        .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(() => {});
    } catch (e) {
      console.warn('Firebase Auth init failed:', e && e.message);
    }
  }

  function loadFirebaseAuthSdk() {
    try {
      // Already present (e.g. bundled elsewhere) — just initialize.
      if (typeof firebase.auth === 'function') { initFirebaseAuth(); return; }
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js';
      s.async = true;
      s.onload = initFirebaseAuth;
      s.onerror = () => console.warn('Firebase Auth SDK failed to load — running without cloud auth.');
      document.head.appendChild(s);
    } catch (e) {
      console.warn('Firebase Auth SDK injection failed:', e && e.message);
    }
  }

  // Defer injection until after the load event so the hanging/slow script
  // download never blocks first paint or Playwright's load-based navigation.
  if (document.readyState === 'complete') {
    loadFirebaseAuthSdk();
  } else {
    window.addEventListener('load', loadFirebaseAuthSdk, { once: true });
  }
}
