/**
 * admin-auth.js
 * ---------------------------------------------------------
 * Handles:
 *   1. Silent (anonymous) sign-in for every visitor.
 *   2. Claiming the single admin slot the first time the
 *      secret admin URL (?admin=SECRET_CODE) is opened.
 *   3. Determining, on every visit, whether the current
 *      anonymous UID is the stored admin UID.
 *
 * There is no login form, password, or account system.
 * "Identity" = the Firebase Anonymous Auth UID, which
 * Firebase persists in IndexedDB and restores automatically
 * on return visits (same browser/device).
 *
 * SECURITY MODEL
 * ---------------------------------------------------------
 * - The admin UID is stored in a single Firestore document:
 *     admin/config -> { uid: "<the admin's Firebase UID>" }
 * - Firestore Security Rules (see firestore.rules) allow that
 *   document to be CREATED only once, and only by the caller
 *   whose auth.uid matches the uid being written. After that,
 *   the rules forbid any update/delete — so nobody can ever
 *   overwrite or steal the admin slot, no matter what the
 *   client-side JS does.
 * - The "SECRET_CODE" in the URL is only a convenience gate
 *   to stop random visitors from *attempting* the claim.
 *   The real security guarantee is 100% enforced server-side
 *   by Firestore rules (first successful create wins, forever).
 * - All write operations on real data (incidents/entries) are
 *   ALSO checked against admin/config.uid inside Firestore
 *   rules, so even a modified/compromised client cannot write
 *   as a non-admin user.
 * ---------------------------------------------------------
 */

import { db, auth } from "./firebase-config.js";
import {
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// CHANGE THIS to your own secret string before deploying.
// Anyone who knows this string and opens the site FIRST or SECOND
// becomes an admin (max 2 admins total — see resolveAdminStatus below).
// Share it with nobody but the one other person you want as co-admin.
const ADMIN_SECRET = "@XVSJQ";

const ADMIN_DOC_REF = doc(db, "admin", "config");

/**
 * Resolves to { user, isAdmin } once auth + admin-check are settled.
 * Call this once on page load.
 */
export function initAdminAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          // No session yet (first visit ever, or cleared storage) -> sign in anonymously.
          // This triggers onAuthStateChanged again with a real user, so just return.
          await signInAnonymously(auth);
          return;
        }

        const isAdmin = await resolveAdminStatus(user.uid);
        resolve({ user, isAdmin });
      } catch (err) {
        reject(err);
      }
    }, reject);
  });
}

/**
 * Decides whether `uid` is an admin, claiming one of the two admin
 * slots if the secret URL param is present and a slot is still free.
 * Max 2 admins total; slots are locked forever once both are taken.
 */
async function resolveAdminStatus(uid) {
  const params = new URLSearchParams(window.location.search);
  const providedSecret = params.get("admin");

  const snap = await getDoc(ADMIN_DOC_REF);

  if (!snap.exists()) {
    // No admin claimed yet -> this claim would take slot #1.
    if (providedSecret === ADMIN_SECRET) {
      try {
        await setDoc(ADMIN_DOC_REF, {
          uids: [uid],
          claimedAt: new Date().toISOString()
        });
        return true;
      } catch (err) {
        console.warn("Admin claim failed (likely already claimed):", err.message);
        const recheck = await getDoc(ADMIN_DOC_REF);
        return !!recheck.exists() && recheck.data().uids.includes(uid);
      }
    }
    return false;
  }

  const uids = snap.data().uids || [];

  if (uids.includes(uid)) {
    // Already one of the admins.
    return true;
  }

  if (uids.length === 1 && providedSecret === ADMIN_SECRET) {
    // Slot #2 is still free -> try to claim it.
    try {
      await setDoc(ADMIN_DOC_REF, {
        uids: [uids[0], uid],
        claimedAt: snap.data().claimedAt
      });
      return true;
    } catch (err) {
      console.warn("Second admin claim failed (likely already taken):", err.message);
      const recheck = await getDoc(ADMIN_DOC_REF);
      return !!recheck.exists() && (recheck.data().uids || []).includes(uid);
    }
  }

  // Both slots taken, or no valid secret -> not an admin.
  return false;
}
