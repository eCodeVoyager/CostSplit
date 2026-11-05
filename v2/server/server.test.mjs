import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, describe, it } from "node:test"
import { createServer } from "./server.mjs"

const TRIP = "11111111-2222-4333-8444-555555555555"
const OTHER = "99999999-2222-4333-8444-555555555555"

const trip = (over = {}) => ({ id: TRIP, tripId: TRIP, name: "Greece", updatedAt: 1000, deleted: 0, dirty: 1, ...over })
const member = (id, over = {}) => ({ id, tripId: TRIP, name: `M ${id}`, updatedAt: 1000, deleted: 0, ...over })

let server
let base
let dataDir
const inbox = new Map()
const invites = []

async function call(pathname, { method = "POST", body, token } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function signIn(email) {
  assert.equal((await call("/api/auth/start", { body: { email } })).status, 200)
  const res = await call("/api/auth/verify", { body: { email, code: inbox.get(email.toLowerCase()) } })
  assert.equal(res.status, 200)
  return res.body.token
}

let alice
const sync = (body, token = alice) => call("/api/sync", { body, token })

describe("sync server", () => {
  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "costsplit-"))
    server = createServer({
      dataDir,
      mailer: async (email, code) => inbox.set(email, code),
      inviter: async (invite) => invites.push(invite),
      publicUrl: "https://split.example.com/",
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
    base = `http://127.0.0.1:${server.address().port}`
    alice = await signIn("Alice@Example.com")
  })

  after(async () => {
    server.close()
    await rm(dataDir, { recursive: true, force: true })
  })

  it("requires sign-in to sync", async () => {
    assert.equal((await call("/api/sync", { body: { tripId: TRIP } })).status, 401)
    assert.equal((await call("/api/sync", { body: { tripId: TRIP }, token: "made-up" })).status, 401)
  })

  it("404s when joining an unknown trip", async () => {
    assert.equal((await sync({ tripId: OTHER, cursor: 0 })).status, 404)
  })

  it("pushes, persists to one file and pulls with a cursor", async () => {
    const res = await sync({
      tripId: TRIP,
      cursor: 0,
      changes: [
        { table: "trips", record: trip() },
        { table: "members", record: member("member-aaa") },
      ],
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.cursor, 2)
    assert.equal(res.body.changes.length, 2)
    assert.equal(res.body.changes[0].record.dirty, undefined)
    assert.equal(res.body.joined, undefined, "membership is internal")
    assert.ok((await readdir(dataDir)).includes(`${TRIP}.json`))

    const again = await sync({ tripId: TRIP, cursor: 2 })
    assert.deepEqual(again.body, { cursor: 2, hasMore: false, changes: [] })
  })

  it("keeps the newest version (last write wins)", async () => {
    await sync({ tripId: TRIP, changes: [{ table: "trips", record: trip({ updatedAt: 3000, name: "New" }) }] })
    await sync({ tripId: TRIP, changes: [{ table: "trips", record: trip({ updatedAt: 2000, name: "Stale" }) }] })
    const res = await sync({ tripId: TRIP, cursor: 0 })
    assert.equal(res.body.changes.find((c) => c.table === "trips").record.name, "New")
  })

  it("lists the creator's groups and adds people who join with the link", async () => {
    const me = await call("/api/me", { method: "GET", token: alice })
    assert.equal(me.body.user.email, "alice@example.com")
    assert.deepEqual(me.body.groups.map((g) => g.name), ["New"])

    const bob = await signIn("bob@example.com")
    assert.deepEqual((await call("/api/me", { method: "GET", token: bob })).body.groups, [])
    assert.equal((await sync({ tripId: TRIP, cursor: 0 }, bob)).status, 200)
    assert.deepEqual((await call("/api/me", { method: "GET", token: bob })).body.groups.map((g) => g.id), [TRIP])

    assert.equal((await call("/api/groups/leave", { body: { tripId: TRIP }, token: bob })).status, 200)
    assert.deepEqual((await call("/api/me", { method: "GET", token: bob })).body.groups, [])
  })

  it("survives a restart (reads from disk), sessions included", async () => {
    const fresh = createServer({ dataDir })
    await new Promise((r) => fresh.listen(0, "127.0.0.1", r))
    const res = await fetch(`http://127.0.0.1:${fresh.address().port}/api/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${alice}` },
      body: JSON.stringify({ tripId: TRIP, cursor: 0 }),
    })
    fresh.close()
    assert.equal(res.status, 200)
    assert.equal((await res.json()).changes.length, 2)
  })

  it("keeps personal expenses private to their owner", async () => {
    const personal = (id, over = {}) => ({ id, tripId: TRIP, title: "Lunch", amount: 500, updatedAt: 5000, deleted: 0, ...over })
    const bob = await signIn("erin@example.com")
    const mine = await sync({ tripId: TRIP, changes: [{ table: "personal", record: personal("personal-aaa", { owner: "someone-else" }) }] })
    assert.equal(mine.status, 200)
    const own = mine.body.changes.find((c) => c.table === "personal")
    assert.equal(own.record.title, "Lunch")
    assert.notEqual(own.record.owner, "someone-else", "the server sets the owner, not the client")

    // Bob is in the same group but never receives Alice's row
    const theirs = await sync({ tripId: TRIP, cursor: 0 }, bob)
    assert.equal(theirs.status, 200)
    assert.equal(theirs.body.changes.some((c) => c.table === "personal"), false)
    assert.ok(theirs.body.changes.some((c) => c.table === "trips"))
    assert.equal(theirs.body.cursor, mine.body.cursor, "the cursor still moves past hidden rows")

    // ...and can't overwrite it by reusing the id
    await sync({ tripId: TRIP, changes: [{ table: "personal", record: personal("personal-aaa", { title: "Hacked", updatedAt: 9000 }) }] }, bob)
    const check = await sync({ tripId: TRIP, cursor: 0 })
    assert.equal(check.body.changes.find((c) => c.table === "personal").record.title, "Lunch")
    assert.equal((await sync({ tripId: TRIP, cursor: 0 }, bob)).body.changes.some((c) => c.table === "personal"), false)
    await call("/api/groups/leave", { body: { tripId: TRIP }, token: bob })
  })

  it("rejects bad input", async () => {
    assert.equal((await sync({ tripId: "bad id!" })).status, 400)
    assert.equal((await sync({ tripId: TRIP, cursor: -1 })).status, 400)
    assert.equal((await sync({ tripId: TRIP, changes: [{ table: "users", record: trip() }] })).status, 400)
    const foreign = await sync({ tripId: TRIP, changes: [{ table: "members", record: member("member-bbb", { tripId: OTHER }) }] })
    assert.equal(foreign.status, 400)
  })

  it("guards the one-time codes", async () => {
    const email = "carol@example.com"
    assert.equal((await call("/api/auth/start", { body: { email: "not-an-email" } })).status, 400)
    assert.equal((await call("/api/auth/start", { body: { email } })).status, 200)
    // Asking again right away is throttled
    assert.equal((await call("/api/auth/start", { body: { email } })).status, 429)

    const real = inbox.get(email)
    const wrong = real === "000000" ? "111111" : "000000"
    for (let i = 0; i < 5; i++) {
      assert.equal((await call("/api/auth/verify", { body: { email, code: wrong } })).status, 400)
    }
    // Locked after 5 wrong tries, even with the right code
    assert.equal((await call("/api/auth/verify", { body: { email, code: real } })).status, 429)
  })

  it("codes work once and logout ends the session", async () => {
    const email = "dave@example.com"
    await call("/api/auth/start", { body: { email } })
    const code = inbox.get(email)
    const first = await call("/api/auth/verify", { body: { email, code } })
    assert.equal(first.status, 200)
    assert.equal((await call("/api/auth/verify", { body: { email, code } })).status, 400)

    const token = first.body.token
    assert.equal((await call("/api/me", { method: "GET", token })).status, 200)
    await call("/api/auth/logout", { token })
    assert.equal((await call("/api/me", { method: "GET", token })).status, 401)
  })

  it("stores receipt photos for members only", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    const put = (token, body = jpeg, type = "image/jpeg") =>
      fetch(`${base}/api/files/${TRIP}/receipt-0001`, {
        method: "PUT",
        headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body,
      })
    assert.equal((await put(undefined)).status, 401)
    assert.equal((await put(alice, Buffer.from("not a jpeg"))).status, 415)
    assert.equal((await put(alice, jpeg, "image/png")).status, 415)
    assert.equal((await put(alice)).status, 200)

    const got = await fetch(`${base}/api/files/${TRIP}/receipt-0001`, { headers: { Authorization: `Bearer ${alice}` } })
    assert.equal(got.status, 200)
    assert.equal(got.headers.get("content-type"), "image/jpeg")
    assert.deepEqual(Buffer.from(await got.arrayBuffer()), jpeg)

    // Signed in but not in the group
    const eve = await signIn("eve@example.com")
    const denied = await fetch(`${base}/api/files/${TRIP}/receipt-0001`, { headers: { Authorization: `Bearer ${eve}` } })
    assert.equal(denied.status, 403)
  })

  it("serves the web app, folder pages and APK downloads with safe headers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "costsplit-web-"))
    const web = path.join(root, "web")
    await mkdir(web)
    await writeFile(path.join(root, "secret.txt"), "secret")
    await writeFile(path.join(web, "index.html"), "<p>app</p>")
    await mkdir(path.join(web, "download"))
    await writeFile(path.join(web, "download", "index.html"), "<p>download</p>")
    await writeFile(path.join(web, "download", "costsplit.apk"), "apk")
    const site = createServer({ dataDir, staticDir: web })
    await new Promise((r) => site.listen(0, "127.0.0.1", r))
    const url = `http://127.0.0.1:${site.address().port}`
    try {
      const route = await fetch(`${url}/t/some-trip-id`)
      assert.equal(await route.text(), "<p>app</p>")
      assert.equal(route.headers.get("referrer-policy"), "no-referrer")
      assert.equal(await (await fetch(`${url}/download/`)).text(), "<p>download</p>")
      const apk = await fetch(`${url}/download/costsplit.apk`)
      assert.equal(apk.headers.get("content-type"), "application/vnd.android.package-archive")
      assert.match(apk.headers.get("content-disposition"), /attachment/)
      const head = await fetch(`${url}/download/costsplit.apk`, { method: "HEAD" })
      assert.equal(head.status, 200)
      for (const attempt of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt"]) {
        const res = await fetch(`${url}${attempt}`)
        assert.notEqual(await res.text(), "secret", `traversal via ${attempt}`)
      }
      assert.equal((await fetch(`${url}/missing.js`)).status, 404)
    } finally {
      site.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps a profile name and photo, shown to anyone signed in", async () => {
    const named = await call("/api/profile", { body: { name: `  Alice${String.fromCharCode(7)} A.  ` }, token: alice })
    assert.equal(named.status, 200)
    assert.equal(named.body.user.name, "Alice A.")
    assert.equal((await call("/api/profile", { body: { name: 42 }, token: alice })).status, 400)
    assert.equal((await call("/api/profile", { body: { name: "x" } })).status, 401)

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])
    const upload = (body, type = "image/jpeg") =>
      fetch(`${base}/api/profile/avatar`, { method: "PUT", headers: { "Content-Type": type, Authorization: `Bearer ${alice}` }, body })
    assert.equal((await upload(Buffer.from("png?"))).status, 415)
    assert.equal((await upload(Buffer.alloc(600 * 1024, 0xff))).status, 413)
    const first = await (await upload(jpeg)).json()
    assert.match(first.user.avatar, /^[\w-]{8,64}$/)
    const second = await (await upload(jpeg)).json()
    assert.notEqual(second.user.avatar, first.user.avatar, "a new photo gets a new id")

    // /api/me and sign-in both carry the profile
    const me = await call("/api/me", { method: "GET", token: alice })
    assert.equal(me.body.user.name, "Alice A.")
    assert.equal(me.body.user.avatar, second.user.avatar)

    const other = await signIn("frank@example.com")
    const photo = await fetch(`${base}/api/avatars/${second.user.avatar}`, { headers: { Authorization: `Bearer ${other}` } })
    assert.equal(photo.status, 200)
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), jpeg)
    // The replaced photo is gone, and photos need an account
    assert.equal((await fetch(`${base}/api/avatars/${first.user.avatar}`, { headers: { Authorization: `Bearer ${other}` } })).status, 404)
    assert.equal((await fetch(`${base}/api/avatars/${second.user.avatar}`)).status, 401)

    const removed = await call("/api/profile/avatar", { method: "DELETE", token: alice })
    assert.equal(removed.body.user.avatar, undefined)
    assert.equal((await fetch(`${base}/api/avatars/${second.user.avatar}`, { headers: { Authorization: `Bearer ${other}` } })).status, 404)
  })

  it("emails personal invite links for members of the group only", async () => {
    await sync({ tripId: TRIP, changes: [{ table: "members", record: member("member-carol", { name: "Carol <b>", updatedAt: 6000 }) }] })
    const invite = (body, token = alice) => call("/api/invite", { body: { tripId: TRIP, memberId: "member-carol", email: "Carol@Example.com", ...body }, token })

    const sent = await invite({})
    assert.equal(sent.status, 200)
    const last = invites.at(-1)
    assert.equal(last.email, "carol@example.com")
    assert.equal(last.inviter, "Alice A.")
    assert.equal(last.member, "Carol <b>")
    assert.equal(last.link, `https://split.example.com/join/${TRIP}?as=member-carol`)

    assert.equal((await invite({ email: "nope" })).status, 400)
    assert.equal((await invite({ memberId: "member-nobody" })).status, 404)
    assert.equal((await invite({ tripId: OTHER })).status, 403)
    // Signed in but not in the group
    const mallory = await signIn("mallory@example.com")
    assert.equal((await invite({}, mallory)).status, 403)
    assert.equal(invites.length, 1)
  })

  it("escapes names in invite emails", async () => {
    const { inviteMessage } = await import("./auth.mjs")
    const msg = inviteMessage({ email: "c@x.io", inviter: "A", member: "<script>", group: "G&G", emoji: "🏠", kind: "home", link: "https://x.io/join/abc?as=d" })
    assert.ok(!msg.html.includes("<script>"))
    assert.ok(msg.html.includes("&lt;script&gt;"))
    assert.ok(msg.html.includes("G&amp;G"))
    assert.ok(msg.text.includes("https://x.io/join/abc?as=d"))
  })

  it("answers CORS preflight (with Authorization) and health", async () => {
    const pre = await fetch(`${base}/api/sync`, { method: "OPTIONS" })
    assert.equal(pre.status, 204)
    assert.equal(pre.headers.get("access-control-allow-origin"), "*")
    assert.match(pre.headers.get("access-control-allow-headers"), /Authorization/)
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true })
  })
})
