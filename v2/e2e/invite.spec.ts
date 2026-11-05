import { expect, test, type Page } from "@playwright/test"
import { createHome, email, invitedLink, signIn, syncNow } from "./helpers"

// 1x1 PNG: enough for the phone-side crop and JPEG re-encode
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")

/** Opening an invite opens the sign-in sheet by itself; the button is there if it was closed */
async function signInFromInvite(page: Page, address: string) {
  await expect(page.locator("#signin-email").or(page.getByRole("button", { name: "Sign in with email" }))).toBeVisible()
  if (!(await page.locator("#signin-email").isVisible())) await page.getByRole("button", { name: "Sign in with email" }).click()
  await signIn(page, address)
}

/**
 * Profiles and invites that know who you are: a profile name and photo, a
 * personal link that joins as the right person, and an email invite that
 * matches by address even through the general link. Nobody sees "Who are you?".
 */
test("personal invites join as the right person, with profile photos", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const carol = await (await browser.newContext()).newPage()

  const tripId = await createHome(alice, "Alice", ["Bob", "Carol"], "Invite Flat")
  await alice.getByRole("button", { name: /Sync status: Sign in to sync/ }).click()
  await signIn(alice, email("alice"))
  await expect(alice.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible()

  // Alice's profile: a name and a photo
  await alice.goto("/profile")
  await alice.locator("#profile-name").fill("Alice Ahmed")
  await alice.locator("#profile-name").press("Enter")
  await expect(alice.getByText("Name saved")).toBeVisible()
  await alice.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG })
  await expect(alice.getByText("Photo updated")).toBeVisible()
  await expect(alice.getByRole("button", { name: "Change profile photo" }).locator("img")).toBeVisible()
  await expect(alice.getByText("Made with")).toBeVisible()

  // Her photo goes onto her person in the group
  await alice.goto(`/t/${tripId}/settings`)
  await syncNow(alice)
  await alice.goto(`/t/${tripId}/settings`)
  await expect(alice.getByRole("listitem").filter({ hasText: "Alice" }).locator("img")).toBeVisible()

  // A personal link for Bob
  await alice.getByRole("button", { name: "Invite Bob" }).click()
  const dialog = alice.getByRole("dialog", { name: "Invite Bob" })
  const bobLink = (await dialog.getByTestId("invite-link").textContent())!.trim()
  expect(bobLink).toMatch(new RegExp(`/join/${tripId}\\?as=`))
  await alice.keyboard.press("Escape")

  // Bob opens it, signs in, and is Bob straight away
  await bob.goto(new URL(bobLink).pathname + new URL(bobLink).search)
  await signInFromInvite(bob, email("bob"))
  await expect(bob.getByText("You're Bob here")).toBeVisible()
  await expect(bob.getByRole("heading", { name: "Invite Flat" })).toBeVisible()
  await expect(bob.getByRole("heading", { name: "Who are you?" })).toHaveCount(0)
  // ...and sees Alice's photo
  await bob.goto(`/t/${tripId}/settings`)
  await expect(bob.getByRole("listitem").filter({ hasText: "Alice" }).locator("img")).toBeVisible()
  await expect(bob.getByRole("listitem").filter({ hasText: "Bob" })).toContainText("You")

  // Carol gets an email invite; she uses the general link but signs in with that address
  const carolEmail = email("carol")
  await alice.getByRole("button", { name: "Invite Carol" }).click()
  await alice.locator("#invite-email").fill(carolEmail)
  await alice.getByRole("button", { name: "Email the invite to Carol" }).click()
  await expect(alice.getByText(`Invite sent to ${carolEmail}`)).toBeVisible()
  expect(await invitedLink(carolEmail)).toContain(`/join/${tripId}?as=`)

  await carol.goto(`/join/${tripId}`)
  await signInFromInvite(carol, carolEmail)
  await expect(carol.getByText("You're Carol here")).toBeVisible()
  await expect(carol.getByRole("heading", { name: "Who are you?" })).toHaveCount(0)

  // Alice sees both joined, with their emails
  await alice.keyboard.press("Escape")
  await syncNow(alice)
  await alice.goto(`/t/${tripId}/settings`)
  await expect(alice.getByRole("listitem").filter({ hasText: "Carol" })).toContainText(carolEmail)
  await expect(alice.getByRole("button", { name: "Invite Bob" })).toHaveCount(0)
  await expect(alice.getByRole("button", { name: "Invite Carol" })).toHaveCount(0)
})
