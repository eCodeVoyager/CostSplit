// Your own azan file, cleaned up before it's saved on the phone: silence at
// the start and end cut off, long gaps (an intro, a pause in a video) shortened,
// and the volume raised so it's as loud as the built-in ones. Runs in the app
// (Web Audio decodes MP3/M4A/OGG/Opus), so nothing changes on the native side:
// the result is a plain WAV the phone plays like any other file.

/** Sample rate of the saved file: clear for a voice, and small enough to pass to the phone */
export const RATE = 22050
const WINDOW_S = 0.05
/** Quieter than this (relative to the loudest part) counts as silence */
const SILENCE_DB = -35
/** Pauses inside the azan stay; only gaps longer than this are shortened... */
const LONG_GAP_S = 4
/** ...to this */
const KEEP_GAP_S = 1.5
const LEAD_S = 0.15
/** Reverb after the last word is part of the azan */
const TAIL_S = 0.8
const MAX_S = 8 * 60

export interface TrimResult {
  samples: Float32Array
  /** How much was cut, in seconds */
  cut: number
}

/** Cuts silence from mono samples (pure, for tests) */
export function trimSilence(mono: Float32Array, rate: number): TrimResult {
  const win = Math.max(1, Math.round(rate * WINDOW_S))
  const levels: number[] = []
  for (let i = 0; i < mono.length; i += win) {
    const end = Math.min(mono.length, i + win)
    let sum = 0
    for (let j = i; j < end; j++) sum += mono[j] * mono[j]
    levels.push(Math.sqrt(sum / (end - i)))
  }
  let peak = 0
  for (const l of levels) if (l > peak) peak = l
  if (peak === 0) return { samples: mono, cut: 0 }
  const threshold = Math.max(peak * 10 ** (SILENCE_DB / 20), 0.002)
  const loud = levels.map((l) => l > threshold)
  const first = loud.indexOf(true)
  const last = loud.lastIndexOf(true)
  if (first < 0) return { samples: mono, cut: 0 }

  // Spans to keep: from the first sound to the last, minus the long gaps
  const spans: [number, number][] = []
  let spanStart = Math.max(0, first * win - Math.round(LEAD_S * rate))
  let quietSince = -1
  const longGap = Math.round(LONG_GAP_S / WINDOW_S)
  const half = Math.round((rate * KEEP_GAP_S) / 2)
  for (let w = first; w <= last; w++) {
    if (!loud[w]) {
      if (quietSince < 0) quietSince = w
      continue
    }
    if (quietSince >= 0 && w - quietSince > longGap) {
      // End this span half the kept gap into the silence, start the next half a gap before the sound
      spans.push([spanStart, quietSince * win + half])
      spanStart = Math.max(0, w * win - half)
    }
    quietSince = -1
  }
  spans.push([spanStart, Math.min(mono.length, (last + 1) * win + Math.round(TAIL_S * rate))])

  const maxLen = MAX_S * rate
  const total = Math.min(maxLen, spans.reduce((n, [a, b]) => n + (b - a), 0))
  const out = new Float32Array(total)
  let at = 0
  for (const [a, b] of spans) {
    const part = mono.subarray(a, Math.min(b, a + (total - at)))
    out.set(part, at)
    at += part.length
    if (at >= total) break
  }
  return { samples: out, cut: (mono.length - out.length) / rate }
}

/** Louder, up to 4x, so the peak sits just under full scale (quiet files stay quiet only if very noisy) */
export function normalize(samples: Float32Array) {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i])
    if (v > peak) peak = v
  }
  if (peak === 0) return samples
  const gain = Math.min(4, 0.95 / peak)
  if (gain <= 1.01) return samples
  for (let i = 0; i < samples.length; i++) samples[i] *= gain
  return samples
}

/** 16-bit mono PCM WAV */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const data = samples.length * 2
  const buf = new ArrayBuffer(44 + data)
  const v = new DataView(buf)
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)))
  text(0, "RIFF")
  v.setUint32(4, 36 + data, true)
  text(8, "WAVE")
  text(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, "data")
  v.setUint32(40, data, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: "audio/wav" })
}

/**
 * Decodes the file, cuts silence, raises the volume, returns a WAV. null when
 * this phone can't decode it (then the file is saved as it is).
 */
export async function prepareAzanFile(file: File): Promise<{ file: File; seconds: number; cut: number } | null> {
  let decoded: AudioBuffer
  try {
    // Decoding into a 22 kHz context resamples on the way in
    decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await file.arrayBuffer())
  } catch {
    return null
  }
  const mono = new Float32Array(decoded.length)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c)
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / decoded.numberOfChannels
  }
  const { samples, cut } = trimSilence(mono, decoded.sampleRate)
  normalize(samples)
  const wav = encodeWav(samples, decoded.sampleRate)
  return { file: new File([wav], "azan.wav", { type: "audio/wav" }), seconds: samples.length / decoded.sampleRate, cut }
}
