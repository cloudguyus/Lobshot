export interface LevelButtonModel {
  id: number
  name: string
  blurb: string
  locked: boolean
  cleared: boolean
  best: number | null
}

export interface ResultAction {
  label: string
  primary?: boolean
  run: () => void
}

export interface ResultModel {
  win: boolean
  kicker: string
  title: string
  smash: number
  bonus: number
  round: number
  marks: number
  note: string
  actions: ResultAction[]
}

interface Handlers {
  continue: () => void
  levels: () => void
  back: () => void
  start: (id: number) => void
  mute: () => void
  reset: () => void
  fire: () => void
}

export class Ui {
  private readonly scrim: HTMLElement
  private readonly titlePanel: HTMLElement
  private readonly levelsPanel: HTMLElement
  private readonly resultPanel: HTMLElement
  private readonly hud: HTMLElement
  private readonly coach: HTMLElement
  private readonly power: HTMLElement
  private readonly powerFill: HTMLElement
  private readonly powerLabel: HTMLElement
  private readonly fireButton: HTMLButtonElement
  private readonly floaters: HTMLElement
  private readonly levelList: HTMLElement
  private readonly continueButton: HTMLButtonElement
  private readonly titleCoins: HTMLElement
  private readonly hudKicker: HTMLElement
  private readonly hudName: HTMLElement
  private readonly hudCoins: HTMLElement
  private readonly hudLives: HTMLElement
  private readonly resultKicker: HTMLElement
  private readonly resultTitle: HTMLElement
  private readonly resultBody: HTMLElement
  private readonly resultMarks: HTMLElement
  private readonly resultNote: HTMLElement
  private readonly resultActions: HTMLElement
  private readonly resetButton: HTMLButtonElement
  private resetArmed = false
  private resetTimer = 0

  constructor(
    parent: HTMLElement,
    private readonly handlers: Handlers,
  ) {
    parent.innerHTML = `
      <header class="hud" id="hud" hidden>
        <div>
          <p class="kicker" id="hud-kicker"></p>
          <h2 id="hud-name"></h2>
        </div>
        <div class="hud-side">
          <p class="coin-count" id="hud-coins"></p>
          <div class="lives" id="hud-lives" role="img"></div>
          <button type="button" class="text-btn" data-mute>Mute</button>
          <button type="button" class="text-btn" id="hud-levels">Levels</button>
        </div>
      </header>
      <p class="coach" id="coach" hidden></p>
      <div class="power" id="power" hidden>
        <div class="power-track"><div class="power-fill" id="power-fill"></div></div>
        <span id="power-label">0</span>
      </div>
      <button type="button" class="fire" id="fire" hidden>Fire</button>
      <div id="floaters"></div>
      <div class="scrim" id="scrim">
        <div class="sheet" role="dialog" aria-modal="true">
          <section id="panel-title">
            <p class="eyebrow">Kiln yard</p>
            <h1 class="wordmark">Lob<span>shot</span></h1>
            <p class="tag">A pocket cannon for the shelves.</p>
            <div class="stack">
              <button type="button" class="primary" id="continue">Play</button>
              <button type="button" class="secondary" id="open-levels">Levels</button>
            </div>
            <p class="fine" id="title-coins"></p>
            <button type="button" class="text-link" data-mute>Mute</button>
          </section>
          <section id="panel-levels" hidden>
            <div class="sheet-head">
              <h2>Levels</h2>
              <button type="button" class="text-link" id="back">Back</button>
            </div>
            <div class="level-list" id="level-list"></div>
            <button type="button" class="text-link danger" id="reset">Reset this device</button>
          </section>
          <section id="panel-result" hidden>
            <p class="eyebrow" id="result-kicker"></p>
            <h2 id="result-title"></h2>
            <div class="marks" id="result-marks" role="img"></div>
            <p class="result-body" id="result-body"></p>
            <p class="fine" id="result-note"></p>
            <div class="stack" id="result-actions"></div>
          </section>
        </div>
      </div>
    `
    this.scrim = must(parent, '#scrim')
    this.titlePanel = must(parent, '#panel-title')
    this.levelsPanel = must(parent, '#panel-levels')
    this.resultPanel = must(parent, '#panel-result')
    this.hud = must(parent, '#hud')
    this.coach = must(parent, '#coach')
    this.power = must(parent, '#power')
    this.powerFill = must(parent, '#power-fill')
    this.powerLabel = must(parent, '#power-label')
    this.fireButton = must(parent, '#fire')
    this.floaters = must(parent, '#floaters')
    this.levelList = must(parent, '#level-list')
    this.continueButton = must(parent, '#continue')
    this.titleCoins = must(parent, '#title-coins')
    this.hudKicker = must(parent, '#hud-kicker')
    this.hudName = must(parent, '#hud-name')
    this.hudCoins = must(parent, '#hud-coins')
    this.hudLives = must(parent, '#hud-lives')
    this.resultKicker = must(parent, '#result-kicker')
    this.resultTitle = must(parent, '#result-title')
    this.resultBody = must(parent, '#result-body')
    this.resultMarks = must(parent, '#result-marks')
    this.resultNote = must(parent, '#result-note')
    this.resultActions = must(parent, '#result-actions')
    this.resetButton = must(parent, '#reset')

    this.bind(this.continueButton, handlers.continue)
    this.bind(must(parent, '#open-levels'), handlers.levels)
    this.bind(must(parent, '#back'), handlers.back)
    this.bind(must(parent, '#hud-levels'), handlers.levels)
    this.bind(this.fireButton, handlers.fire)
    this.bind(this.resetButton, () => this.armReset())
    for (const button of parent.querySelectorAll<HTMLButtonElement>('[data-mute]')) {
      this.bind(button, handlers.mute)
    }
  }

  setMuted(muted: boolean): void {
    for (const button of this.hud.parentElement?.querySelectorAll<HTMLButtonElement>('[data-mute]') ?? []) {
      button.textContent = muted ? 'Unmute' : 'Mute'
      button.setAttribute('aria-pressed', String(muted))
    }
  }

  showTitle(continueLabel: string, coins: number): void {
    this.placeScrim('top')
    this.titlePanel.hidden = false
    this.levelsPanel.hidden = true
    this.resultPanel.hidden = true
    this.hud.hidden = true
    this.continueButton.textContent = continueLabel
    this.titleCoins.textContent =
      coins > 0 ? `${coins} coins on this device.` : 'Progress stays on this device.'
    this.setCoach(null)
    this.setPower(null)
    this.setFireVisible(false)
  }

  showLevels(levels: LevelButtonModel[]): void {
    this.placeScrim('top')
    this.titlePanel.hidden = true
    this.levelsPanel.hidden = false
    this.resultPanel.hidden = true
    this.hud.hidden = true
    this.levelList.replaceChildren()
    for (const level of levels) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'level'
      button.disabled = level.locked
      const top = document.createElement('span')
      top.className = 'level-top'
      const kicker = document.createElement('span')
      kicker.textContent = `Level ${level.id}`
      const state = document.createElement('span')
      state.textContent = level.locked ? 'Locked' : level.cleared ? 'Cleared' : 'Open'
      top.append(kicker, state)
      const name = document.createElement('span')
      name.className = 'level-name'
      name.textContent = level.name
      const blurb = document.createElement('span')
      blurb.className = 'level-blurb'
      blurb.textContent = level.locked ? 'Clear the previous level.' : level.best ? `${level.blurb} Best ${level.best}.` : level.blurb
      button.append(top, name, blurb)
      this.bind(button, () => this.handlers.start(level.id))
      this.levelList.append(button)
    }
    this.setCoach(null)
    this.setPower(null)
    this.setFireVisible(false)
  }

  showPlay(kicker: string, name: string): void {
    this.placeScrim('hidden')
    this.hud.hidden = false
    this.hudKicker.textContent = kicker
    this.hudName.textContent = name
    this.setFireVisible(true)
  }

  setHud(coins: number, lives: number, maxLives: number): void {
    this.hudCoins.textContent = String(coins)
    this.hudLives.replaceChildren()
    for (let i = 0; i < maxLives; i++) {
      const dot = document.createElement('span')
      dot.className = i < lives ? 'life' : 'life off'
      this.hudLives.append(dot)
    }
    this.hudLives.setAttribute('aria-label', `${lives} of ${maxLives} lives left`)
  }

  showResult(model: ResultModel): void {
    this.placeScrim('bottom')
    this.titlePanel.hidden = true
    this.levelsPanel.hidden = true
    this.resultPanel.hidden = false
    this.hud.hidden = false
    this.resultKicker.textContent = model.kicker
    this.resultTitle.textContent = model.title
    this.resultBody.textContent = model.win
      ? `Smashed ${model.smash}. Lives left add ${model.bonus}. This round ${model.round}.`
      : `Smashed ${model.smash}. Those coins stay on this device.`
    this.resultNote.textContent = model.note
    this.resultMarks.hidden = !model.win
    this.resultMarks.replaceChildren()
    if (model.win) {
      for (let i = 0; i < 3; i++) {
        const mark = document.createElement('span')
        mark.className = i < model.marks ? 'mark on' : 'mark'
        this.resultMarks.append(mark)
      }
      this.resultMarks.setAttribute('aria-label', `${model.marks} of 3 kiln marks`)
    }
    this.resultActions.replaceChildren()
    for (const action of model.actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = action.primary ? 'primary' : 'secondary'
      button.textContent = action.label
      this.bind(button, action.run)
      this.resultActions.append(button)
    }
    this.setCoach(null)
    this.setPower(null)
    this.setFireVisible(false)
  }

  setCoach(text: string | null): void {
    if (!text) {
      this.coach.hidden = true
      return
    }
    this.coach.hidden = false
    this.coach.textContent = text
  }

  setPower(power: number | null): void {
    if (power === null) {
      this.power.hidden = true
      return
    }
    this.power.hidden = false
    const pct = Math.round(clampUnit(power) * 100)
    this.powerFill.style.height = `${pct}%`
    this.powerLabel.textContent = String(pct)
  }

  setFireEnabled(enabled: boolean): void {
    this.fireButton.disabled = !enabled
  }

  setFireVisible(visible: boolean): void {
    this.fireButton.hidden = !visible
  }

  floater(x: number, y: number, text: string): void {
    const node = document.createElement('span')
    node.className = 'floater'
    node.textContent = text
    node.style.left = `${x}px`
    node.style.top = `${y}px`
    this.floaters.append(node)
    window.setTimeout(() => node.remove(), 880)
  }

  private placeScrim(edge: 'top' | 'bottom' | 'hidden'): void {
    this.scrim.hidden = edge === 'hidden'
    this.scrim.classList.toggle('top', edge === 'top')
  }

  private armReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true
      this.resetButton.textContent = 'Tap again to erase'
      window.clearTimeout(this.resetTimer)
      this.resetTimer = window.setTimeout(() => {
        this.resetArmed = false
        this.resetButton.textContent = 'Reset this device'
      }, 2600)
      return
    }
    window.clearTimeout(this.resetTimer)
    this.resetArmed = false
    this.resetButton.textContent = 'Reset this device'
    this.handlers.reset()
  }

  private bind(button: HTMLButtonElement, run: () => void): void {
    button.addEventListener('click', () => {
      button.blur()
      run()
    })
  }
}

function must<T extends Element>(parent: ParentNode, selector: string): T {
  const node = parent.querySelector<T>(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}
