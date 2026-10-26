// CostSplit sync server: zero dependencies, Node 18+.
// Stores one JSON file per trip and serves the built web app.
//
//   node server/server.mjs                 # http://localhost:8787
//   PORT=8080 DATA_DIR=/var/costsplit node server/server.mjs
//
// Env: PORT, HOST, DATA_DIR, STATIC_DIR (built web app; empty string = API only),
//      TRUST_PROXY=1 when behind nginx/Caddy/a load balancer (rate limit by X-Forwarded-For),
//      RESEND_API_KEY + MAIL_FROM for sign-in emails (without a key, dev prints codes to the console)

import { createReadStream } from "node:fs"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { consoleMailer, createAuth, resendMailer } from "./auth.mjs"
import { HttpError } from "./http-error.mjs"

const TABLES = new Set(["trips", "members", "expenses", "payments", "bills", "meals", "items"])
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const MAX_BODY = 1024 * 1024
// Photos are resized to ~1600px JPEG on the phone, so this is generous
const MAX_FILE_BYTES = 3 * 1024 * 1024
const MAX_CHANGES = 500
const MAX_RECORD_BYTES = 8 * 1024
const MAX_RECORDS_PER_TRIP = 50_000
const PAGE_SIZE = 500
const SYNC_LIMIT = { windowMs: 5 * 60 * 1000, max: 600 }
const AUTH_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".apk": "application/vnd.android.package-archive",
}

/** Trip storage: { seq, users: [userId], records: { "table:id": { table, seq, updatedAt, data } } } */
function createStore(dataDir) {
  const cache = new Map()
  const locks = new Map()
  const file = (tripId) => path.join(dataDir, `${tripId}.json`)

  async function load(tripId) {
    let trip = cache.get(tripId)
    if (!trip) {
      try {
        trip = JSON.parse(await readFile(file(tripId), "utf8"))
      } catch (err) {
        if (err.code !== "ENOENT") throw err
        trip = { seq: 0, users: [], records: {} }
      }
      cache.set(tripId, trip)
      // Keep memory bounded; trips are re-read from disk when needed again
      if (cache.size > 500) cache.delete(cache.keys().next().value)
    }
    return trip
  }

  async function save(tripId, trip) {
    await mkdir(dataDir, { recursive: true })
    const tmp = `${file(tripId)}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(trip))
    await rename(tmp, file(tripId)) // atomic: a crash never leaves half a file
  }

  // One request at a time per trip, so seq numbers are handed out and become
  // visible in order and a pulling client can never skip one.
  function withLock(tripId, fn) {
    const prev = locks.get(tripId) ?? Promise.resolve()
    const run = prev.then(fn, fn)
    const tail = run.catch(() => {})
    locks.set(tripId, tail)
    tail.then(() => locks.get(tripId) === tail && locks.delete(tripId))
    return run
  }

  async function sync(tripId, cursor, changes, userId) {
    return withLock(tripId, async () => {
      const trip = await load(tripId)
      trip.users ??= []

      // Last write wins per record; keep only the newest version in the batch
      const latest = new Map()
      for (const { table, record } of changes) {
        const key = `${table}:${record.id}`
        const prev = latest.get(key)
        if (!prev || record.updatedAt >= prev.record.updatedAt) latest.set(key, { table, record })
      }
      let changed = false
      for (const [key, { table, record }] of latest) {
        const current = trip.records[key]
        if (current && current.updatedAt >= record.updatedAt) continue
        if (!current && Object.keys(trip.records).length >= MAX_RECORDS_PER_TRIP) {
          throw new HttpError(413, "Trip is full")
        }
        const { dirty: _dirty, ...data } = record
        trip.seq += 1
        trip.records[key] = { table, seq: trip.seq, updatedAt: record.updatedAt, data }
        changed = true
      }
      // Having the link and an account is how people join a group
      let joined = false
      if (Object.keys(trip.records).length > 0 && !trip.users.includes(userId)) {
        trip.users.push(userId)
        joined = changed = true
      }
      if (changed) await save(tripId, trip)

      const newer = Object.values(trip.records)
        .filter((r) => r.seq > cursor)
        .sort((a, b) => a.seq - b.seq)
      const page = newer.slice(0, PAGE_SIZE)
      return {
        joined,
        cursor: page.length ? page[page.length - 1].seq : cursor,
        hasMore: newer.length > PAGE_SIZE,
        changes: page.map((r) => ({ table: r.table, record: r.data })),
      }
    })
  }

  /** Name and icon for the "your groups" list */
  async function info(tripId) {
    const data = (await load(tripId)).records[`trips:${tripId}`]?.data
    return data && !data.deleted ? { id: tripId, name: data.name, emoji: data.emoji, kind: data.kind ?? "trip" } : null
  }

  async function isMember(tripId, userId) {
    return (await load(tripId)).users?.includes(userId) ?? false
  }

  async function leave(tripId, userId) {
    return withLock(tripId, async () => {
      const trip = await load(tripId)
      if (!trip.users?.includes(userId)) return
      trip.users = trip.users.filter((u) => u !== userId)
      await save(tripId, trip)
    })
  }

  return { sync, info, leave, isMember }
}

function validate(body) {
  const { tripId, cursor = 0, changes = [] } = body ?? {}
  if (typeof tripId !== "string" || !ID_RE.test(tripId)) throw new HttpError(400, "Invalid trip id")
  if (!Number.isInteger(cursor) || cursor < 0) throw new HttpError(400, "Invalid cursor")
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES) {
    throw new HttpError(400, `Send between 0 and ${MAX_CHANGES} changes`)
  }
  for (const change of changes) {
    const { table, record } = change ?? {}
    if (!TABLES.has(table)) throw new HttpError(400, "Unknown table")
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new HttpError(400, "Invalid record")
    if (typeof record.id !== "string" || !ID_RE.test(record.id)) throw new HttpError(400, "Invalid record id")
    if (record.tripId !== tripId) throw new HttpError(400, "Record belongs to another trip")
    if (table === "trips" && record.id !== tripId) throw new HttpError(400, "Trip id mismatch")
    if (!Number.isFinite(record.updatedAt)) throw new HttpError(400, "Invalid updatedAt")
    if (JSON.stringify(record).length > MAX_RECORD_BYTES) throw new HttpError(400, "Record too large")
  }
  return { tripId, cursor, changes }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new HttpError(413, "Request too large"))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"))
      } catch {
        reject(new HttpError(400, "Invalid JSON"))
      }
    })
    req.on("error", reject)
  })
}

function readBytes(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, "Photo too large"))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

function rateLimiter({ windowMs, max }) {
  const hits = new Map()
  setInterval(() => hits.clear(), windowMs).unref()
  return (ip) => {
    const n = (hits.get(ip) ?? 0) + 1
    hits.set(ip, n)
    return n <= max
  }
}

async function serveStatic(staticDir, urlPath, req, res) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    throw new HttpError(400, "Bad path")
  }
  const safe = path.normalize(decoded).replace(/^([/\\])+/, "")
  let filePath = path.join(staticDir, safe)
  if (filePath !== staticDir && !filePath.startsWith(staticDir + path.sep)) throw new HttpError(403, "Forbidden")

  let info = await stat(filePath).catch(() => null)
  // Folders with their own page (/download/) are served as-is
  if (info?.isDirectory()) {
    filePath = path.join(filePath, "index.html")
    info = await stat(filePath).catch(() => null)
  }
  if (!info?.isFile()) {
    // Client-side routes (/t/:id, /join/:id) get the app shell
    if (path.extname(safe)) throw new HttpError(404, "Not found")
    filePath = path.join(staticDir, "index.html")
    info = await stat(filePath).catch(() => null)
    if (!info) throw new HttpError(404, "Web app not built. Run: npm run build")
  }

  const name = path.basename(filePath)
  const cache =
    name === "index.html" || name === "sw.js" || name.endsWith(".webmanifest")
      ? "no-cache"
      : filePath.includes(`${path.sep}assets${path.sep}`)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600"
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": name.endsWith(".apk") || name === "version.json" ? "no-cache" : cache,
    ...(name.endsWith(".apk") ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
  })
  if (req.method === "HEAD") return res.end()
  createReadStream(filePath).pipe(res)
}

export function createServer({ dataDir, staticDir, trustProxy = false, mailer = consoleMailer } = {}) {
  const dir = path.resolve(dataDir ?? "data")
  const store = createStore(dir)
  const auth = createAuth({ dataDir: dir, mailer })
  const allowSync = rateLimiter(SYNC_LIMIT)
  const allowAuth = rateLimiter(AUTH_LIMIT)
  const root = staticDir ? path.resolve(staticDir) : null
  const clientIp = (req) =>
    (trustProxy && String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim()) || req.socket.remoteAddress

  return http.createServer(async (req, res) => {
    // The trip id is the access key (no cookies), so any origin may call the API.
    // This also lets the Android app (https://localhost) reach the server.
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.setHeader("X-Content-Type-Options", "nosniff")
    // Trip ids in URLs are access keys: never leak them to other sites
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("X-Frame-Options", "DENY")

    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(body))
    }

    try {
      const { pathname } = new URL(req.url, "http://localhost")
      if (req.method === "OPTIONS") {
        res.writeHead(204)
        return res.end()
      }
      if (pathname === "/api/health") return json(200, { ok: true })

      if (pathname.startsWith("/api/auth/")) {
        if (req.method !== "POST") throw new HttpError(405, "Use POST")
        if (!allowAuth(clientIp(req))) throw new HttpError(429, "Too many sign-in attempts. Try again in a few minutes.")
        const body = await readJson(req)
        if (pathname === "/api/auth/start") return json(200, await auth.start(body.email))
        if (pathname === "/api/auth/verify") return json(200, await auth.verify(body.email, body.code))
        if (pathname === "/api/auth/logout") {
          await auth.logout(req)
          return json(200, { ok: true })
        }
        throw new HttpError(404, "Not found")
      }

      if (pathname.startsWith("/api/")) {
        const user = await auth.authenticate(req)
        if (!user) throw new HttpError(401, "Sign in to sync")

        if (pathname === "/api/me" && req.method === "GET") {
          const groups = (await Promise.all((await auth.groupsOf(user.id)).map((id) => store.info(id)))).filter(Boolean)
          return json(200, { user, groups })
        }
        if (pathname === "/api/sync" && req.method === "POST") {
          if (!allowSync(clientIp(req))) throw new HttpError(429, "Too many requests, slow down")
          const { tripId, cursor, changes } = validate(await readJson(req))
          const { joined, ...result } = await store.sync(tripId, cursor, changes, user.id)
          if (cursor === 0 && result.changes.length === 0) throw new HttpError(404, "Trip not found")
          if (joined) await auth.addGroup(user.id, tripId)
          return json(200, result)
        }
        // Receipt and payment photos: /api/files/<tripId>/<fileId>, members only
        const fileMatch = pathname.match(/^\/api\/files\/([A-Za-z0-9_-]{8,64})\/([A-Za-z0-9_-]{8,64})$/)
        if (fileMatch) {
          const [, tripId, fileId] = fileMatch
          if (!(await store.isMember(tripId, user.id))) throw new HttpError(403, "Not a member of this group")
          const fileDir = path.join(dir, "files", tripId)
          const filePath = path.join(fileDir, `${fileId}.jpg`)
          if (req.method === "PUT") {
            if (!allowSync(clientIp(req))) throw new HttpError(429, "Too many requests, slow down")
            if (!String(req.headers["content-type"]).startsWith("image/jpeg")) throw new HttpError(415, "Send a JPEG photo")
            const bytes = await readBytes(req, MAX_FILE_BYTES)
            // JPEG files start with FF D8 FF
            if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
              throw new HttpError(415, "Send a JPEG photo")
            }
            await mkdir(fileDir, { recursive: true })
            const tmp = `${filePath}.${process.pid}.tmp`
            await writeFile(tmp, bytes)
            await rename(tmp, filePath)
            return json(200, { ok: true })
          }
          if (req.method === "GET") {
            const info = await stat(filePath).catch(() => null)
            if (!info) throw new HttpError(404, "Photo not found")
            res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Content-Length": info.size,
              // File ids never change content, but they're private
              "Cache-Control": "private, max-age=31536000, immutable",
            })
            return createReadStream(filePath).pipe(res)
          }
        }
        if (pathname === "/api/groups/leave" && req.method === "POST") {
          const { tripId } = await readJson(req)
          if (typeof tripId !== "string" || !ID_RE.test(tripId)) throw new HttpError(400, "Invalid trip id")
          await store.leave(tripId, user.id)
          await auth.removeGroup(user.id, tripId)
          return json(200, { ok: true })
        }
      }
      if (pathname.startsWith("/api/")) throw new HttpError(404, "Not found")
      if (!root || (req.method !== "GET" && req.method !== "HEAD")) throw new HttpError(404, "Not found")
      await serveStatic(root, pathname, req, res)
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      if (status === 500) console.error(err)
      if (!res.headersSent) json(status, { message: status === 500 ? "Server error" : err.message })
      else res.end()
    }
  })
}

// Run directly: node server/server.mjs (pm2 loads it through its own wrapper, so argv[1] is pm2's file there)
const entry = process.env.pm_exec_path ?? process.argv[1]
if (entry && fileURLToPath(import.meta.url) === path.resolve(entry)) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const port = Number(process.env.PORT ?? 8787)
  const dataDir = process.env.DATA_DIR ?? path.join(here, "..", "data")
  const staticDir = process.env.STATIC_DIR ?? path.join(here, "..", "dist")
  const mailer = process.env.RESEND_API_KEY
    ? resendMailer({ apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM ?? "CostSplit <onboarding@resend.dev>" })
    : process.env.NODE_ENV === "production"
      ? async () => {
          throw new HttpError(503, "Email sign-in isn't set up on this server yet")
        }
      : consoleMailer
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      process.env.NODE_ENV === "production"
        ? "RESEND_API_KEY not set: email sign-in is off (answers 503), so nobody can sync yet"
        : "RESEND_API_KEY not set: sign-in codes are printed here instead of emailed"
    )
  }
  const server = createServer({ dataDir, staticDir, trustProxy: process.env.TRUST_PROXY === "1", mailer })
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
    console.log(`CostSplit server on http://localhost:${port} (data: ${path.resolve(dataDir)})`)
  })

  // Finish in-flight requests (and their file writes) before exiting
  const stop = (signal) => {
    console.log(`${signal}: shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)
}
