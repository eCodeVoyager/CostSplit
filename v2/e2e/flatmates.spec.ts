import { expect, test } from "@playwright/test"
import { createHome, email, openAdd, review, signIn, syncNow } from "./helpers"

/**
 * Two phones, one home, through the real sync server: invite and join, an
 * uneven split that fills itself in, the confirm step, a duplicate warning,
 * the updates bell, private personal expenses, "I'll buy" on the to-buy list,
 * and settling up so both phones agree.
 */
test("flatmates share a home end to end", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  // Alice sets up the home and signs in so it syncs
  const tripId = await createHome(alice, "Alice", ["Bob", "Carol"], "E2E Flat")
  await alice.getByRole("button", { name: /Sync status: Sign in to sync/ }).click()
  await signIn(alice, email("alice"))
  await expect(alice.getByRole("button", { name: /Sync status: Synced/ })).toBeVisible()

  // Bob opens the invite link, signs in and says who he is
  await bob.goto(`/join/${tripId}`)
  // The invite opens the sign-in sheet by itself; the button is there if it was closed
  await expect(bob.locator("#signin-email").or(bob.getByRole("button", { name: "Sign in with email" }))).toBeVisible()
  if (!(await bob.locator("#signin-email").isVisible())) await bob.getByRole("button", { name: "Sign in with email" }).click()
  await signIn(bob, email("bob"))
  await expect(bob.getByRole("heading", { name: "Who are you?" })).toBeVisible()
  await bob.getByRole("dialog").getByRole("button", { name: "Bob", exact: true }).click()
  await expect(bob.getByRole("heading", { name: "E2E Flat" })).toBeVisible()

  // Alice: ৳900 dinner, split by amounts. Bob had less: type ৳200, the rest fills in for Alice and Carol
  await openAdd(alice, /^Expense Someone paid/)
  await alice.locator("#amount").fill("900")
  await alice.locator("#title").fill("Dinner")
  await alice.getByRole("radio", { name: "Amounts" }).click()
  await alice.getByLabel(/^Bob owes/).fill("200")
  await expect(alice.getByLabel("Alice owes, filled in: 350")).toBeVisible()
  await expect(alice.getByLabel("Carol owes, filled in: 350")).toBeVisible()
  await alice.getByRole("button", { name: "Add ৳900.00" }).click()

  // Check before saving: every share and who owes whom, then confirm
  const confirm = review(alice, "Add this expense?")
  await expect(confirm).toContainText("Exact amounts")
  await expect(confirm.getByText("Who owes whom", { exact: false })).toBeVisible()
  await expect(confirm).toContainText("You get back ৳550.00")
  await confirm.getByRole("button", { name: "Add ৳900.00" }).click()
  await expect(confirm).toBeHidden()

  // Same dinner again: the confirm step says it looks like a repeat
  await openAdd(alice, /^Expense Someone paid/)
  await alice.locator("#amount").fill("900")
  await alice.locator("#title").fill("Dinner")
  await alice.getByRole("button", { name: "Add ৳900.00" }).click()
  await expect(review(alice, "Add this expense?")).toContainText("Looks like a repeat")
  await review(alice, "Add this expense?").getByRole("button", { name: "Edit" }).click()
  await expect(review(alice, "Add this expense?")).toBeHidden()
  // Phone back button: closes the sheet, nothing is added
  await alice.goBack()
  await expect(alice.getByRole("dialog", { name: "New expense" })).toBeHidden()

  // Alice's own lunch goes to Personal: private, never in the group
  await alice.getByRole("link", { name: "Personal" }).click()
  await alice.getByRole("button", { name: "Add personal expense" }).last().click()
  await alice.locator("#personal-amount").fill("150")
  await alice.locator("#personal-title").fill("My secret lunch")
  await alice.getByRole("button", { name: /Add ৳150.00 to Personal/ }).click()
  await review(alice, "Add to Personal?").getByRole("button", { name: /^Add/ }).click()
  await expect(alice.getByRole("button", { name: /^My secret lunch Food/ })).toBeVisible()
  // My total = ৳350 share of the dinner + ৳150 personal
  await expect(alice.getByText("৳500.00").first()).toBeVisible()

  // Something urgent on the to-buy list
  await alice.goto(`/t/${tripId}/list`)
  await alice.getByLabel("Add items").fill("Gas cylinder")
  await alice.getByRole("button", { name: "Urgent" }).click()
  await alice.getByRole("button", { name: "Add to list" }).click()
  await expect(alice.getByRole("checkbox", { name: /Gas cylinder Urgent/i })).toBeVisible()
  await syncNow(alice)

  // Bob's phone: the dinner, his balance, and the bell telling him what Alice did
  await syncNow(bob)
  await expect(bob.getByRole("link", { name: /You owe ৳200.00/ })).toBeVisible()
  await bob.getByRole("button", { name: /^Updates, \d+ new/ }).click()
  const updates = bob.getByRole("dialog", { name: "Updates" })
  await expect(updates).toContainText("Alice added Dinner · ৳900.00")
  await expect(updates).toContainText("Alice needs Gas cylinder urgently")
  await bob.keyboard.press("Escape")
  await expect(bob.getByRole("button", { name: /^Updates$/ })).toBeVisible()

  // Alice's personal lunch never reaches Bob
  await bob.getByRole("link", { name: "Personal" }).click()
  await expect(bob.getByText("Track your own spending too")).toBeVisible()
  await expect(bob.getByText("My secret lunch")).toHaveCount(0)

  // Bob takes the gas cylinder, so nobody else buys it
  await bob.goto(`/t/${tripId}/list`)
  await bob.getByRole("button", { name: "I'll buy" }).click()
  await expect(bob.getByText("You're buying it")).toBeVisible()

  // Bob pays Alice back what he owes
  await bob.getByRole("link", { name: "Balances" }).click()
  await bob.getByRole("listitem").filter({ hasText: /You.*Alice/ }).getByRole("button", { name: "Mark paid" }).click()
  await bob.getByRole("button", { name: "Record ৳200.00" }).click()
  const pay = review(bob, "Record this payment?")
  await expect(pay).toContainText("settled up")
  await pay.getByRole("button", { name: "Record ৳200.00" }).click()
  await expect(bob.getByRole("button", { name: /Your balance settled up/ })).toBeVisible()
  await syncNow(bob)

  // Alice's phone agrees: only Carol still owes, Bob is buying the gas, and adding it again is blocked
  await syncNow(alice)
  await expect(alice.getByText("Bob will buy it")).toBeVisible()
  await alice.getByLabel("Add items").fill("gas cylinder")
  await alice.getByRole("button", { name: "Add to list" }).click()
  await expect(alice.getByText(/Already on the list: Gas cylinder \(Bob will buy it\)/)).toBeVisible()
  await alice.getByRole("link", { name: "Balances" }).click()
  await expect(alice.getByRole("button", { name: /Your balance you get back ৳350.00/ })).toBeVisible()
  // The payment is in the list, and Alice was told the moment it synced in
  await expect(alice.getByRole("button", { name: /^Bob paid You/ })).toBeVisible()
  await expect(alice.getByText("Bob paid you ৳200.00")).toBeVisible()
})
