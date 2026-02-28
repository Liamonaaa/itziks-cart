import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAWGRXQ0xwukf8mAnwR48p8mNtP9psE68',
  authDomain: 'itziks-cart.firebaseapp.com',
  projectId: 'itziks-cart',
  storageBucket: 'itziks-cart.firebasestorage.app',
  messagingSenderId: '94711142380',
  appId: '1:94711142380:web:86473cdcc467b819da92c9',
  measurementId: 'G-8Z6KCK64E0',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
