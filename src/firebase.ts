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
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const firebaseAuthEmail = process.env.REACT_APP_FIREBASE_AUTH_EMAIL;
const firebaseAuthPassword = process.env.REACT_APP_FIREBASE_AUTH_PASSWORD;

const requiredConfigKeys: Array<keyof FirebaseOptions> = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

const missingKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key]);

const hasRequiredFirebaseConfig = missingKeys.length === 0;

const app: FirebaseApp | undefined = hasRequiredFirebaseConfig
  ? initializeApp(firebaseConfig)
  : (console.warn(
      `Firebase configuration is missing required keys: ${missingKeys.join(", ")}. Refer to .env.example to configure them so Firebase sync can initialize.`,
    ), undefined);

const db = app ? getFirestore(app) : undefined;
const auth = app ? getAuth(app) : undefined;

let signingIn: Promise<boolean> | null = null;

export async function ensureSignedIn(): Promise<boolean> {
  if (!auth) return false;
  if (auth.currentUser) return true;
  if (signingIn) return signingIn;

  if (!firebaseAuthEmail || !firebaseAuthPassword) {
    console.warn(
      "Firebase Auth credentials (REACT_APP_FIREBASE_AUTH_EMAIL/REACT_APP_FIREBASE_AUTH_PASSWORD) are not configured. Continuing without authentication.",
    );
    return false;
  }

  signingIn = setPersistence(auth, browserLocalPersistence)
    .then(() => signInWithEmailAndPassword(auth, firebaseAuthEmail, firebaseAuthPassword))
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
