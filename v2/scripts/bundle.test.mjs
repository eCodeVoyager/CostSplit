import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { inflateRawSync } from "node:zlib"
import { minNativeVersion, nativeFingerprint, zipFolder } from "./bundle.mjs"

describe("live update bundle", () => {
  it("zips a folder so every file unpacks to the same bytes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "costsplit-zip-"))
    try {
      mkdirSync(path.join(dir, "assets"))
      const files = {
        "index.html": "<!doctype html><div id=root></div>",
        "assets/app.js": "console.log('hi')\n".repeat(200),
        "assets/ünïcode.css": "body{}",
      }
      for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)

      const zip = zipFolder(dir)
      // Read it back through the central directory, like any unzip tool
      const end = zip.length - 22
      assert.equal(zip.readUInt32LE(end), 0x06054b50)
      const count = zip.readUInt16LE(end + 10)
      let at = zip.readUInt32LE(end + 16)
      const out = {}
      for (let i = 0; i < count; i++) {
        assert.equal(zip.readUInt32LE(at), 0x02014b50)
        const size = zip.readUInt32LE(at + 20)
        const nameLen = zip.readUInt16LE(at + 28)
        const local = zip.readUInt32LE(at + 42)
        const name = zip.subarray(at + 46, at + 46 + nameLen).toString("utf8")
        const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
        out[name] = inflateRawSync(zip.subarray(dataStart, dataStart + size)).toString("utf8")
        at += 46 + nameLen
      }
      assert.deepEqual(out, files)
      // Same files, same zip (a rebuild doesn't look like a change)
      assert.ok(zipFolder(dir).equals(zip))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("starts a new native line only when the native part changes", () => {
    const first = minNativeVersion([], "aaa", "2.3.0")
    assert.equal(first.minNative, "2.3.0")
    const webOnly = minNativeVersion(first.history, "aaa", "2.3.1")
    assert.equal(webOnly.minNative, "2.3.0")
    assert.equal(webOnly.history.length, 1)
    const nativeChange = minNativeVersion(webOnly.history, "bbb", "2.4.0")
    assert.equal(nativeChange.minNative, "2.4.0")
    // Rebuilding 2.4.0 after another native fix replaces its line
    const rebuilt = minNativeVersion(nativeChange.history, "ccc", "2.4.0")
    assert.deepEqual(rebuilt.history.map((h) => h.fingerprint), ["aaa", "ccc"])
  })

  it("fingerprints the native part of this project the same way twice", () => {
    const root = path.join(import.meta.dirname, "..")
    const a = nativeFingerprint(root)
    assert.match(a, /^[0-9a-f]{64}$/)
    assert.equal(nativeFingerprint(root), a)
  })
})
