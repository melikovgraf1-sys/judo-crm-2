import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { initializeApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {

  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};
const app: FirebaseApp | undefined = Object.values(firebaseConfig).every(Boolean)
  ? initializeApp(firebaseConfig)
  : (console.warn("Firebase configuration is incomplete. Skipping initialization."), undefined);