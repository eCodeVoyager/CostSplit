// End-to-end test server: the real sync server and the real production build
// (dist-e2e, built with `vite build --mode e2e` so it never points at a live
// server), with a throwaway data folder. Sign-in codes are written to
// e2e/.data/codes.json and invite emails to invites.json instead of being
// emailed, so tests can read them.
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "../server/server.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(here, ".data")
const codesFile = path.join(dataDir, "codes.json")
const invitesFile = path.join(dataDir, "invites.json")
const port = Number(process.env.E2E_PORT ?? 8799)

rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })
writeFileSync(codesFile, "{}")
writeFileSync(invitesFile, "{}")

const mailer = async (email, code) => {
  const codes = existsSync(codesFile) ? JSON.parse(readFileSync(codesFile, "utf8")) : {}
  codes[email] = code
  writeFileSync(codesFile, JSON.stringify(codes))
}

// Invite emails: the latest link per address
const inviter = async (invite) => {
  const invites = JSON.parse(readFileSync(invitesFile, "utf8"))
  invites[invite.email] = invite
  writeFileSync(invitesFile, JSON.stringify(invites))
}

const server = createServer({ dataDir, staticDir: path.join(here, "..", "dist-e2e"), mailer, inviter })
server.listen(port, "127.0.0.1", () => console.log(`e2e server on http://127.0.0.1:${port}`))
