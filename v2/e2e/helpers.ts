import { expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

const codesFile = path.join(import.meta.dirname, ".data", "codes.json")
const invitesFile = path.join(import.meta.dirname, ".data", "invites.json")

/** The link in the invite email the test server "sent" to this address */
export async function invitedLink(address: string) {
  let link: string | undefined
  await expect
    .poll(() => {
      link = JSON.parse(readFileSync(invitesFile, "utf8"))[address.toLowerCase()]?.link
      return link
    })
    .toBeTruthy()
  return link!
}

/** A fresh address per run, so the server's resend throttle never gets in the way */
export const email = (name: string) => `${name}.${Date.now()}@example.com`

async function codeFor(address: string) {
  let code: string | undefined
  await expect
    .poll(() => {
      code = JSON.parse(readFileSync(codesFile, "utf8"))[address.toLowerCase()]
      return code
    })
    .toBeTruthy()
  return code!
}

/** With the sign-in sheet open: email, code from the test mailer, sign in */
export async function signIn(page: Page, address: string) {
  await page.locator("#signin-email").fill(address)
  await page.getByRole("button", { name: "Email me a code" }).click()
  // Six digits sign in by themselves
  await page.locator("#signin-code").fill(await codeFor(address))
  await expect(page.locator("#signin-code")).toBeHidden()
}

export async function createHome(page: Page, me: string, others: string[], name: string) {
  await page.goto("/new")
  await page.locator("#me").fill(me)
  for (const other of others) {
    await page.locator("#friend").fill(other)
    await page.getByRole("button", { name: "Add person" }).click()
  }
  await page.locator("#trip-name").fill(name)
  await page.locator("#currency").selectOption("BDT")
  await page.getByRole("button", { name: "Create home" }).click()
  await expect(page).toHaveURL(/\/t\/[\w-]+$/)
  return page.url().split("/t/")[1]
}

/** Pull what others changed: reopening the app syncs straight away */
export async function syncNow(page: Page) {
  await page.reload()
  await expect(page.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible()
}

export async function openAdd(page: Page, tile: RegExp) {
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("button", { name: tile }).click()
}

/** The "Check before saving" dialog */
export const review = (page: Page, title: string | RegExp) => page.getByRole("dialog", { name: title })
