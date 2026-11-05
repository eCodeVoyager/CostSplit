# CostSplit v2

Shared money for people who live together (3-4 flatmates, a mess, family), with trips as a side mode. Android app + installable web app, works with no signal, syncs when back online. Sign in with an email code (no password), share a link, the others join.

## What a home can do

| Situation | How it's handled |
|---|---|
| Rent, electricity, gas, water, internet, maid | **Monthly bills**: set once (fixed or "changes every month", due day, everyone / some / fixed amount per person for rent by room). Home shows what's due or overdue; **Pay** opens a prefilled expense. |
| Shared bazar in a mess | **Meal count**: daily meal steppers (½ meals too, "same as day before"). Bazar split **by meals** uses that month's counts; live meal rate in the Meal book. |
| Daily repeat costs | **Add again today**: re-add a recent expense with one tap. Quick chips (Bazar, Vegetables, Gas cylinder, Drinking water…) and auto category from words like *bazar, sabji, current bill, bua*. |
| "We need rice, oil, soap" | **To-buy list** shared by everyone. "I'll buy" or assign someone so nothing is bought twice (adding something already on the list is blocked), mark **urgent** or **needed by** a day, tick what you bought, then turn it into one expense; the items stay attached to the bazar expense. |
| Manager fund / paying back | **Give money** records cash between two people (deposits, settling up). |
| Flatmate borrows money | **Lend**: only the borrower owes it. Kept out of spending totals. |
| Landlord refund, sold old newspapers | **Money in**: income shared by everyone, flips who owes whom. |
| Someone moves out / moves in | Moved-out people keep their history and balance until settled; new people join future bills automatically. |
| Month end | **Insights** per month: spent, per day, your share, meal rate, categories, paid vs share, plus a shareable month report. |

| My own spending (lunch, phone recharge) | **Personal** tab: private expenses only you see (the server sends them to your account only). Your total = your share of the home + personal, by category and month. Never touches group balances. |
| "Wait, why do I owe Rafi?" | **Statements**: tap anyone in Balances for every item that moved their balance, a running total and the sum written out. Tap any expense for its full split, who owes whom and its history (added / edited / deleted by whom). |
| Mistyped amount or wrong payer | **Check before saving**: a summary to confirm before anything is added (amounts, each share, who owes whom, balances after a payment) plus warnings for likely duplicates, future dates, unusually big amounts, and splits that change nobody's balance. On by default, per phone. |
| Uneven splits ("I had less") | **Amounts fill themselves in**: type what some people owe (or paid) and everyone left blank shares the rest equally; the last person absorbs a changed total. Repeat titles offer "Split like last time". |
| "Did anything change?" | **Updates** (bell): others' new, edited and deleted expenses, payments, items assigned to you, urgent items, plus what needs you now. **Dashboard** on the first screen: what you spent this month across groups, what you owe / get back, bills due, things to buy. |
| Not forgetting | **Notifications** (Android app, set on the phone so they come with the app closed): bill due days, overdue bills, the buyer's to-buy items on the day they're needed, tonight's meal count, a Friday nudge if you owe. Changes by others that involve you notify when they sync in. |
| "Who are you?" on every new phone | **Profiles and personal invites**: a profile name and photo (tap your picture on the first screen); the photo shows on you in every group. After adding someone, send them **their own link** (or an email with it): opening it joins as them. Signing in with an invited email, or on a new phone with an account that joined before, also picks the right person. The picker only shows when the app can't tell. |
| Finding one expense among hundreds | **Filters**: type, people (any one / all of them / only them, paid or shared), your part (I owe, I get back), category, date range, amount range, photo, note, several payers, edited; sort by date or amount; totals and CSV export for what's shown; recently deleted with restore. |

Also: edit anything, undo on delete, several payers ("Rest" fills what's left), split equally / by shares / exact amounts / by meals, live "who owes whom" for any number of people, settle up by fewest payments or direct debts, reminders, multi-currency, CSV export, JSON backup, dark mode.

Trips use the same app with travel defaults (EUR, food/taxi/ferry chips, no bills or meals).

## What changed from v1

| | v1 | v2 |
|---|---|---|
| Backend | Express + MongoDB + JWT | One zero-dependency Node file, one JSON file per group |
| Data | Server only, online required | On the phone first (IndexedDB), synced in the background |
| Access | One shared username/password | Email code sign-in (no password) + invite link per group |
| App | Website | Android app (APK) + installable web app |
| Scope | One group, one-off expenses | Homes and trips; bills, meals, to-buy list, loans, money in |
| Money math | Floats rounded to 2 dp | Integer cents, totals always add up exactly |

## Layout

```
v2/
├── src/               React app (shared by web and Android)
├── server/server.mjs  Sync API + static file server (Node 18+, no npm deps)
├── android/           Capacitor Android project
├── assets/            Icon + splash sources for the Android app
└── data/              Trip files written by the server (git-ignored)
```

Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, Dexie (IndexedDB), vite-plugin-pwa, wouter, Capacitor 8.

## Run locally

```bash
npm install
npm run server      # sync server on :8787 (also serves dist/ if built)
npm run dev         # web app on :5173, proxies /api to :8787
npm test            # money/balance unit tests + server tests
npm run release     # production build: web app + APK + download page in dist/
```

## Android app (USB / adb)

Needs the Android SDK and JDK 21+. `scripts/gradle.mjs` uses `JAVA_HOME` if it is new enough, otherwise Android Studio's bundled JDK.

```bash
npm run apk         # web build (.env.android) + cap sync + gradle assembleDebug
npm run server      # keep running
npm run phone       # adb reverse :8787, install APK, launch
```

`.env.android` points the app at `http://localhost:8787`, which `adb reverse` maps to this computer, so it works over USB without Wi-Fi setup. The server address is fixed per build and can't be changed in the app. To test without the cable, set `VITE_SERVER_URL=http://<computer-LAN-IP>:8787` in `.env.android` and rebuild (same Wi-Fi; allow port 8787 through the firewall).

Debug the app's WebView from desktop Chrome at `chrome://inspect`.

## Production release

Three pieces: the **sync server** (Node, needs a host with https), the **web app + download page** (static, e.g. S3 + CloudFront), and the **Android APK** (served from the download page).

```
https://costsplit.example.com/            web app (S3/CloudFront)
https://costsplit.example.com/download/   download page + APK + version.json
https://api.costsplit.example.com/        sync server (server/server.mjs)
```

### 1. One-time: Android release key

Release builds must be signed with the same key forever, or updates won't install over the old app.

```bash
keytool -genkeypair -v -keystore costsplit-release.jks -alias costsplit -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/keystore.properties` (git-ignored):

```properties
storeFile=../costsplit-release.jks
storePassword=...
keyAlias=costsplit
keyPassword=...
```

Back up the `.jks` file and passwords somewhere safe.

### 2. Configure

```bash
cp .env.production.example .env.production              # web build
cp .env.android-release.example .env.android-release    # app build
```

Both need `VITE_SERVER_URL` (https sync server) and `VITE_PUBLIC_URL` (where the web app and `/download` live). To release a new version, bump `"version"` in `package.json`: it becomes the app's versionName and versionCode (`2.1.3` → `20103`) and the version the in-app update check compares against.

### 3. Build

```bash
npm run release
```

Checks the config, builds the signed APK (debug with a warning if there's no keystore) and the web app, and writes `dist/download/` with `costsplit.apk`, `costsplit-<version>.apk`, `bundle-<version>.zip` (live update), `version.json` (size, sha256) and `qr.svg`. Upload all of `dist/`.

**Live updates (Android app 2.3.0+).** Most releases reach installed apps without a reinstall. `bundle-<version>.zip` is the web part exactly as the APK ships it. The app checks `version.json` on launch and hourly, downloads the zip (~1 MB), verifies its SHA-256, unpacks it to `files/bundles/<version>` and points Capacitor's web server there (`LiveUpdates.java`). It switches in on the next app start, or when the user returns after a few minutes away, or right away with **Restart now** in Settings. The new version must confirm it started (`confirmBundle`, once React has rendered). One that doesn't within 20 s on screen, or before the next start, is rolled back to the last good version and never offered again; that version then goes out as an APK update. Installing a new APK drops all downloaded versions.

A live update only fits apps with the same native part. `release.mjs` fingerprints it (Java code, manifest, resources, Gradle files, `capacitor.config.ts`, Capacitor plugin versions) and keeps `android/native-versions.json` (commit it). When the fingerprint changes, `bundle.minNative` moves to this version: older apps get the APK (one tap, Android's installer) and newer ones keep updating live.

**Play Protect.** Phones show "Send app for scanning?" / "Install without scanning" for an APK from a developer Google doesn't know. Live updates avoid it after the first install. To have the app recognised, register as a developer in the [Android Developer Console](https://developer.android.com/developer-verification) and register package `app.costsplit` with the release key's SHA-256 (it's in `dist/.well-known/assetlinks.json` after a signed release). Until then, users tap **Scan app**.

### 4. Sync server

Any small Linux box. One process, one folder of JSON files.

```bash
# copy server/server.mjs to the host (Node 18+), then:
PORT=8787 DATA_DIR=/var/lib/costsplit STATIC_DIR= TRUST_PROXY=1 \
  pm2 start server/server.mjs --name costsplit-sync
```

- `STATIC_DIR=` (empty) = API only, since the web app is on S3. Leave it unset to also serve `dist/` from the server.
- `TRUST_PROXY=1` when behind Caddy/nginx so rate limits use the real client IP.
- Run a **single** instance (PM2 fork mode, not cluster): writes per group are serialized in-process.
- Back up `DATA_DIR` (one `<groupId>.json` per home/trip), e.g. a nightly copy to S3.
- https with Caddy:

  ```
  api.costsplit.example.com {
    reverse_proxy localhost:8787
  }
  ```

Or Docker (serves API + web app): `docker build -t costsplit . && docker run -d -p 8787:8787 -v costsplit-data:/data costsplit`.

**Live setup: one server for everything** (`https://costsplit.tapspot.tech` on s3; web app, API and `/download` on one origin, so `.env.production` leaves `VITE_SERVER_URL` empty):

```bash
npm run release
bash deploy/deploy.sh s3 costsplit.tapspot.tech
```

- `deploy.sh` copies `server/` + `dist/` to `/opt/costsplit`, swaps the release in (the previous one stays as `*.prev`), and installs the nginx site. nginx rolls back if `nginx -t` fails. pm2 then runs `costsplit` on `127.0.0.1:8790`, and the script prints health checks. It's safe to rerun for every release.
- Data: `/opt/costsplit/data` (one `<groupId>.json` per group + `_auth.json` + `files/`).
- Cloudflare proxied, SSL mode Full; the origin uses a self-signed cert (`/etc/nginx/ssl/costsplit.*`).
- Email sign-in and invite emails: put `RESEND_API_KEY=` and `MAIL_FROM=` in `/opt/costsplit/.env` on the server, then `pm2 restart costsplit`. Until then sign-in answers 503 and the app works offline only. Invite emails link to the address the request came in on; set `PUBLIC_URL=` there to override.
- Profile photos: `/opt/costsplit/data/avatars/` (one small JPEG per account; replaced photos are deleted).

### 5. Web app on S3

- Private bucket + CloudFront distribution (Origin Access Control).
- Attach `deploy/cloudfront-function.js` as a **viewer request** function: serves `/download/` and folder pages, and the app for routes like `/t/<id>` and `/join/<id>`.
- Add a response headers policy with `Referrer-Policy: no-referrer` (the pages also set it via meta tag).
- Upload:

  ```bash
  S3_BUCKET=costsplit-web CLOUDFRONT_ID=E123ABC npm run deploy:s3
  ```

  Hashed assets get a 1-year cache; `index.html`, `sw.js`, the download page, `version.json` and the APK are revalidated every time, with the Android content type on the APK.

### 6. Smoke test after deploying

1. `https://api…/api/health` returns `{"ok":true}`.
2. Open `/download/` on an Android phone, install, create a home.
3. Share the invite link, open it on another phone (web), pick a name: same balances on both.
4. Ship the next version: bump `package.json`, `npm run release`, deploy. Installed apps update by themselves (live update) or, if the native part changed, show "CostSplit x.y.z is available".

### Production defaults already in place

- Release APK only talks https (`usesCleartextTraffic=false`); debug builds allow a plain-http laptop server.
- Server: per-IP rate limit, 1 MB body limit, record/batch size limits, path-traversal-safe static serving, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, graceful shutdown on SIGTERM, atomic file writes.
- Web: service worker for offline, `/download` excluded from the app shell, no third-party requests except the optional live exchange rate.

## How sync works

Each row (group, member, expense, payment, bill, meal count, list item) has a client-generated UUID and `updatedAt`. Local edits are marked `dirty`. `POST /api/sync` pushes dirty rows and pulls everything after the device's cursor (a per-trip sequence number). Conflicts resolve last-write-wins per row. Deletes are soft (`deleted: 1`), so they sync and can be undone. Balances are computed on the device, so they're instant and work offline.

Meal counts use one row per person per day, so two phones counting different people never overwrite each other.

People can be tied to accounts: a member row carries `userId`, `email` and `avatar` (profile photo id) once someone joins as them. A personal invite link is `/join/<groupId>?as=<memberId>`; the phone remembers the person until the group has downloaded, then picks them (unless another account already joined as them). Profile name and photo live on the server account (`POST /api/profile`, `PUT|DELETE /api/profile/avatar`, `GET /api/avatars/<id>` for anyone signed in); `POST /api/invite` emails a personal link (group members only, 20 an hour per account).

Personal expenses sync in the same group file but are owner-only: the server stamps each one with the signing-in account, never returns it to anyone else and ignores writes to it from other accounts. Deploy the server before (or with) a client that has the Personal tab: an older server rejects the new `personal` table and that group stops syncing until it's updated.

**The group id in the invite link is the access key**: anyone with the link who signs in (any email works) can read and edit that group. Treat it like a shared password.
