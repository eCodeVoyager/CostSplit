import { describe, expect, it } from "vitest"
import { autoIdentify, linkChanges, notJoined } from "./people"
import { invitePath } from "./nav"
import type { Member } from "./types"

const T = "trip-0000-0001"
const member = (id: string, over: Partial<Member> = {}): Member => ({
  id,
  tripId: T,
  name: id,
  createdAt: 1,
  updatedAt: 1,
  deleted: 0,
  dirty: 0,
  ...over,
})
const rafi = { id: "user-rafi", email: "Rafi@Mail.com" }

describe("autoIdentify", () => {
  const people = [member("alice", { userId: "user-alice" }), member("rafi-m", { email: "rafi@mail.com" }), member("karim")]

  it("asks when nothing tells who you are", () => {
    expect(autoIdentify(people, null, null)).toBeNull()
    expect(autoIdentify(people, { id: "user-new", email: "new@mail.com" }, null)).toBeNull()
  })

  it("uses the person this account joined as before (another phone)", () => {
    expect(autoIdentify(people, { id: "user-alice", email: "a@mail.com" }, "karim")).toEqual({ memberId: "alice", reason: "account" })
  })

  it("uses a personal invite link, even signed out", () => {
    expect(autoIdentify(people, null, "karim")).toEqual({ memberId: "karim", reason: "invite" })
    expect(autoIdentify(people, rafi, "karim")).toEqual({ memberId: "karim", reason: "invite" })
  })

  it("ignores an invite link for someone who already joined with another account", () => {
    expect(autoIdentify(people, rafi, "alice")).toEqual({ memberId: "rafi-m", reason: "email" })
    expect(autoIdentify(people, { id: "user-x", email: "x@mail.com" }, "alice")).toBeNull()
    expect(autoIdentify(people, { id: "user-x", email: "x@mail.com" }, "gone")).toBeNull()
  })

  it("matches an invited email, ignoring case", () => {
    expect(autoIdentify(people, rafi, null)).toEqual({ memberId: "rafi-m", reason: "email" })
    // Already taken by another account: no match
    const taken = [member("rafi-m", { email: "rafi@mail.com", userId: "user-other" })]
    expect(autoIdentify(taken, rafi, null)).toBeNull()
  })
})

describe("linkChanges", () => {
  const user = { id: "user-rafi", email: "rafi@mail.com", avatar: "photo-1" }

  it("ties me to the account with only the fields that differ", () => {
    expect(linkChanges([member("rafi-m", { email: "rafi@mail.com" })], "rafi-m", user)).toEqual([
      { id: "rafi-m", patch: { userId: "user-rafi", avatar: "photo-1" } },
    ])
    expect(linkChanges([member("rafi-m", { userId: "user-rafi", email: "rafi@mail.com", avatar: "photo-1" })], "rafi-m", user)).toEqual([])
  })

  it("follows a changed or removed photo", () => {
    const me = member("rafi-m", { userId: "user-rafi", email: "rafi@mail.com", avatar: "photo-1" })
    expect(linkChanges([me], "rafi-m", { ...user, avatar: undefined })).toEqual([{ id: "rafi-m", patch: { avatar: undefined } }])
  })

  it("leaves someone else's person alone unless picked by hand", () => {
    const other = member("rafi-m", { userId: "user-other" })
    expect(linkChanges([other], "rafi-m", user)).toEqual([])
    expect(linkChanges([other], "rafi-m", user, true)[0].patch.userId).toBe("user-rafi")
  })

  it("moves the tie when I pick a different person", () => {
    const old = member("old", { userId: "user-rafi", email: "rafi@mail.com", avatar: "photo-1" })
    const changes = linkChanges([old, member("new")], "new", user, true)
    expect(changes).toEqual([
      { id: "new", patch: { userId: "user-rafi", email: "rafi@mail.com", avatar: "photo-1" } },
      { id: "old", patch: { userId: undefined, avatar: undefined, email: undefined } },
    ])
  })
})

describe("invites", () => {
  it("lists people who can still get a personal invite", () => {
    const people = [member("me"), member("joined", { userId: "u" }), member("gone", { archived: 1 }), member("rafi")]
    expect(notJoined(people, "me").map((m) => m.id)).toEqual(["rafi"])
  })

  it("keeps the person when a personal link is pasted", () => {
    expect(invitePath("https://x.io/join/abcdefgh-1234?as=member-0001")).toBe("/join/abcdefgh-1234?as=member-0001")
    expect(invitePath("https://x.io/join/abcdefgh-1234")).toBe("/join/abcdefgh-1234")
    expect(invitePath("abcdefgh-1234")).toBe("/join/abcdefgh-1234")
    expect(invitePath("nope")).toBeNull()
  })
})
