import { TUNING } from './tuning'

export interface Aabb {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function clampAngle(angle: number): number {
  return clamp(angle, TUNING.minAngle, TUNING.maxAngle)
}

export function speedFromPower(power: number): number {
  return TUNING.minSpeed + clamp(power, 0, 1) * (TUNING.maxSpeed - TUNING.minSpeed)
}

export function powerFromSpeed(speed: number): number {
  return clamp((speed - TUNING.minSpeed) / (TUNING.maxSpeed - TUNING.minSpeed), 0, 1)
}

export function muzzleOf(cannon: { x: number; y: number }, angle: number): { x: number; y: number } {
  return {
    x: cannon.x + Math.cos(angle) * TUNING.muzzle,
    y: cannon.y + Math.sin(angle) * TUNING.muzzle,
  }
}

export function pointInAabb(x: number, y: number, box: Aabb): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY
}

/** Semi-implicit Euler, matching cannon-es gravity integration closely enough for a preview. */
export function flightPath(
  cannon: { x: number; y: number },
  angle: number,
  power: number,
  solids: Aabb[],
): { x: number; y: number }[] {
  const speed = speedFromPower(power)
  const origin = muzzleOf(cannon, angle)
  let x = origin.x
  let y = origin.y
  let vx = Math.cos(angle) * speed
  let vy = Math.sin(angle) * speed
  const dt = 1 / 30
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < 36; i++) {
    vy -= TUNING.gravity * dt
    x += vx * dt
    y += vy * dt
    if (y < TUNING.ballRadius) break
    let blocked = false
    for (const solid of solids) {
      if (pointInAabb(x, y, solid)) {
        blocked = true
        break
      }
    }
    if (blocked) break
    points.push({ x, y })
  }
  return points
}

/**
 * Angles that lob a point mass from (x0, y0) through (x1, y1) at a given speed.
 * Returns radians in world space, +x is right and +y is up.
 */
export function anglesFromPoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  speed: number,
  gravity = TUNING.gravity,
): number[] {
  const x = x1 - x0
  const y = y1 - y0
  if (Math.abs(x) < 1e-4) {
    if (y <= 0) return []
    if (speed * speed < 2 * gravity * y) return []
    return [Math.PI / 2]
  }
  const v2 = speed * speed
  const a = (gravity * x * x) / (2 * v2)
  const b = -x
  const c = y + (gravity * x * x) / (2 * v2)
  const disc = b * b - 4 * a * c
  if (disc < 0 || Math.abs(a) < 1e-8) return []
  const root = Math.sqrt(disc)
  const angles: number[] = []
  for (const u of [(-b + root) / (2 * a), (-b - root) / (2 * a)]) {
    if (!Number.isFinite(u)) continue
    let angle = Math.atan(u)
    if (x < 0) angle += Math.PI
    if (angle < 0) angle += Math.PI * 2
    angles.push(angle)
  }
  return angles
}
