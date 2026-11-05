import { describe, expect, it } from "vitest"
import { planUpdate, type NativeInfo } from "./updatePlan"

const bundle = { file: "bundle-2.3.1.zip", sha256: "a".repeat(64), minNative: "2.3.0" }
const app = (versionName: string, over: Partial<NativeInfo> = {}): NativeInfo => ({ versionName, live: "", pending: "", bad: "", ...over })

describe("planUpdate", () => {
  it("does nothing when up to date", () => {
    expect(planUpdate({ version: "2.3.0", bundle }, "2.3.0", app("2.3.0"))).toBe("latest")
    expect(planUpdate({ version: "2.2.0", bundle }, "2.3.0", app("2.3.0"))).toBe("latest")
  })

  it("updates live when the installed app's native part fits", () => {
    expect(planUpdate({ version: "2.3.1", bundle }, "2.3.0", app("2.3.0"))).toBe("live")
    // Already on a live update, the next one is live too
    expect(planUpdate({ version: "2.3.2", bundle: { ...bundle, file: "bundle-2.3.2.zip" } }, "2.3.1", app("2.3.0", { live: "2.3.1" }))).toBe("live")
  })

  it("needs a new APK when the native part changed or the app predates live updates", () => {
    expect(planUpdate({ version: "2.4.0", bundle: { ...bundle, minNative: "2.4.0" } }, "2.3.1", app("2.3.0"))).toBe("apk")
    // 2.2.0 has no live updates (info() doesn't exist there)
    expect(planUpdate({ version: "2.3.0", bundle: { ...bundle, minNative: "2.3.0" } }, "2.2.0", null)).toBe("apk")
    // An older server without bundles
    expect(planUpdate({ version: "2.3.1" }, "2.3.0", app("2.3.0"))).toBe("apk")
  })

  it("falls back to the APK when this live update failed to start before", () => {
    expect(planUpdate({ version: "2.3.1", bundle }, "2.3.0", app("2.3.0", { bad: "2.3.1" }))).toBe("apk")
    expect(planUpdate({ version: "2.3.2", bundle }, "2.3.0", app("2.3.0", { bad: "2.3.1" }))).toBe("live")
  })
})
