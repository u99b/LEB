/**
 * firebase-config.js
 * ---------------------------------------------------------
 * Central Firebase initialization (v9+ modular SDK, loaded
 * over CDN as ES modules — no build step required, works on
 * GitHub Pages / Netlify / Vercel / any static host).
 *
 * Replace the values below with your own project's config
 * (Firebase Console -> Project Settings -> General -> Your apps).
 * These values are NOT secret — they only identify your project.
 * Real security comes from Firestore Security Rules (firestore.rules).
 * ---------------------------------------------------------
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDV5V5AHTWJaX1Z1j73keANn8X6CZpBto",
  authDomain: "fire-base-e625a.firebaseapp.com",
  projectId: "fire-base-e625a",
  storageBucket: "fire-base-e625a.firebasestorage.app",
  messagingSenderId: "686084309406",
  appId: "1:686084309406:web:f86d3bd49795240722d68f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
