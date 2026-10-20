/* ============================================================
   SONU OS — firebase.js
   Initializes Firebase app and exports the SDK handles.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig, isFirebaseConfigMissing } from "./firebase-config.js";

let app = null, auth = null, db = null;

if (!isFirebaseConfigMissing()) {
  app  = initializeApp(firebaseConfig);
  auth = getAuth(app);

  // Modern persistence API. Falls back to default (in-memory) if the
  // browser doesn't support IndexedDB or multi-tab coordination.
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = getFirestore(app);
  }
}

export { app, auth, db };
export { isFirebaseConfigMissing };