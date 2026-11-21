import { flightPath } from './ballistics'
import { Sfx } from './audio'
import { AimInput } from './input'
import { LEVELS, levelById } from './levels'
import { Simulation } from './sim'
import { Stage } from './stage'
import { freshSave, loadSave, writeSave, type Save } from './storage'
import { TUNING } from './tuning'
import { Ui, type LevelButtonModel } from './ui'
import type { LevelDef } from './types'

type Mode = 'title' | 'levels' | 'aim' | 'flight' | 'won' | 'lost'

export class Game {
  private readonly stage: Stage
  private readonly input: AimInput
  private readonly ui: Ui
  private readonly audio = new Sfx()
  private readonly fine: boolean
  private readonly reduce: boolean
  private save: Save
  private sim: Simulation | null = null
  private level: LevelDef = LEVELS[0]
  private mode: Mode = 'title'
  private raf = 0
  private last = 0
  private acc = 0
  private flightTime = 0
  private celebrate = 0
  private committed = false
  private finished = false
  private breaksThisShot = 0
  private readonly onKey: (event: KeyboardEvent) => void
  private readonly onResize: () => void
  private readonly onLost: (event: Event) => void

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.fine = window.matchMedia('(pointer: fine)').matches
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.save = loadSave()
    this.audio.muted = this.save.muted
    this.stage = new Stage(canvas)
    this.input = new AimInput(
      canvas,
      () => this.stage.camera,
      () => this.level.cannon,
      {
        engage: () => this.audio.unlock(),
        change: () => {
          this.ui.setCoach(this.coachLine())
          this.ui.setFireEnabled(this.canFire())
        },
        fire: () => this.launch(),
      },
    )
    this.ui = new Ui(document.querySelector('#ui') as HTMLElement, {
      continue: () => this.continue(),
      levels: () => this.openLevels(),
      back: () => this.showTitle(),
      start: (id) => this.startLevel(id),
      mute: () => this.toggleMute(),
      reset: () => this.resetProgress(),
      fire: () => this.launch(),
    })
    this.ui.setMuted(this.save.muted)
    this.onKey = (event) => {
      if (event.key !== 'Escape') return
      if (this.mode === 'levels') this.showTitle()
      else if (this.mode !== 'title') this.openLevels()
    }
    this.onResize = () => this.stage.resize()
    this.onLost = (event) => {
      event.preventDefault()
      this.stop()
      const fallback = document.querySelector<HTMLElement>('#fallback')
      if (fallback) fallback.hidden = false
    }
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
    canvas.addEventListener('webglcontextlost', this.onLost)
  }

  start(): void {
    this.showTitle()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
  }

  destroy(): void {
    this.stop()
    this.input.destroy()
    this.stage.destroy()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const raw = (now - this.last) / 1000
    this.last = now
    if (raw > 0.25) {
      this.acc = 0
      this.stage.render()
      return
    }
    const dt = Math.min(0.05, raw)
    this.tick(dt, now)
  }

  private tick(dt: number, now: number): void {
    if (this.mode === 'flight' && this.sim) {
      this.acc += dt
      let steps = 0
      let simulated = 0
      while (this.acc >= TUNING.fixedDt && steps < 8) {
        this.sim.step(TUNING.fixedDt)
        this.acc -= TUNING.fixedDt
        simulated += TUNING.fixedDt
        steps += 1
      }
      this.flightTime += simulated
      this.consumeBreaks()
      this.stage.setCannon(this.level.cannon.x, this.level.cannon.y, this.input.angle)
      this.stage.setTrajectory([])
      this.stage.setLoaded(false)
      if (!this.finished && this.sim.remainingRequired() === 0) {
        this.celebrate += dt
        if (this.celebrate >= 0.72) this.win()
      } else if (!this.finished && !this.sim.ball && this.sim.calmTime >= 0.4) {
        this.resolve()
      } else if (!this.finished && this.flightTime > 8) {
        this.resolve()
      }
    } else if (this.mode === 'title' || this.mode === 'levels') {
      const bob = this.reduce ? 0 : Math.sin(now / 850) * 0.08
      this.stage.setCannon(this.level.cannon.x, this.level.cannon.y, Math.PI / 2 + bob)
      this.stage.setTrajectory([])
      this.stage.setLoaded(true)
    } else if (this.mode === 'aim' && this.sim) {
      this.stage.setCannon(this.level.cannon.x, this.level.cannon.y, this.input.angle)
      const showArc = Boolean(this.level.hint && !this.input.interacted) || this.input.interacted || this.input.dragging
      this.stage.setTrajectory(
        showArc ? flightPath(this.level.cannon, this.input.angle, this.input.power, this.sim.solids) : [],
      )
      this.stage.setLoaded(true)
      this.ui.setPower(this.input.dragging || this.input.keyboard ? this.input.power : null)
      this.ui.setFireEnabled(this.canFire())
    } else {
      this.stage.setTrajectory([])
      this.stage.setLoaded(false)
    }

    if (this.sim && (this.mode === 'aim' || this.mode === 'flight')) {
      this.ui.setHud(this.shownCoins(), this.sim.lives, TUNING.lives)
    }
    if (this.sim) this.stage.sync(this.sim.actors)
    this.stage.render()
  }

  private showTitle(): void {
    this.input.setEnabled(false)
    this.mode = 'title'
    this.loadBackdrop(this.continueId())
    const label = this.save.cleared.length > 0 || this.save.unlocked > 1 ? 'Continue' : 'Play'
    this.ui.showTitle(label, this.save.coins)
  }

  private openLevels(): void {
    if (this.sim && this.sim.remainingRequired() === 0 && (this.mode === 'aim' || this.mode === 'flight') && !this.finished) {
      this.win()
      return
    }
    if (this.mode === 'aim' || this.mode === 'flight') this.bank(0)
    this.input.setEnabled(false)
    this.mode = 'levels'
    if (!this.sim) this.loadBackdrop(this.continueId())
    this.ui.showLevels(this.levelButtons())
  }

  private continue(): void {
    this.audio.unlock()
    this.startLevel(this.continueId())
  }

  private startLevel(id: number): void {
    this.audio.unlock()
    if (id > this.save.unlocked) return
    this.level = levelById(id)
    this.sim = new Simulation(this.level)
    this.sim.settle()
    this.stage.clearDynamics()
    this.stage.setField(this.level)
    this.committed = false
    this.finished = false
    this.flightTime = 0
    this.celebrate = 0
    this.acc = 0
    this.breaksThisShot = 0
    const hint = this.level.hint
    this.input.reset(hint?.angle ?? 1.2, hint?.power ?? 0.58)
    this.enterAim()
  }

  private enterAim(): void {
    this.mode = 'aim'
    this.input.setEnabled(true)
    this.ui.showPlay(`Level ${this.level.id}`, this.level.name)
    this.ui.setCoach(this.coachLine())
    this.ui.setFireEnabled(this.canFire())
    this.ui.setFireVisible(true)
    if (this.sim) this.ui.setHud(this.shownCoins(), this.sim.lives, TUNING.lives)
  }

  private launch(): void {
    if (!this.sim || !this.canFire()) return
    this.audio.unlock()
    const fired = this.sim.fire(this.input.angle, this.input.power)
    if (!fired) return
    this.input.interacted = true
    this.input.dragging = false
    this.mode = 'flight'
    this.flightTime = 0
    this.celebrate = 0
    this.breaksThisShot = 0
    this.input.setEnabled(false)
    this.stage.popMuzzle()
    this.stage.setLoaded(false)
    this.stage.kick(0.045)
    this.audio.fire()
    if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
    this.ui.setCoach(null)
    this.ui.setPower(null)
    this.ui.setFireEnabled(false)
    this.ui.setFireVisible(false)
  }

  private resolve(): void {
    if (!this.sim || this.finished || this.mode !== 'flight') return
    if (this.sim.remainingRequired() === 0) this.win()
    else if (this.sim.lives <= 0) this.lose()
    else this.enterAim()
  }

  private win(): void {
    if (!this.sim || this.finished) return
    const bonus = this.sim.lives * TUNING.lifeBonus
    const { smash, earned } = this.bank(bonus)
    const key = String(this.level.id)
    const previousBest = this.save.best[key] ?? 0
    this.save.best[key] = Math.max(previousBest, earned)
    if (!this.save.cleared.includes(this.level.id)) this.save.cleared.push(this.level.id)
    if (this.level.id < LEVELS.length) this.save.unlocked = Math.max(this.save.unlocked, this.level.id + 1)
    writeSave(this.save)
    this.finished = true
    this.mode = 'won'
    this.input.setEnabled(false)
    this.audio.win()
    const hasNext = this.level.id < LEVELS.length
    this.ui.showResult({
      win: true,
      kicker: 'Level clear',
      title: this.level.win,
      smash,
      bonus,
      round: earned,
      marks: kilnMarks(this.sim.lives),
      note: earned >= previousBest ? 'Best round on this device.' : `Best ${this.save.best[key]}.`,
      actions: [
        ...(hasNext ? [{ label: 'Next level', primary: true, run: () => this.startLevel(this.level.id + 1) }] : []),
        { label: 'Replay', primary: !hasNext, run: () => this.startLevel(this.level.id) },
        { label: 'Levels', run: () => this.openLevels() },
      ],
    })
  }

  private lose(): void {
    if (!this.sim || this.finished) return
    const { smash } = this.bank(0)
    this.finished = true
    this.mode = 'lost'
    this.input.setEnabled(false)
    this.audio.fail()
    this.ui.showResult({
      win: false,
      kicker: 'Out of shot',
      title: 'The clay holds.',
      smash,
      bonus: 0,
      round: smash,
      marks: 0,
      note: 'Five lives a level. The shelves reset when you try again.',
      actions: [
        { label: 'Try again', primary: true, run: () => this.startLevel(this.level.id) },
        { label: 'Levels', run: () => this.openLevels() },
      ],
    })
  }

  private bank(bonus: number): { smash: number; earned: number } {
    if (!this.sim || this.committed) return { smash: 0, earned: 0 }
    const smash = this.sim.coins
    const earned = smash + bonus
    this.save.coins += earned
    this.committed = true
    writeSave(this.save)
    return { smash, earned }
  }

  private toggleMute(): void {
    this.audio.unlock()
    this.save.muted = !this.save.muted
    this.audio.muted = this.save.muted
    writeSave(this.save)
    this.ui.setMuted(this.save.muted)
  }

  private resetProgress(): void {
    this.save = freshSave()
    this.audio.muted = false
    writeSave(this.save)
    this.ui.setMuted(false)
    this.showTitle()
  }

  private loadBackdrop(id: number): void {
    this.level = levelById(id)
    this.sim = new Simulation(this.level)
    this.sim.settle()
    this.stage.clearDynamics()
    this.stage.setField(this.level)
    this.committed = true
    this.stage.sync(this.sim.actors)
  }

  private consumeBreaks(): void {
    if (!this.sim) return
    for (const event of this.sim.drainEvents()) {
      const at = this.stage.project(event.x, event.y)
      if (event.coins > 0) this.ui.floater(at.x, at.y, `+${event.coins}`)
      this.breaksThisShot += 1
      if (this.breaksThisShot === 2) this.ui.floater(at.x, at.y - 28, 'Chain')
      if (event.kind === 'stone') this.audio.stone()
      else this.audio.clay()
      this.stage.kick(event.kind === 'stone' ? 0.2 : 0.11)
      if (typeof navigator.vibrate === 'function') navigator.vibrate(event.kind === 'stone' ? 16 : 8)
    }
  }

  private canFire(): boolean {
    if (this.mode !== 'aim' || !this.sim || this.sim.lives <= 0 || this.input.power < 0.08) return false
    if (this.level.hint && !this.input.interacted) return true
    return this.input.interacted
  }

  private coachLine(): string | null {
    if (this.mode !== 'aim' || this.input.interacted) return null
    if (this.level.hint) {
      return this.fine
        ? 'Shot lined up. Press space or Fire, or drag to change it.'
        : 'Shot lined up. Drag to change it, or tap Fire.'
    }
    return this.fine
      ? `${this.level.blurb} Drag to aim. Space fires.`
      : `${this.level.blurb} Drag to aim, release to fire.`
  }

  private shownCoins(): number {
    if (!this.sim || this.committed) return this.save.coins
    return this.save.coins + this.sim.coins
  }

  private continueId(): number {
    for (const level of LEVELS) {
      if (!this.save.cleared.includes(level.id) && level.id <= this.save.unlocked) return level.id
    }
    return LEVELS[LEVELS.length - 1].id
  }

  private levelButtons(): LevelButtonModel[] {
    return LEVELS.map((level) => ({
      id: level.id,
      name: level.name,
      blurb: level.blurb,
      locked: level.id > this.save.unlocked,
      cleared: this.save.cleared.includes(level.id),
      best: this.save.best[String(level.id)] ?? null,
    }))
  }
}

function kilnMarks(livesLeft: number): number {
  if (livesLeft >= 3) return 3
  if (livesLeft >= 1) return 2
  return 1
}
