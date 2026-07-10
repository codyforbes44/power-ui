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
}
