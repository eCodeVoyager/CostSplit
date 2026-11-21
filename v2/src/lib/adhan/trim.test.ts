import { describe, expect, it } from "vitest"
import { encodeWav, normalize, trimSilence } from "./trim"

const RATE = 8000
/** Seconds of silence (0) or a tone (amplitude) */
function signal(parts: [seconds: number, amp: number][]) {
  const total = parts.reduce((n, [s]) => n + s * RATE, 0)
  const out = new Float32Array(total)
  let at = 0
  for (const [s, amp] of parts) {
    for (let i = 0; i < s * RATE; i++) out[at + i] = amp * Math.sin((2 * Math.PI * 440 * i) / RATE)
    at += s * RATE
  }
  return out
}

describe("trimming your own azan file", () => {
  it("cuts silence before and after, keeps a short lead-in and the reverb tail", () => {
    const { samples, cut } = trimSilence(signal([[3, 0], [10, 0.5], [5, 0]]), RATE)
    const seconds = samples.length / RATE
    expect(seconds).toBeGreaterThan(10.8)
    expect(seconds).toBeLessThan(11.1)
    expect(cut).toBeGreaterThan(6.9)
  })

  it("keeps the pauses between phrases, shortens long gaps", () => {
    const phrases = trimSilence(signal([[4, 0.5], [2, 0], [4, 0.5]]), RATE)
    expect(phrases.samples.length / RATE).toBe(10) // the 2 s pause stays, nothing cut
    expect(phrases.cut).toBe(0)
    const gap = trimSilence(signal([[4, 0.5], [9, 0], [4, 0.5]]), RATE)
    const s = gap.samples.length / RATE
    expect(s).toBeGreaterThan(9.4) // 4 + 1.5 + 4 (+ tail)
    expect(s).toBeLessThan(10.5)
  })

  it("quiet room noise counts as silence, the voice doesn't", () => {
    const { cut } = trimSilence(signal([[2, 0.004], [6, 0.6], [2, 0.004]]), RATE)
    expect(cut).toBeGreaterThan(2.5)
  })

  it("leaves pure silence alone", () => {
    const silent = new Float32Array(RATE)
    expect(trimSilence(silent, RATE)).toEqual({ samples: silent, cut: 0 })
  })

  it("raises quiet files (at most 4x) and never clips", () => {
    const quiet = signal([[1, 0.1]])
    normalize(quiet)
    expect(Math.max(...quiet.map(Math.abs))).toBeCloseTo(0.4, 2)
    const loud = signal([[1, 0.5]])
    normalize(loud)
    expect(Math.max(...loud.map(Math.abs))).toBeLessThanOrEqual(0.951)
  })

  it("writes a valid 16-bit mono WAV", async () => {
    const wav = encodeWav(signal([[1, 0.5]]), RATE)
    const v = new DataView(await wav.arrayBuffer())
    const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(at + i)))
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"])
    expect(v.getUint32(24, true)).toBe(RATE)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(RATE * 2)
    expect(wav.size).toBe(44 + RATE * 2)
  })
})
