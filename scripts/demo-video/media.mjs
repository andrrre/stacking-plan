// The demo video's sound and encoding: narration clips from the macOS `say` voice, and the ffmpeg call that turns
// the captured frames and those clips into one MP4.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const FPS = 30

/** Reads every line with Kokoro (kokoro_tts.py), run by the Python in `kokoroDir/venv`. */
function sayWithKokoro(lines, voice, kokoroDir) {
  const script = path.join(import.meta.dirname, 'kokoro_tts.py')
  execFileSync(path.join(kokoroDir, 'venv/bin/python'), [script, kokoroDir, voice, JSON.stringify(lines)], { stdio: 'inherit' })
}

/**
 * Reads each beat's line into a sound file: with Kokoro when `kokoroDir` is given, otherwise with the macOS `say`
 * voice. Returns `{ [beat id]: { file, seconds } }`.
 */
export function narrate(beats, dir, voice, kokoroDir) {
  const lines = beats.map((beat) => ({ id: beat.id, text: beat.say, file: path.join(dir, `${beat.id}.${kokoroDir ? 'wav' : 'aiff'}`) }))
  if (kokoroDir) sayWithKokoro(lines, voice, kokoroDir)
  else lines.forEach((line) => execFileSync('say', ['-v', voice, '-o', line.file, line.text]))
  return Object.fromEntries(lines.map(({ id, file }) => {
    const info = execFileSync('afinfo', [file], { encoding: 'utf8' })
    const seconds = Number(/estimated duration: ([\d.]+) sec/.exec(info)?.[1])
    if (!Number.isFinite(seconds)) throw new Error(`Could not read the length of ${file}`)
    return [id, { file, seconds }]
  }))
}

/** The ffmpeg concat list: every frame with how long it stays on screen. The first frame is shown from 0. */
function writeFrameList(frames, endSeconds, file) {
  const lines = frames.flatMap((frame, i) => {
    const from = i === 0 ? 0 : frame.at
    const until = frames[i + 1]?.at ?? endSeconds
    return [`file '${frame.file}'`, `duration ${Math.max(until - from, 0.001).toFixed(4)}`]
  })
  const last = frames.at(-1)
  writeFileSync(file, ['ffconcat version 1.0', ...lines, `file '${last.file}'`, ''].join('\n'))
}

/** Places each narration clip at its beat's start time and mixes them into one track. */
function audioFilter(marks) {
  const delayed = marks.map((m, i) => `[${i + 1}:a]adelay=${Math.round(m.start * 1000)}:all=1[a${i}]`)
  const inputs = marks.map((_, i) => `[a${i}]`).join('')
  return [...delayed, `${inputs}amix=inputs=${marks.length}:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000[a]`].join(';')
}

/**
 * Encodes `frames` (`{ file, at }`, seconds from the start) and the narration into `output`.
 * `marks` is `{ file, start }` per clip. `size` is the output `{ width, height }`.
 */
export function encode({ ffmpeg, frames, endSeconds, marks, size, workDir, output }) {
  if (frames.length === 0) throw new Error('No frames were captured')
  const list = path.join(workDir, 'frames.txt')
  writeFrameList(frames, endSeconds, list)
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    ...marks.flatMap((m) => ['-i', m.file]),
    '-filter_complex', audioFilter(marks),
    '-map', '0:v', '-map', '[a]',
    '-vf', `scale=${size.width}:${size.height}:flags=lanczos`,
    '-fps_mode', 'cfr', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
    '-movflags', '+faststart',
    output,
  ]
  execFileSync(ffmpeg, args, { stdio: 'inherit' })
}
