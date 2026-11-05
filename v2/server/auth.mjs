// Email + one-time-code sign-in. No passwords; codes are emailed with Resend.
// Users and sessions live in DATA_DIR/_auth.json; pending codes only in memory
// (a restart just means asking for a new code).

import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { HttpError } from "./http-error.mjs"

const CODE_TTL = 10 * 60_000
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN = 30_000
const CODES_PER_HOUR = 5
const SESSION_TTL = 180 * 86_400_000
const TOUCH_EVERY = 86_400_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const sha = (value) => createHash("sha256").update(value).digest("hex")

export function normalizeEmail(email) {
  const value = typeof email === "string" ? email.trim().toLowerCase() : ""
  if (value.length > 254 || !EMAIL_RE.test(value)) throw new HttpError(400, "Enter a valid email address")
  return value
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

/** One email through Resend's HTTP API (no SDK needed) */
function resendSend({ apiKey, from }) {
  return async ({ to, subject, text, html }) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`Resend error ${res.status}: ${await res.text().catch(() => "")}`)
      throw new HttpError(502, "Couldn't send the email right now. Try again in a minute.")
    }
  }
}

const FOOTER = "CostSplit · shared home and trip costs · made with ☕ by Ehsan"

/** Sign-in codes */
export function resendMailer(config) {
  const send = resendSend(config)
  return (email, code) =>
    send({
      to: email,
      subject: `${code} is your CostSplit code`,
      text: `Your CostSplit sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#172033">
  <p style="margin:0 0 16px;font-size:16px">Your CostSplit sign-in code:</p>
  <p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px">${code}</p>
  <p style="margin:0;color:#5b6577;font-size:14px">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`,
    })
}

/** The words of an invite email, shared by the real and the console sender */
export function inviteMessage({ email, inviter, member, group, emoji, kind, link }) {
  const what = kind === "home" ? "share home costs" : "share trip costs"
  const subject = `${inviter} invited you to ${group} on CostSplit`
  const text = [
    `Hi ${member},`,
    "",
    `${inviter} added you to ${emoji} ${group} on CostSplit, to ${what} and see who owes whom.`,
    "",
    `Join here: ${link}`,
    "",
    `Sign in with this address (${email}) and you're set up as ${member} straight away.`,
    "",
    FOOTER,
  ].join("\n")
  const h = escapeHtml
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#172033">
  <p style="margin:0 0 12px;font-size:16px">Hi ${h(member)},</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.5"><strong>${h(inviter)}</strong> added you to <strong>${h(emoji)} ${h(group)}</strong> on CostSplit, to ${what} and see who owes whom.</p>
  <p style="margin:0 0 20px"><a href="${h(link)}" style="display:inline-block;background:#2f6fec;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Join ${h(group)}</a></p>
  <p style="margin:0 0 20px;color:#5b6577;font-size:14px;line-height:1.5">Sign in with this address (${h(email)}) and you're set up as ${h(member)} straight away. Works on any phone or computer; Android users can get the app from the same page.</p>
  <p style="margin:0;color:#8a93a5;font-size:12px">${h(FOOTER)}</p>
</div>`
  return { to: email, subject, text, html }
}

/** Invites to a group */
export function resendInviter(config) {
  const send = resendSend(config)
  return (invite) => send(inviteMessage(invite))
}

/** Development without a Resend key: codes are printed to the server console */
export const consoleMailer = async (email, code) => {
  console.log(`[dev] Sign-in code for ${email}: ${code}`)
}

export const consoleInviter = async (invite) => {
  console.log(`[dev] Invite for ${invite.email} to ${invite.group}: ${invite.link}`)
}

export function createAuth({ dataDir, mailer }) {
  const file = path.join(dataDir, "_auth.json")
  /** @type {{ users: Record<string, {id: string, email: string, createdAt: number, groups: string[], name?: string, avatar?: string}>, byEmail: Record<string, string>, sessions: Record<string, {userId: string, createdAt: number, lastSeen: number}> } | null} */
  let state = null
  let chain = Promise.resolve()
  const codes = new Map()

  async function load() {
    if (state) return state
    try {
      state = JSON.parse(await readFile(file, "utf8"))
    } catch (err) {
      if (err.code !== "ENOENT") throw err
      state = { users: {}, byEmail: {}, sessions: {} }
    }
    return state
  }

  async function save() {
    await mkdir(dataDir, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(state))
    await rename(tmp, file)
  }

  // All writes to the auth file happen one at a time
  const locked = (fn) => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => {})
    return run
  }

  const publicUser = (u) => ({
    id: u.id,
    email: u.email,
    ...(u.name ? { name: u.name } : {}),
    ...(u.avatar ? { avatar: u.avatar } : {}),
  })

  async function start(rawEmail) {
    const email = normalizeEmail(rawEmail)
    const now = Date.now()
    const entry = codes.get(email)
    const sent = (entry?.sent ?? []).filter((t) => now - t < 3_600_000)
    if (sent.length && now - sent[sent.length - 1] < RESEND_COOLDOWN) {
      throw new HttpError(429, "Wait 30 seconds before asking for another code")
    }
    if (sent.length >= CODES_PER_HOUR) throw new HttpError(429, "Too many codes asked for. Try again in an hour.")
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    await mailer(email, code)
    codes.set(email, { hash: sha(`${email}:${code}`), expires: now + CODE_TTL, attempts: 0, sent: [...sent, now] })
    return { email }
  }

  async function verify(rawEmail, rawCode) {
    const email = normalizeEmail(rawEmail)
    const code = String(rawCode ?? "").replace(/\D/g, "")
    const entry = codes.get(email)
    if (!entry?.hash || Date.now() > entry.expires) throw new HttpError(400, "That code has expired. Ask for a new one.")
    entry.attempts += 1
    if (entry.attempts > MAX_ATTEMPTS) {
      entry.hash = null
      throw new HttpError(429, "Too many wrong tries. Ask for a new code.")
    }
    const ok = code.length === 6 && timingSafeEqual(Buffer.from(sha(`${email}:${code}`)), Buffer.from(entry.hash))
    if (!ok) throw new HttpError(400, "That code isn't right. Check the email and try again.")
    entry.hash = null // each code works once

    return locked(async () => {
      const s = await load()
      let id = s.byEmail[email]
      if (!id) {
        id = randomUUID()
        s.users[id] = { id, email, createdAt: Date.now(), groups: [] }
        s.byEmail[email] = id
      }
      const token = randomBytes(32).toString("base64url")
      s.sessions[sha(token)] = { userId: id, createdAt: Date.now(), lastSeen: Date.now() }
      await save()
      return { token, user: publicUser(s.users[id]) }
    })
  }

  /** The signed-in user for a request, or null */
  async function authenticate(req) {
    const header = String(req.headers.authorization ?? "")
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
    if (!token) return null
    const s = await load()
    const key = sha(token)
    const session = s.sessions[key]
    if (!session) return null
    const now = Date.now()
    if (now - session.lastSeen > SESSION_TTL) {
      await locked(async () => {
        delete s.sessions[key]
        await save()
      })
      return null
    }
    // Sliding expiry without writing the file on every request
    if (now - session.lastSeen > TOUCH_EVERY) {
      await locked(async () => {
        session.lastSeen = now
        await save()
      })
    }
    const user = s.users[session.userId]
    return user ? publicUser(user) : null
  }

  async function logout(req) {
    const header = String(req.headers.authorization ?? "")
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
    if (!token) return
    await locked(async () => {
      const s = await load()
      delete s.sessions[sha(token)]
      await save()
    })
  }

  async function addGroup(userId, tripId) {
    const s = await load()
    if (s.users[userId]?.groups.includes(tripId)) return
    await locked(async () => {
      const user = s.users[userId]
      if (!user || user.groups.includes(tripId)) return
      user.groups.push(tripId)
      await save()
    })
  }

  async function removeGroup(userId, tripId) {
    await locked(async () => {
      const s = await load()
      const user = s.users[userId]
      if (!user) return
      user.groups = user.groups.filter((g) => g !== tripId)
      await save()
    })
  }

  async function groupsOf(userId) {
    const s = await load()
    return [...(s.users[userId]?.groups ?? [])]
  }

  /** Display name for the profile (and for invites). Empty clears it. */
  async function setName(userId, rawName) {
    if (rawName !== undefined && rawName !== null && typeof rawName !== "string") throw new HttpError(400, "Invalid name")
    // Control characters would break emails and lists
    const name = String(rawName ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40)
    return locked(async () => {
      const s = await load()
      const user = s.users[userId]
      if (!user) throw new HttpError(401, "Sign in again")
      if (name) user.name = name
      else delete user.name
      await save()
      return publicUser(user)
    })
  }

  /** Points the profile at a new photo (or none). Returns the user and the photo it replaced. */
  async function setAvatar(userId, avatarId) {
    return locked(async () => {
      const s = await load()
      const user = s.users[userId]
      if (!user) throw new HttpError(401, "Sign in again")
      const previous = user.avatar ?? null
      if (avatarId) user.avatar = avatarId
      else delete user.avatar
      await save()
      return { user: publicUser(user), previous }
    })
  }

  return { start, verify, authenticate, logout, addGroup, removeGroup, groupsOf, setName, setAvatar }
}
