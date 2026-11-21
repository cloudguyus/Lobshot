export class Sfx {
  muted = false
  private ctx: AudioContext | null = null

  unlock(): void {
    const ctx = this.context()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  fire(): void {
    this.noise(0.09, 0.12, 180)
    this.tone(120, 0.12, 'sine', 0.07)
  }

  clay(): void {
    this.noise(0.08, 0.1, 700)
    this.tone(680, 0.07, 'triangle', 0.035)
  }

  stone(): void {
    this.noise(0.14, 0.14, 120)
    this.tone(78, 0.16, 'sine', 0.07)
  }

  win(): void {
    ;[523, 659, 784, 1046].forEach((freq, index) => this.tone(freq, 0.18, 'triangle', 0.045, index * 0.08))
  }

  fail(): void {
    ;[392, 311, 233].forEach((freq, index) => this.tone(freq, 0.18, 'sine', 0.04, index * 0.09))
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    try {
      this.ctx = new Ctx()
    } catch {
      return null
    }
    return this.ctx
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    if (this.muted) return
    const ctx = this.context()
    if (!ctx) return
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    amp.gain.setValueAtTime(gain, start)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(amp)
    amp.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + dur + 0.02)
  }

  private noise(dur: number, gain: number, highpass: number): void {
    if (this.muted) return
    const ctx = this.context()
    if (!ctx) return
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpass
    const amp = ctx.createGain()
    amp.gain.value = gain
    source.connect(filter)
    filter.connect(amp)
    amp.connect(ctx.destination)
    source.start()
  }
}
