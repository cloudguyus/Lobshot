import * as CANNON from 'cannon-es'
import { clampAngle, muzzleOf, speedFromPower, type Aabb } from './ballistics'
import { GLAZES, SPECS, TUNING, isBreakKind, type BreakKind } from './tuning'
import type { Kind, LevelDef, LevelObject } from './types'

const GROUP = {
  static: 1,
  prop: 2,
  ball: 4,
  debris: 8,
} as const

const Z_AXIS = new CANNON.Vec3(0, 0, 1)

export interface Span {
  hx: number
  hy: number
  hz: number
}

export interface Actor {
  id: string
  kind: Kind
  required: boolean
  coins: number
  health: number
  broken: boolean
  queued: boolean
  static: boolean
  breakable: boolean
  body: CANNON.Body
  color: string
  span: Span
  hitVx: number
  hitVy: number
}

export interface Impact {
  target: string
  other: string
  impact: number
  damage: number
  health: number
}

export interface BreakEvent {
  type: 'break'
  x: number
  y: number
  coins: number
  kind: Kind
  id: string
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lockPlane(body: CANNON.Body): void {
  body.linearFactor.set(1, 1, 0)
  body.angularFactor.set(0, 0, 1)
}

/**
 * DOM-free cannon-es world. The browser renderer mirrors `actors`;
 * the level solver runs this same class in Node.
 *
 * Damage is applied on cannon's first-contact event, which is the impact
 * and not the resting contact that follows. Breaks are queued and flushed
 * after the step so the world is not mutated inside the solver.
 */
export class Simulation {
  readonly world: CANNON.World
  readonly actors: Actor[] = []
  readonly solids: Aabb[] = []
  readonly impacts: Impact[] = []
  readonly events: BreakEvent[] = []
  lives = TUNING.lives
  coins = 0
  calmTime = 0
  ball: Actor | null = null

  private readonly byBody = new Map<CANNON.Body, Actor>()
  private readonly breakQueue: Actor[] = []
  private readonly ballMat: CANNON.Material
  private readonly clayMat: CANNON.Material
  private readonly stoneMat: CANNON.Material
  private readonly woodMat: CANNON.Material
  private readonly rng: () => number
  private acceptDamage = false
  private seq = 1
  private glaze = 0
  private ballSlow = 0
  private shardCount = 0

  constructor(readonly level: LevelDef) {
    this.rng = mulberry32(level.id * 100003 + 17)
    this.ballMat = new CANNON.Material('ball')
    this.clayMat = new CANNON.Material('clay')
    this.stoneMat = new CANNON.Material('stone')
    this.woodMat = new CANNON.Material('wood')

    const solver = new CANNON.GSSolver()
    solver.iterations = 12
    solver.tolerance = 0.001
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -TUNING.gravity, 0),
      allowSleep: true,
      solver,
    })
    this.world.broadphase = new CANNON.NaiveBroadphase()
    this.world.defaultContactMaterial.friction = 0.4
    this.world.defaultContactMaterial.restitution = 0.05
    this.pair(this.ballMat, this.clayMat, 0.22, 0.06)
    this.pair(this.ballMat, this.stoneMat, 0.28, 0.04)
    this.pair(this.ballMat, this.woodMat, 0.32, 0.22)
    this.pair(this.clayMat, this.woodMat, 0.72, 0.01)
    this.pair(this.clayMat, this.clayMat, 0.5, 0.02)
    this.pair(this.stoneMat, this.woodMat, 0.78, 0.01)
    this.pair(this.stoneMat, this.clayMat, 0.55, 0.02)
    this.pair(this.stoneMat, this.stoneMat, 0.6, 0.01)
    this.pair(this.woodMat, this.woodMat, 0.65, 0.02)

    this.addBounds()
    for (const object of level.objects) this.addObject(object)
  }

  private pair(a: CANNON.Material, b: CANNON.Material, friction: number, restitution: number): void {
    this.world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }))
  }

  /** Drop supports into contact, then freeze them so the opening frame is quiet. */
  settle(): number {
    this.acceptDamage = false
    const spawned = this.actors
      .filter((actor) => !actor.static)
      .map((actor) => ({ actor, x: actor.body.position.x, y: actor.body.position.y }))
    for (let i = 0; i < 240; i++) this.world.step(TUNING.fixedDt)
    let drift = 0
    for (const spawnedActor of spawned) {
      const dx = spawnedActor.actor.body.position.x - spawnedActor.x
      const dy = spawnedActor.actor.body.position.y - spawnedActor.y
      drift = Math.max(drift, Math.hypot(dx, dy))
      const speed = spawnedActor.actor.body.velocity.length()
      if (speed < 0.2) {
        spawnedActor.actor.body.velocity.set(0, 0, 0)
        spawnedActor.actor.body.angularVelocity.set(0, 0, 0)
        spawnedActor.actor.body.sleep()
      }
    }
    this.acceptDamage = true
    this.events.length = 0
    this.breakQueue.length = 0
    this.impacts.length = 0
    this.calmTime = 0
    return drift
  }

  wakeAll(): void {
    for (const actor of this.actors) {
      if (!actor.static) actor.body.wakeUp()
    }
  }

  fire(angle: number, power: number): boolean {
    if (this.ball || this.lives <= 0) return false
    const clamped = clampAngle(angle)
    const speed = speedFromPower(power)
    const muzzle = muzzleOf(this.level.cannon, clamped)
    const actor = this.makeActor({
      kind: 'ball',
      x: muzzle.x,
      y: muzzle.y,
      mass: TUNING.ballMass,
      health: 1e9,
      coins: 0,
      required: false,
      breakable: false,
      color: '#f6f1e6',
      span: { hx: TUNING.ballRadius, hy: TUNING.ballRadius, hz: TUNING.ballRadius },
      group: GROUP.ball,
      mask: GROUP.static | GROUP.prop | GROUP.debris,
      material: this.ballMat,
      damping: 0,
      angularDamping: 0.02,
    })
    actor.body.velocity.set(Math.cos(clamped) * speed, Math.sin(clamped) * speed, 0)
    actor.body.angularVelocity.set(0, 0, speed * 0.12)
    this.ball = actor
    this.lives -= 1
    this.ballSlow = 0
    this.calmTime = 0
    this.impacts.length = 0
    this.wakeAll()
    return true
  }

  step(dt: number): void {
    this.world.step(dt)
    this.flushBreaks()
    this.updateBall(dt)
    if (this.isCalm()) this.calmTime += dt
    else this.calmTime = 0
  }

  runUntilCalm(maxSeconds = 8): void {
    const maxSteps = Math.ceil(maxSeconds / TUNING.fixedDt)
    for (let i = 0; i < maxSteps; i++) {
      this.step(TUNING.fixedDt)
      const resting = !this.ball && this.calmTime >= 0.35
      const cleared = this.remainingRequired() === 0 && !this.ball && this.calmTime >= 0.2
      if (resting || cleared) return
    }
  }

  remainingRequired(): number {
    let count = 0
    for (const actor of this.actors) {
      if (actor.required && !actor.broken) count += 1
    }
    return count
  }

  drainEvents(): BreakEvent[] {
    return this.events.splice(0, this.events.length)
  }

  private isCalm(): boolean {
    if (this.ball && this.moving(this.ball.body)) return false
    for (const actor of this.actors) {
      if (actor.static || actor.kind === 'ball') continue
      if (actor.body.sleepState === CANNON.Body.SLEEPING) continue
      if (this.moving(actor.body)) return false
    }
    return true
  }

  private moving(body: CANNON.Body): boolean {
    return body.velocity.length() > 0.5 || body.angularVelocity.length() > 0.9
  }

  private updateBall(dt: number): void {
    const ball = this.ball
    if (!ball) return
    const { x, y } = ball.body.position
    const height = this.level.field.height
    const halfW = this.level.field.halfW
    if (y < -1 || y > height + 1.4 || Math.abs(x) > halfW + 0.85) {
      this.removeActor(ball)
      this.ball = null
      return
    }
    if (ball.body.velocity.length() < 0.45 || ball.body.sleepState === CANNON.Body.SLEEPING) {
      this.ballSlow += dt
      if (this.ballSlow > 0.35) {
        this.removeActor(ball)
        this.ball = null
      }
    } else {
      this.ballSlow = 0
    }
  }

  private flushBreaks(): void {
    if (this.breakQueue.length === 0) return
    const queued = this.breakQueue.splice(0, this.breakQueue.length)
    for (const actor of queued) {
      if (actor.broken) continue
      this.shatter(actor)
    }
  }

  private shatter(actor: Actor): void {
    actor.broken = true
    actor.health = 0
    const x = actor.body.position.x
    const y = actor.body.position.y
    const color = actor.color
    const span = actor.span
    const vx = actor.hitVx
    const vy = actor.hitVy
    const kind = actor.kind
    if (actor.coins > 0) this.coins += actor.coins
    this.events.push({ type: 'break', x, y, coins: actor.coins, kind, id: actor.id })
    this.removeActor(actor)
    this.spawnShards(kind, color, span, x, y, vx, vy)
    this.wakeAll()
  }

  private spawnShards(
    kind: Kind,
    color: string,
    span: Span,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): void {
    const count = kind === 'bottle' ? 4 : kind === 'stone' ? 5 : 6
    for (let i = 0; i < count; i++) {
      if (this.shardCount >= TUNING.shardCap) return
      const angle = (i / count) * Math.PI * 2 + this.rng() * 0.4
      const dist = Math.max(span.hx, span.hy) * 0.18
      const hx = 0.055 + this.rng() * 0.035
      const hy = 0.045 + this.rng() * 0.03
      const hz = 0.05 + this.rng() * 0.03
      const actor = this.makeActor({
        kind: 'shard',
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist * 0.45,
        mass: 0.16,
        health: 1e9,
        coins: 0,
        required: false,
        breakable: false,
        color,
        span: { hx, hy, hz },
        group: GROUP.debris,
        mask: GROUP.static | GROUP.prop | GROUP.ball,
        material: kind === 'stone' ? this.stoneMat : kind === 'crate' ? this.woodMat : this.clayMat,
        damping: 0.2,
        angularDamping: 0.28,
      })
      const speed = 1.4 + this.rng() * 2.1
      let svx = vx * 0.12 + Math.cos(angle) * speed
      let svy = vy * 0.12 + Math.abs(Math.sin(angle)) * speed + 0.8
      const mag = Math.hypot(svx, svy)
      if (mag > 6) {
        svx = (svx / mag) * 6
        svy = (svy / mag) * 6
      }
      actor.body.velocity.set(svx, svy, 0)
      actor.body.angularVelocity.set(0, 0, (this.rng() * 2 - 1) * 4)
      actor.body.quaternion.setFromAxisAngle(Z_AXIS, this.rng() * Math.PI * 2)
      this.shardCount += 1
    }
  }

  private onHit(actor: Actor, otherBody: CANNON.Body, contact: CANNON.ContactEquation): void {
    if (!this.acceptDamage || !actor.breakable || actor.broken || actor.queued) return
    const other = this.byBody.get(otherBody)
    if (!other) return
    const impact = Math.abs(contact.getImpactVelocityAlongNormal())
    let damage = 0
    if (impact >= TUNING.minImpact) {
      if (other.kind === 'ball') damage = impact * TUNING.ballScale
      else if (other.kind === 'shard') damage = impact * TUNING.shardScale
      else if (other.static) damage = impact * TUNING.staticScale
      else damage = impact * TUNING.propScale * Math.sqrt(Math.max(other.body.mass, 0.2))
    }
    if (this.impacts.length < 80) {
      this.impacts.push({
        target: actor.id,
        other: other.id,
        impact,
        damage,
        health: actor.health - damage,
      })
    }
    if (damage <= 0) return
    actor.health -= damage
    if (actor.health <= 0) {
      actor.queued = true
      actor.hitVx = other.body.velocity.x
      actor.hitVy = other.body.velocity.y
      this.breakQueue.push(actor)
    }
  }

  private addBounds(): void {
    const { halfW, height } = this.level.field
    this.addBox({
      kind: 'ground',
      x: 0,
      y: -0.28,
      w: halfW * 2 + 1.6,
      h: 0.56,
      d: 2.6,
      color: '#6b4630',
    })
    this.addBox({
      kind: 'wall',
      x: -halfW - 0.16,
      y: height / 2,
      w: 0.32,
      h: height + 0.8,
      d: 2.2,
      color: '#2c241e',
    })
    this.addBox({
      kind: 'wall',
      x: halfW + 0.16,
      y: height / 2,
      w: 0.32,
      h: height + 0.8,
      d: 2.2,
      color: '#2c241e',
    })
  }

  private addObject(object: LevelObject): void {
    if (object.kind === 'pedestal') {
      const radius = (object.w ?? 0.36) / 2
      const height = object.h ?? 1
      const shape = new CANNON.Cylinder(radius, radius * 1.06, height, 8)
      this.makeActor({
        kind: 'pedestal',
        x: object.x,
        y: object.y,
        mass: 0,
        health: 1e9,
        coins: 0,
        required: false,
        breakable: false,
        color: '#7a5136',
        span: { hx: radius, hy: height / 2, hz: radius },
        group: GROUP.static,
        mask: GROUP.prop | GROUP.ball | GROUP.debris,
        material: this.woodMat,
        damping: 0,
        angularDamping: 0,
        shape,
        solid: { hx: radius, hy: height / 2 },
      })
      return
    }
    if (object.kind === 'shelf') {
      this.addBox({
        kind: 'shelf',
        x: object.x,
        y: object.y,
        w: object.w ?? 1,
        h: object.h ?? 0.18,
        d: object.d ?? 1.25,
        color: '#8a5a38',
      })
      return
    }
    if (!isBreakKind(object.kind)) return
    const spec = SPECS[object.kind]
    // Boxes sit still on shelves. cannon-es cylinders are convex hulls and kick off thin platforms.
    const shape = new CANNON.Box(new CANNON.Vec3(spec.halfW, spec.halfH, spec.halfD))
    const required = object.required ?? spec.required
    this.makeActor({
      kind: object.kind,
      x: object.x,
      y: object.y,
      mass: spec.mass,
      health: spec.health,
      coins: spec.coins,
      required,
      breakable: true,
      color: this.colorFor(object.kind),
      span: { hx: spec.halfW, hy: spec.halfH, hz: spec.halfD },
      group: GROUP.prop,
      mask: GROUP.static | GROUP.prop | GROUP.ball | GROUP.debris,
      material: this.materialFor(object.kind),
      damping: 0.05,
      angularDamping: 0.14,
      shape,
    })
  }

  private addBox(opts: {
    kind: Kind
    x: number
    y: number
    w: number
    h: number
    d: number
    color: string
  }): void {
    const hx = opts.w / 2
    const hy = opts.h / 2
    const hz = opts.d / 2
    this.makeActor({
      kind: opts.kind,
      x: opts.x,
      y: opts.y,
      mass: 0,
      health: 1e9,
      coins: 0,
      required: false,
      breakable: false,
      color: opts.color,
      span: { hx, hy, hz },
      group: GROUP.static,
      mask: GROUP.prop | GROUP.ball | GROUP.debris,
      material: this.woodMat,
      damping: 0,
      angularDamping: 0,
      shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
      solid: { hx, hy },
    })
  }

  private makeActor(opts: {
    kind: Kind
    x: number
    y: number
    mass: number
    health: number
    coins: number
    required: boolean
    breakable: boolean
    color: string
    span: Span
    group: number
    mask: number
    material: CANNON.Material
    damping: number
    angularDamping: number
    shape?: CANNON.Shape
    solid?: { hx: number; hy: number }
  }): Actor {
    const shape = opts.shape ?? new CANNON.Sphere(opts.span.hx)
    const body = new CANNON.Body({
      mass: opts.mass,
      shape,
      position: new CANNON.Vec3(opts.x, opts.y, 0),
      material: opts.material,
      linearDamping: opts.damping,
      angularDamping: opts.angularDamping,
      collisionFilterGroup: opts.group,
      collisionFilterMask: opts.mask,
      allowSleep: true,
      sleepSpeedLimit: opts.kind === 'ball' ? 0.4 : 0.28,
      sleepTimeLimit: 0.4,
    })
    lockPlane(body)
    const actor: Actor = {
      id: `${opts.kind}-${this.seq++}`,
      kind: opts.kind,
      required: opts.required,
      coins: opts.coins,
      health: opts.health,
      broken: false,
      queued: false,
      static: opts.mass === 0,
      breakable: opts.breakable,
      body,
      color: opts.color,
      span: opts.span,
      hitVx: 0,
      hitVy: 0,
    }
    if (opts.breakable) {
      body.addEventListener('collide', (event: { body?: CANNON.Body; contact?: CANNON.ContactEquation }) => {
        if (!event.body || !event.contact) return
        this.onHit(actor, event.body, event.contact)
      })
    }
    this.world.addBody(body)
    this.actors.push(actor)
    this.byBody.set(body, actor)
    if (opts.solid) {
      const r = TUNING.ballRadius
      this.solids.push({
        minX: opts.x - opts.solid.hx - r,
        maxX: opts.x + opts.solid.hx + r,
        minY: opts.y - opts.solid.hy - r,
        maxY: opts.y + opts.solid.hy + r,
      })
    }
    return actor
  }

  private removeActor(actor: Actor): void {
    this.world.removeBody(actor.body)
    this.byBody.delete(actor.body)
    const index = this.actors.indexOf(actor)
    if (index >= 0) this.actors.splice(index, 1)
  }

  private materialFor(kind: BreakKind): CANNON.Material {
    if (kind === 'stone') return this.stoneMat
    if (kind === 'crate') return this.woodMat
    return this.clayMat
  }

  private colorFor(kind: BreakKind): string {
    if (kind === 'stone') return '#b7b1a6'
    if (kind === 'crate') return '#c4894f'
    const color = GLAZES[this.glaze % GLAZES.length]
    this.glaze += 1
    return color
  }
}
