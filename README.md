# Admin-Only Add Button (Firebase, no login system)

A single anonymous admin identity, enforced by Firestore Security Rules —
no login/register/password pages anywhere.

## How it works

1. Every visitor is silently signed in with **Firebase Anonymous
   Authentication** (`admin-auth.js`). Firebase persists this session in
   the browser and restores it automatically on return visits.
2. The **first** person to open `https://yoursite.com/?admin=SECRET_CODE`
   has their anonymous UID written to `admin/config` in Firestore.
   Firestore rules guarantee this document can only ever be **created
   once** — no one can overwrite it later, including the admin.
3. On every page load, the client reads `admin/config` and compares its
   own UID to the stored one. If it matches, the ➕ **Add** button is
   shown; otherwise it stays hidden.
4. **All writes are also enforced server-side.** Firestore Security
   Rules (`firestore.rules`) independently check `admin/config.uid`
   before allowing any create/update/delete on `entries/*` — so even a
   tampered client or a raw API call cannot write as a non-admin.

## Setup

1. Create a Firebase project (console.firebase.google.com).
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Enable **Firestore Database** (production mode).
4. Copy your project's config into `firebase-config.js`.
5. Deploy the rules:
   ```
   firebase deploy --only firestore:rules
   ```
   (or paste `firestore.rules` into Console → Firestore → Rules)
6. Edit `ADMIN_SECRET` in `admin-auth.js` to your own secret string.
7. Deploy `index.html`, `app.js`, `admin-auth.js`, `firebase-config.js`
   to any static host (GitHub Pages, Netlify, Vercel, Firebase Hosting…).
8. Open `https://yoursite.com/?admin=YOUR_SECRET` **yourself, once** —
   that visit becomes the permanent admin. Then just use the normal URL
   from now on; the button stays visible on that browser/device because
   the anonymous session persists.

## Notes & caveats

- The "admin" identity is tied to the **browser/device** that claimed
  it (Firebase Anonymous Auth session). Clearing site data / using a
  different browser loses that session's UID. If that happens, the
  `admin/config` doc still exists with the *original* UID, and rules
  will correctly deny the new (different) anonymous session — there's
  no way to "re-claim" without manually resetting `admin/config` in
  the Firebase Console (or linking the anonymous account to a real
  credential later, if you ever want persistence across devices/browsers).
- `admin/config` is world-readable (it only contains a UID, not a
  secret), which is required so the client can compare its own UID
  against it. This is safe — knowing the UID does not let anyone
  authenticate as it.
- The URL secret (`?admin=...`) is just a convenience gate to stop
  random visitors from *attempting* a claim before you do. It provides
  no security guarantee by itself — the real guarantee is the Firestore
  rule that only allows the `admin/config` document to be created once.
