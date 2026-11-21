import { readFileSync, existsSync } from 'node:fs'
import { anglesFromPoint } from '../src/game/ballistics'
import { LEVELS } from '../src/game/levels'
import { coinsToBank } from '../src/game/storage'
import { Simulation } from '../src/game/sim'
import { TUNING } from '../src/game/tuning'
import type { LevelDef, Shot } from '../src/game/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function checkCoins(): void {
  assert(coinsToBank(false, 33, 15) === 48, 'a first clear banks smash coins plus the life bonus')
  assert(coinsToBank(true, 33, 15) === 0, 'a replay does not add coins')
  assert(coinsToBank(true, 10, 0) === 0, 'a failed replay does not add coins')
  assert(coinsToBank(false, 10, 0) === 10, 'a first failed attempt keeps the smashed coins')
}

function checkBallistics(): void {
  const angles = anglesFromPoint(0, 0, 10, 0, 20, 10).sort((a, b) => a - b)
  const s = Math.asin(0.25)
  const expected = [s / 2, (Math.PI - s) / 2]
  assert(angles.length === 2, `expected two loft angles, got ${angles.join(', ')}`)
  for (let i = 0; i < 2; i++) {
    const delta = Math.abs(angles[i] - expected[i])
    assert(delta < 0.02, `angle ${angles[i]} != ${expected[i]}`)
  }
}

function variety(): void {
  assert(LEVELS.length >= 5, 'need at least 5 levels')
  assert(TUNING.lives === 5, 'a level gives 5 lives')
  const kinds = new Set(LEVELS.flatMap((level) => level.objects.map((object) => object.kind)))
  for (const kind of ['jar', 'pot', 'vase', 'bottle', 'stone', 'crate']) {
    assert(kinds.has(kind), `missing ${kind}`)
  }
  const stacked = LEVELS.some((level) => {
    const props = level.objects.filter((object) => object.kind !== 'pedestal' && object.kind !== 'shelf')
    return props.some((a, i) =>
      props.slice(i + 1).some((b) => a.kind === b.kind && Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) > 0.2),
    )
  })
  assert(stacked, 'need a stacked structure')
}

function board(sim: Simulation, level: LevelDef): string {
  const rows = 24
  const cols = 29
  const { halfW, height } = level.field
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '·'))
  const paint = (x: number, y: number, ch: string) => {
    const c = Math.round(((x + halfW) / (halfW * 2)) * (cols - 1))
    const r = rows - 1 - Math.round((y / height) * (rows - 1))
    if (grid[r]?.[c] !== undefined) grid[r][c] = ch
  }
  paint(level.cannon.x, level.cannon.y, 'C')
  for (const actor of sim.actors) {
    if (actor.static) continue
    paint(actor.body.position.x, actor.body.position.y, actor.required ? actor.kind[0].toUpperCase() : actor.kind[0])
  }
  return grid.map((row) => row.join('')).join('\n')
}

function settleCheck(level: LevelDef): void {
  const sim = new Simulation(level)
  const drift = sim.settle()
  assert(drift < 0.18, `${level.name} moved ${drift.toFixed(3)} while settling`)
  const start = sim.remainingRequired()
  assert(start > 0, `${level.name} has no targets`)
  sim.wakeAll()
  for (let i = 0; i < 120; i++) sim.step(TUNING.fixedDt)
  assert(sim.remainingRequired() === start, `${level.name} broke before the first shot\n${board(sim, level)}`)
}

function play(level: LevelDef, shots: Shot[]): Simulation {
  const sim = new Simulation(level)
  sim.settle()
  for (const shot of shots) {
    if (sim.remainingRequired() === 0 || sim.lives <= 0) break
    sim.fire(shot.angle, shot.power)
    sim.runUntilCalm()
  }
  return sim
}

function parseShots(argv: string[]): Shot[] {
  const shots: Shot[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--shot') {
      const [angle, power] = (argv[i + 1] ?? '').split(',').map(Number)
      shots.push({ angle, power })
      i += 1
    }
  }
  return shots
}

function main(): void {
  checkBallistics()
  checkCoins()
  variety()
  const argv = process.argv.slice(2)
  const levelFlag = argv.indexOf('--level')
  if (levelFlag >= 0) {
    const id = Number(argv[levelFlag + 1])
    const level = LEVELS.find((entry) => entry.id === id)
    assert(level, `no level ${id}`)
    const shots = parseShots(argv)
    const sim = play(level, shots)
    console.log(board(sim, level))
    console.log(`remaining ${sim.remainingRequired()} lives ${sim.lives} coins ${sim.coins}`)
    for (const impact of sim.impacts.slice(-12)) {
      console.log(
        `  ${impact.target} <- ${impact.other} impact ${impact.impact.toFixed(2)} dmg ${impact.damage.toFixed(2)} hp ${impact.health.toFixed(2)}`,
      )
    }
    return
  }

  for (const level of LEVELS) settleCheck(level)

  const tutorial = LEVELS[0]
  if (tutorial.hint) {
    const fresh = new Simulation(tutorial)
    fresh.settle()
    const start = fresh.remainingRequired()
    const after = play(tutorial, [tutorial.hint])
    assert(after.remainingRequired() < start, 'level 1 lined-up shot should break a target')
  }

  const file = new URL('./solutions.json', import.meta.url)
  if (!existsSync(file)) {
    console.error('Missing scripts/solutions.json. Run npm run solve.')
    process.exit(1)
  }
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { levels: Record<string, Shot[]> }
  for (const level of LEVELS) {
    const shots = saved.levels[String(level.id)]
    assert(shots?.length, `${level.name} has no saved solution`)
    assert(shots.length <= TUNING.lives, `${level.name} solution uses more than 5 shots`)
    const sim = play(level, shots)
    if (sim.remainingRequired() !== 0) {
      console.error(board(sim, level))
      for (const impact of sim.impacts.slice(-15)) {
        console.error(
          `  ${impact.target} <- ${impact.other} impact ${impact.impact.toFixed(2)} dmg ${impact.damage.toFixed(2)}`,
        )
      }
      throw new Error(`${level.name} still has ${sim.remainingRequired()} targets`)
    }
    console.log(
      `Level ${level.id} ${level.name}: cleared in ${shots.length} shots, ${sim.lives} lives left, ${sim.coins} coins`,
    )
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
