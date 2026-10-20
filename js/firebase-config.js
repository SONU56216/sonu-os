/* ============================================================
   SONU OS — firebase-config.js
   ------------------------------------------------------------------
   PUBLIC Firebase web configuration only.
   These values are NOT secrets. They are shipped to the browser by
   design and are safe to commit. Security is enforced by
   Firestore Security Rules + Authentication, NOT by hiding these.

   NEVER put here:
     - service account JSON / private keys
     - Firebase Admin SDK credentials
     - any server-side API key with elevated privileges

   Setup:
   1. Go to https://console.firebase.google.com → create project
   2. Project settings → Your apps → Web app → Register app
   3. Copy the config object shown and paste the values below.
   ============================================================ */

export const firebaseConfig = {
  apiKey:            "AIzaSyDGRq2YqVvwjB6kBIYdGgmvN5rAvxTAWp4",
  authDomain:        "winter-arc-2bfdb.firebaseapp.com",
  projectId:         "winter-arc-2bfdb",
  storageBucket:     "winter-arc-2bfdb.firebasestorage.app",
  messagingSenderId: "846111718969",
  appId:             "1:846111718969:web:4b05f4d12d36f8accd17e8",
};

/* True when the config still has placeholder values. The app shows a
   friendly setup screen instead of crashing. */
export function isFirebaseConfigMissing() {
  return Object.values(firebaseConfig).some(
    (v) => typeof v !== "string" || v.startsWith("REPLACE")
  );
}
