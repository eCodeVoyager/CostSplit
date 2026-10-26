import { expect, it } from "vitest"
import { compareVersions } from "./version"

it("compares app versions numerically", () => {
  expect(compareVersions("2.1.0", "2.0.9")).toBe(1)
  expect(compareVersions("2.0.10", "2.0.9")).toBe(1)
  expect(compareVersions("2.0", "2.0.0")).toBe(0)
  expect(compareVersions("1.9.9", "2.0.0")).toBe(-1)
})
