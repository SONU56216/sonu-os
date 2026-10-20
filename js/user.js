/* ============================================================
   SONU OS — user.js
   Realtime listener for users/{uid}.
   ============================================================ */

import { db } from "./firebase.js";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function watchUserProfile(uid, cb, onError) {
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => cb({ id: snap.id, ...(snap.data() || {}) }),
    (err) => { if (onError) onError(err); },
  );
}

export async function updateUserProfile(uid, patch) {
  await updateDoc(doc(db, "users", uid), { ...patch, updatedAt: serverTimestamp() });
}