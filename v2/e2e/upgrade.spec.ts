import { expect, test } from "@playwright/test"

/**
 * Someone who has used 2.0.x for months opens 2.1: the local database is
 * upgraded in place (schema v3 -> v4), nothing is lost, and "What's new"
 * tells them about the changes once.
 */
test("existing 2.0 data survives the upgrade and sees What's new", async ({ page }) => {
  const trip = "aaaaaaaa-0000-4000-8000-000000000001"
  // Any page of the same origin that isn't the app: the download page
  await page.goto("/download/")
  await page.evaluate(async (tripId) => {
    const row = { tripId, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, deleted: 0, dirty: 0 }
    // Exactly what 2.0.x created: Dexie schema version 3 (IndexedDB version 30)
    const req = indexedDB.open("costsplit-v2", 30)
    req.onupgradeneeded = () => {
      const idb = req.result
      const child = (name: string, extra = "dirty") => {
        const store = idb.createObjectStore(name, { keyPath: "id" })
        store.createIndex("tripId", "tripId")
        store.createIndex(`[tripId+${extra}]`, ["tripId", extra])
      }
      idb.createObjectStore("trips", { keyPath: "id" })
      ;["members", "expenses", "payments", "bills", "meals", "items"].forEach((n) => child(n))
      child("files", "uploaded")
      idb.createObjectStore("kv", { keyPath: "key" })
    }
    const idb: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = idb.transaction(["trips", "members", "expenses", "payments", "items", "kv"], "readwrite")
    tx.objectStore("trips").put({ ...row, id: tripId, name: "Old Flat", emoji: "🏠", kind: "home", currency: "BDT", rates: {} })
    for (const [id, name] of [["m-ana", "Ana"], ["m-ben", "Ben"], ["m-cy", "Cy"]]) tx.objectStore("members").put({ ...row, id, name })
    tx.objectStore("expenses").put({
      ...row,
      id: "e-rent",
      title: "Rent October",
      category: "rent",
      amount: 3_000_000,
      currency: "BDT",
      rate: 1,
      date: "2026-10-05",
      paidBy: { "m-ana": 3_000_000 },
      splitMode: "equal",
      split: { "m-ana": 1, "m-ben": 1, "m-cy": 1 },
    })
    tx.objectStore("payments").put({ ...row, id: "p-ben", from: "m-ben", to: "m-ana", amount: 500_000, date: "2026-10-06" })
    tx.objectStore("items").put({ ...row, id: "i-rice", name: "Rice", done: 0 })
    tx.objectStore("kv").put({ key: `me:${tripId}`, value: "m-ana" })
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    idb.close()
    localStorage.setItem("costsplit:lastTrip", tripId)
  }, trip)

  // Open the new app: it upgrades the database and lands on the last group
  await page.goto("/")
  await expect(page).toHaveURL(new RegExp(`/t/${trip}`))

  // Told once what's new, then never again
  const whatsNew = page.getByRole("dialog", { name: /What's new in CostSplit/ })
  await expect(whatsNew).toBeVisible()
  await expect(whatsNew).toContainText("Personal tab")
  await whatsNew.getByRole("button", { name: "Got it" }).click()
  await expect(whatsNew).toBeHidden()

  // Same money as before: Ana paid ৳30,000 rent for 3, Ben paid back ৳5,000
  await expect(page.getByRole("link", { name: /You get ৳15,000.00/ })).toBeVisible()
  await page.getByRole("link", { name: "Activity" }).click()
  await expect(page.getByRole("button", { name: /^Rent October/ })).toBeVisible()
  await page.getByRole("button", { name: /^Rent October/ }).click()
  await expect(page.getByRole("dialog")).toContainText("Added")
  await page.keyboard.press("Escape")
  await page.goto(`/t/${trip}/list`)
  await expect(page.getByRole("checkbox", { name: /^Rice/ })).toBeVisible()

  // New tables work on upgraded data
  await page.getByRole("link", { name: "Personal" }).click()
  await page.getByRole("button", { name: "Add personal expense" }).last().click()
  await page.locator("#personal-amount").fill("80")
  await page.getByRole("button", { name: /Add ৳80.00 to Personal/ }).click()
  await page.getByRole("dialog", { name: "Add to Personal?" }).getByRole("button", { name: /^Add/ }).click()
  await expect(page.getByText("৳80.00").first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole("dialog", { name: /What's new/ })).toHaveCount(0)
})
