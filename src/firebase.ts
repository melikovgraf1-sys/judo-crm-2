import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
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

let signingIn: Promise<boolean> | null = null;

export async function ensureSignedIn(): Promise<boolean> {
  if (!auth) return false;
  if (auth.currentUser) return true;
  if (signingIn) return signingIn;

  const email = process.env.REACT_APP_FIREBASE_AUTH_EMAIL;
  const password = process.env.REACT_APP_FIREBASE_AUTH_PASSWORD;

  if (!email || !password) {
    console.warn(
      "Firebase Auth credentials are not configured. Continuing without authentication.",
    );
    return false;
  }

  signingIn = setPersistence(auth, browserLocalPersistence)
    .then(() => signInWithEmailAndPassword(auth, email, password))
    .then(() => true)
    .catch((error) => {
      console.error("Failed to authenticate with Firebase", error);
      return false;
    })
    .finally(() => {
      signingIn = null;
    });

  return signingIn;
}

export { db, auth };
