import { writeFileSync } from 'node:fs'
import { anglesFromPoint, muzzleOf, powerFromSpeed } from '../src/game/ballistics'
import { LEVELS } from '../src/game/levels'
import { Simulation } from '../src/game/sim'
import { TUNING } from '../src/game/tuning'
import type { LevelDef, Shot } from '../src/game/types'

interface Target {
  x: number
  y: number
  required: boolean
}

interface Result {
  remaining: number
  coins: number
  lives: number
  targets: Target[]
}

const speeds = [8.2, 10.6, 12.6, 14.4]
const cache = new Map<string, Result>()

function keyOf(shots: Shot[]): string {
  return shots.map((shot) => `${shot.angle.toFixed(3)},${shot.power.toFixed(2)}`).join('|')
}

function play(level: LevelDef, shots: Shot[]): Result {
  const key = `${level.id}:${keyOf(shots)}`
  const cached = cache.get(key)
  if (cached) return cached
  const sim = new Simulation(level)
  sim.settle()
  for (const shot of shots) {
    if (sim.remainingRequired() === 0 || sim.lives <= 0) break
    sim.fire(shot.angle, shot.power)
    sim.runUntilCalm()
  }
  const targets: Target[] = []
  for (const actor of sim.actors) {
    if (!actor.breakable || actor.broken) continue
    targets.push({
      x: actor.body.position.x,
      y: actor.body.position.y,
      required: actor.required,
    })
  }
  const result = { remaining: sim.remainingRequired(), coins: sim.coins, lives: sim.lives, targets }
  cache.set(key, result)
  return result
}

function refine(cannon: { x: number; y: number }, x: number, y: number, speed: number, seed: number): number | null {
  let angle = seed
  for (let i = 0; i < 4; i++) {
    const muzzle = muzzleOf(cannon, angle)
    const options = anglesFromPoint(muzzle.x, muzzle.y, x, y, speed)
    if (options.length === 0) return null
    options.sort((a, b) => Math.abs(a - angle) - Math.abs(b - angle))
    angle = options[0]
  }
  if (angle < TUNING.minAngle || angle > TUNING.maxAngle) return null
  return angle
}

function candidates(cannon: { x: number; y: number }, targets: Target[], offsets: number[]): Shot[] {
  const shots: { shot: Shot; rank: number }[] = []
  for (const target of targets) {
    for (const offset of offsets) {
      for (const speed of speeds) {
        const seeds = anglesFromPoint(cannon.x, cannon.y, target.x + offset, target.y, speed)
        for (const seed of seeds) {
          const angle = refine(cannon, target.x + offset, target.y, speed, seed)
          if (angle === null) continue
          shots.push({
            shot: { angle, power: powerFromSpeed(speed) },
            rank: target.required ? 0 : 1,
          })
        }
      }
    }
  }
  for (let deg = 40; deg <= 140; deg += 14) {
    for (const power of [0.48, 0.72, 0.96]) {
      shots.push({ shot: { angle: (deg * Math.PI) / 180, power }, rank: 2 })
    }
  }
  shots.sort((a, b) => a.rank - b.rank || a.shot.angle - b.shot.angle)
  const unique: Shot[] = []
  for (const entry of shots) {
    const close = unique.some(
      (shot) => Math.abs(shot.angle - entry.shot.angle) < 0.045 && Math.abs(shot.power - entry.shot.power) < 0.05,
    )
    if (!close) unique.push(entry.shot)
    if (unique.length >= 36) break
  }
  return unique
}

function solve(level: LevelDef, offsets: number[]): Shot[] | null {
  let beam: Shot[][] = [[]]
  for (let depth = 0; depth < TUNING.lives; depth++) {
    const next: { shots: Shot[]; result: Result }[] = []
    for (const shots of beam) {
      const state = play(level, shots)
      if (state.remaining === 0) return shots
      if (state.lives <= 0) continue
      for (const shot of candidates(level.cannon, state.targets, offsets)) {
        const sequence = [...shots, shot]
        next.push({ shots: sequence, result: play(level, sequence) })
      }
    }
    next.sort((a, b) => a.result.remaining - b.result.remaining || b.result.lives - a.result.lives || b.result.coins - a.result.coins)
    const picked: { shots: Shot[]; result: Result }[] = []
    const seen = new Set<string>()
    const seenCounts = new Set<number>()
    const take = (entry: { shots: Shot[]; result: Result }) => {
      const stamp = `${entry.result.remaining}:${entry.result.targets
        .map((target) => `${target.x.toFixed(1)},${target.y.toFixed(1)}`)
        .sort()
        .join(';')}`
      if (seen.has(stamp)) return
      seen.add(stamp)
      picked.push(entry)
    }
    for (const entry of next) {
      if (seenCounts.has(entry.result.remaining)) continue
      seenCounts.add(entry.result.remaining)
      take(entry)
      if (entry.result.remaining === 0) return entry.shots
    }
    for (const entry of next) {
      if (picked.length >= 6) break
      take(entry)
      if (entry.result.remaining === 0) return entry.shots
    }
    beam = picked.map((entry) => entry.shots)
    const best = beam[0] ? play(level, beam[0]) : null
    console.log(
      `  depth ${depth + 1}: best remaining ${best?.remaining ?? '?'} lives ${best?.lives ?? '?'} (${cache.size} sims)`,
    )
    if (best?.remaining === 0) return beam[0]
  }
  return null
}

const levels: Record<string, Shot[]> = {}
let failed = false
for (const level of LEVELS) {
  console.log(`Solving ${level.id} ${level.name}`)
  cache.clear()
  const started = Date.now()
  let shots = solve(level, [0])
  if (!shots) {
    console.log('  retrying with aim offsets')
    cache.clear()
    shots = solve(level, [0, -0.16, 0.16])
  }
  if (!shots) {
    failed = true
    console.error(`  no clear for ${level.name}`)
    continue
  }
  const check = play(level, shots)
  console.log(
    `  cleared in ${shots.length} shots, ${check.lives} lives, ${check.coins} coins, ${(Date.now() - started) / 1000}s`,
  )
  console.log(`  ${shots.map((shot) => `${((shot.angle * 180) / Math.PI).toFixed(1)}°/${shot.power.toFixed(2)}`).join('  ')}`)
  levels[String(level.id)] = shots.map((shot) => ({
    angle: Number(shot.angle.toFixed(4)),
    power: Number(shot.power.toFixed(3)),
  }))
}

if (failed) process.exit(1)

writeFileSync(
  new URL('./solutions.json', import.meta.url),
  JSON.stringify({ note: 'Generated by npm run solve. Replay with npm test after physics changes.', levels }, null, 2) + '\n',
)
console.log('Wrote scripts/solutions.json')
