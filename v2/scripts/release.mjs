// Builds everything a release needs into dist/, ready to upload:
//   dist/                      web app (S3 / CDN / the sync server)
//   dist/download/             download page + APK + version.json + qr.svg
//
//   node scripts/release.mjs            (npm run release)
//
// Reads .env.production (web) and .env.android-release (app). Signs the APK when
// android/keystore.properties exists, otherwise ships a debug build with a warning.

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { renderSVG } from "uqr"
import { loadEnv } from "vite"

const root = path.join(import.meta.dirname, "..")
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(" ")}`)
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" })
  if (res.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")}`)
    process.exit(res.status ?? 1)
  }
}

const web = loadEnv("production", root, "VITE_")
const app = loadEnv("android-release", root, "VITE_")
const publicUrl = (web.VITE_PUBLIC_URL || app.VITE_PUBLIC_URL || "").replace(/\/+$/, "")

const problems = []
if (!app.VITE_SERVER_URL) problems.push("VITE_SERVER_URL missing in .env.android-release (the app can't sync without it)")
else if (!app.VITE_SERVER_URL.startsWith("https://")) problems.push("VITE_SERVER_URL in .env.android-release must be https:// for release builds")
if (!publicUrl) problems.push("VITE_PUBLIC_URL missing (invite links, update checks and the QR code need it)")
if (problems.length) {
  console.error(`\nNot ready to release:\n- ${problems.join("\n- ")}\nSee .env.production.example and .env.android-release.example.`)
  process.exit(1)
}

const signed = existsSync(path.join(root, "android", "keystore.properties"))

// 1. Android app
run("npx", ["tsc", "-b"])
run("npx", ["vite", "build", "--mode", "android-release", "--outDir", "dist-android"])
run("npx", ["cap", "sync", "android"])
run("node", ["scripts/gradle.mjs", signed ? "assembleRelease" : "assembleDebug"])

// 2. Web app (empties dist/, so it runs after the app build and before copying the APK in)
run("npx", ["vite", "build"])

// 3. Download folder
const apk = signed
  ? path.join(root, "android/app/build/outputs/apk/release/app-release.apk")
  : path.join(root, "android/app/build/outputs/apk/debug/app-debug.apk")
const out = path.join(root, "dist", "download")
mkdirSync(out, { recursive: true })
const file = `costsplit-${version}.apk`
copyFileSync(apk, path.join(out, file))
copyFileSync(apk, path.join(out, "costsplit.apk"))

const bytes = readFileSync(apk)
const info = {
  version,
  file,
  size: statSync(apk).size,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  date: new Date().toISOString(),
  signed,
}
writeFileSync(path.join(out, "version.json"), JSON.stringify(info, null, 2))
writeFileSync(path.join(out, "qr.svg"), renderSVG(`${publicUrl}/download/`, { border: 1, pixelSize: 8 }))

// 4. App Links: invite links open the installed app once Android finds this key's fingerprint here
let appLinks = false
if (signed) {
  const props = Object.fromEntries(
    readFileSync(path.join(root, "android", "keystore.properties"), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  )
  const keytools = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", "keytool"), "keytool"].filter(Boolean)
  for (const keytool of keytools) {
    // The password goes through the environment, never the command line
    const res = spawnSync(
      keytool,
      ["-list", "-v", "-keystore", path.join(root, "android", props.storeFile), "-alias", props.keyAlias, "-storepass:env", "COSTSPLIT_STOREPASS"],
      { encoding: "utf8", env: { ...process.env, COSTSPLIT_STOREPASS: props.storePassword } }
    )
    const sha = res.stdout?.match(/SHA256:\s*([0-9A-F:]{95})/)?.[1]
    if (!sha) continue
    mkdirSync(path.join(root, "dist", ".well-known"), { recursive: true })
    const statement = [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "app.costsplit", sha256_cert_fingerprints: [sha] },
      },
    ]
    writeFileSync(path.join(root, "dist", ".well-known", "assetlinks.json"), JSON.stringify(statement, null, 2))
    appLinks = true
    break
  }
  if (!appLinks) console.warn("WARNING: couldn't read the release key with keytool; invite links will open in the browser, not the app")
}

console.log(`\nRelease ${version} ready in dist/ (APK ${(info.size / 1048576).toFixed(1)} MB)`)
if (!signed) {
  console.warn(
    "WARNING: no android/keystore.properties, so this is a DEBUG build. Fine for testing;\n" +
      "for real users create a release key (see README) so updates install over each other."
  )
}
console.log("Deploy with: bash deploy/deploy.sh <ssh host> <domain>  (or npm run deploy:s3 for S3 + CloudFront)")
