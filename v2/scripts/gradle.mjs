// Runs the Android Gradle wrapper with a JDK new enough for Capacitor 8 (21+).
// Uses JAVA_HOME when it qualifies, otherwise Android Studio's bundled JDK.
//   node scripts/gradle.mjs assembleDebug

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const win = process.platform === "win32"
const androidDir = path.join(import.meta.dirname, "..", "android")

function javaMajor(home) {
  const bin = path.join(home, "bin", win ? "java.exe" : "java")
  if (!existsSync(bin)) return 0
  const { stderr = "" } = spawnSync(bin, ["-version"], { encoding: "utf8" })
  const match = stderr.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return 0
  return match[1] === "1" ? Number(match[2]) : Number(match[1])
}

const candidates = [
  process.env.JAVA_HOME,
  "C:\\Program Files\\Android\\Android Studio\\jbr",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  "/opt/android-studio/jbr",
].filter(Boolean)

const javaHome = candidates.find((home) => javaMajor(home) >= 21)
if (!javaHome) {
  console.error("Need JDK 21+ for the Android build. Install Android Studio or set JAVA_HOME.")
  process.exit(1)
}

const wrapper = path.join(androidDir, win ? "gradlew.bat" : "gradlew")
const result = spawnSync(win ? `"${wrapper}"` : wrapper, process.argv.slice(2), {
  cwd: androidDir,
  stdio: "inherit",
  env: { ...process.env, JAVA_HOME: javaHome },
  // .bat files can only be started through a shell on Windows
  shell: win,
})
process.exit(result.status ?? 1)
