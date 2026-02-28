import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

// TODO: Replace all placeholder values with your Firebase project config.
const firebaseConfig = {
  apiKey: 'REPLACE_WITH_FIREBASE_API_KEY',
  authDomain: 'REPLACE_WITH_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_MESSAGING_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID',
};

function hasPlaceholder(value) {
  return typeof value === 'string' && value.startsWith('REPLACE_WITH_');
}

const isFirebaseConfigured = !Object.values(firebaseConfig).some((value) =>
  hasPlaceholder(value),
);

let db = null;

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  console.warn(
    'Firebase config is missing. Fill src/firebase.js with your project values.',
  );
}

export { db, isFirebaseConfigured };
