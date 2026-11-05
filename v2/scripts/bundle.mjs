// Live updates: the web part of the Android app as a zip, plus a fingerprint of
// the native part, so an installed app knows whether a new web bundle fits it.

import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { crc32, deflateRawSync } from "node:zlib"

function walk(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else out.push(path.relative(base, full).split(path.sep).join("/"))
  }
  return out
}

/**
 * A plain zip (deflate, no zip64) of every file under `dir`. Small and
 * dependency-free; the app unpacks it with java.util.zip.
 */
export function zipFolder(dir) {
  const locals = []
  const central = []
  let offset = 0
  // 1980-01-01 00:00: fixed, so the same files always give the same zip
  const time = 0
  const date = (0 << 9) | (1 << 5) | 1
  for (const name of walk(dir)) {
    const data = readFileSync(path.join(dir, name))
    const packed = deflateRawSync(data, { level: 9 })
    const nameBuf = Buffer.from(name, "utf8")
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, packed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // made by
    entry.writeUInt16LE(20, 6) // version needed
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt16LE(time, 12)
    entry.writeUInt16LE(date, 14)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBuf.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBuf)

    offset += local.length + nameBuf.length + packed.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  const count = central.length / 2
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

/**
 * Fingerprint of everything native in the APK: Java code, manifest, resources,
 * Gradle files, the Capacitor config and the exact Capacitor plugin versions.
 * Web-only changes leave it alone; anything a web bundle can't bring along changes it.
 */
export function nativeFingerprint(root) {
  const hash = createHash("sha256")
  const add = (label, buf) => {
    hash.update(`${label}\n`)
    hash.update(buf)
    hash.update("\n")
  }
  // Text files are compared with LF endings, so Windows and Linux checkouts agree
  const text = (file) => Buffer.from(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
  const isText = (file) => /\.(java|kt|xml|gradle|json|ts|properties|txt)$/.test(file)

  const main = path.join(root, "android", "app", "src", "main")
  for (const rel of walk(main)) {
    if (rel.startsWith("assets/")) continue // the web app (and files cap sync writes there)
    const file = path.join(main, rel)
    add(`main/${rel}`, isText(file) ? text(file) : readFileSync(file))
  }
  for (const rel of ["android/app/build.gradle", "android/build.gradle", "android/variables.gradle", "capacitor.config.ts"]) {
    const file = path.join(root, rel)
    if (existsSync(file)) add(rel, text(file))
  }
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"))
  const plugins = Object.entries(lock.packages ?? {})
    .filter(([name]) => /node_modules\/(@capacitor\/|.*capacitor)/.test(name) && !name.includes("/cli"))
    .map(([name, info]) => `${name.replace(/^.*node_modules\//, "")}@${info.version}`)
    .sort()
  add("plugins", Buffer.from(plugins.join("\n")))
  return hash.digest("hex")
}

/**
 * Oldest app version whose native part matches `fingerprint`. A new fingerprint
 * starts a new line in android/native-versions.json (kept in git).
 */
export function minNativeVersion(history, fingerprint, version) {
  const last = history[history.length - 1]
  if (last?.fingerprint === fingerprint) return { history, minNative: last.version }
  // Same version built again after a native change: replace its line
  const kept = last?.version === version ? history.slice(0, -1) : history
  return { history: [...kept, { version, fingerprint }], minNative: version }
}
