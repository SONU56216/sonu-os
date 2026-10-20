/* ============================================================
   SONU OS — settings.js
   ============================================================ */

import { db, auth } from "./firebase.js";
import {
  collection, getDocs, deleteDoc, doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  deleteUser, reauthenticateWithCredential, EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { updateUserProfile } from "./user.js";

export async function savePreferences(uid, prefs) {
  const allowed = [
    "theme", "timeFormat", "timezone", "weekStart", "streakRule",
    "focusDurations", "notifications",
  ];
  const patch = {};
  for (const k of allowed) if (k in prefs) patch[k] = prefs[k];
  await updateUserProfile(uid, patch);
}

export async function loadAllUserData(uid) {
  const [userSnap, tasks, daily, sessions, logs] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    dump(collection(db, "users", uid, "tasks")),
    dump(collection(db, "users", uid, "dailyRecords")),
    dump(collection(db, "users", uid, "focusSessions")),
    dump(collection(db, "users", uid, "activityLogs")),
  ]);
  return {
    user: { id: uid, ...(userSnap.data() || {}) },
    tasks, dailyRecords: daily, focusSessions: sessions, activityLogs: logs,
    exportedAt: new Date().toISOString(),
  };
}

async function dump(colRef) {
  const snap = await getDocs(colRef);
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

export function downloadJson(payload, filename = "sonu-os-export.json") {
  const blob = new Blob([JSON.stringify(payload, serialTimestampReplacer, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

export function downloadTasksCsv(tasks, filename = "sonu-os-tasks.csv") {
  const headers = ["date","startTime","endTime","title","category","priority","completed","completedAt","actualFocusMinutes","notes"];
  const rows = [headers.join(",")];
  for (const t of tasks) {
    rows.push(headers.map((h) => csvCell(t[h])).join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  triggerDownload(blob, filename);
}

function csvCell(v) {
  if (v == null) return "";
  if (typeof v === "object" && typeof v.toDate === "function") v = v.toDate().toISOString();
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function serialTimestampReplacer(_k, v) {
  if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate().toISOString();
  return v;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function deleteAccountAndData({ uid, email, password, onProgress }) {
  if (!password) throw new Error("Password is required to delete your account.");

  const subcollections = ["tasks", "dailyRecords", "focusSessions", "activityLogs"];
  let total = 0;

  for (const name of subcollections) {
    const colRef = collection(db, "users", uid, name);
    const snap = await getDocs(colRef);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
      total++;
      onProgress?.(`Deleted ${total} documents…`);
    }
  }

  await deleteDoc(doc(db, "users", uid));
  onProgress?.(`Deleted user profile document.`);

  const cred = EmailAuthProvider.credential(email, password);
  await reauthenticateWithCredential(auth.currentUser, cred);
  await deleteUser(auth.currentUser);
  return total;
}

import { recomputeDailyRecord } from "./tasks.js";

export async function recalcLastNDays(uid, days = 30) {
  const today = new Date();
  const tasks = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    tasks.push(recomputeDailyRecord(uid, key));
  }
  await Promise.all(tasks);
  return days;
}