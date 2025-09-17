import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {

  apiKey: "AIzaSyAulX_16s1hU8Y-WT0IaWQmmoZJhr_0Xy0",
  authDomain: "precise-slice-397909.firebaseapp.com",
  projectId: "precise-slice-397909",
  storageBucket: "precise-slice-397909.firebasestorage.app",
  messagingSenderId: "952584870116",
  appId: "1:952584870116:web:4d801cf061511d8c5934f1",
};
const app: FirebaseApp | undefined = Object.values(firebaseConfig).every(Boolean)
  ? initializeApp(firebaseConfig)
  : (console.warn("Firebase configuration is incomplete. Skipping initialization."), undefined);

const db = app ? getFirestore(app) : undefined;
const auth = app ? getAuth(app) : undefined;

export { db, auth };
