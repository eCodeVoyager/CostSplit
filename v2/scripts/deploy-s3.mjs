// Uploads dist/ to S3 with the right cache headers (needs the AWS CLI, logged in).
//   S3_BUCKET=my-bucket [CLOUDFRONT_ID=E123...] node scripts/deploy-s3.mjs
//
// Hashed assets are cached for a year; everything else (index.html, sw.js,
// the download page, the APK, version.json) is revalidated on every load so
// releases show up immediately.

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const bucket = process.env.S3_BUCKET
const distribution = process.env.CLOUDFRONT_ID

if (!bucket) {
  console.error("Set S3_BUCKET, e.g. S3_BUCKET=costsplit-web npm run deploy:s3")
  process.exit(1)
}
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/ is empty. Run npm run release first.")
  process.exit(1)
}

function aws(args) {
  console.log(`\n> aws ${args.join(" ")}`)
  const res = spawnSync("aws", args, { stdio: "inherit", shell: process.platform === "win32" })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const target = `s3://${bucket}`

// 1. Long-cached, content-hashed files
aws(["s3", "sync", path.join(dist, "assets"), `${target}/assets`, "--cache-control", "public,max-age=31536000,immutable"])

// 2. Everything else, always revalidated (APKs handled separately for their headers)
aws([
  "s3", "sync", dist, target,
  "--exclude", "assets/*",
  "--exclude", "*.apk",
  "--cache-control", "no-cache",
  "--delete",
])

// 3. APKs: Android needs the right content type to offer "install"
aws([
  "s3", "cp", path.join(dist, "download"), `${target}/download`,
  "--recursive",
  "--exclude", "*",
  "--include", "*.apk",
  "--content-type", "application/vnd.android.package-archive",
  "--cache-control", "no-cache",
])

if (distribution) {
  aws(["cloudfront", "create-invalidation", "--distribution-id", distribution, "--paths", "/*"])
}

console.log(`\nDeployed to ${target}`)
