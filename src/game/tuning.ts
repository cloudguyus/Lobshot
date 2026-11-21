/** Tabletop values. Distances are meters and gravity is Earth's, so arcs are real ballistics. */
export const TUNING = {
  gravity: 9.82,
  fixedDt: 1 / 120,
  lives: 5,
  lifeBonus: 5,
  ballRadius: 0.17,
  ballMass: 3.5,
  muzzle: 0.86,
  minSpeed: 6.8,
  maxSpeed: 14.6,
  minImpact: 1.05,
  ballScale: 1,
  shardScale: 0.28,
  staticScale: 1.05,
  propScale: 0.72,
  minAngle: (34 * Math.PI) / 180,
  maxAngle: (146 * Math.PI) / 180,
  shardCap: 32,
}

export const GLAZES = ['#e07a45', '#2a9d8f', '#d4526e', '#3d6fd4', '#e0a04a', '#f0e2cf']

export type BreakKind = 'jar' | 'pot' | 'vase' | 'bottle' | 'stone' | 'crate'

export interface Spec {
  shape: 'cylinder' | 'box'
  radius: number
  halfH: number
  halfW: number
  halfD: number
  mass: number
  health: number
  coins: number
  required: boolean
}

export const SPECS: Record<BreakKind, Spec> = {
  jar: {
    shape: 'cylinder',
    radius: 0.27,
    halfH: 0.32,
    halfW: 0.27,
    halfD: 0.27,
    mass: 0.7,
    health: 2.8,
    coins: 10,
    required: true,
  },
  pot: {
    shape: 'cylinder',
    radius: 0.3,
    halfH: 0.24,
    halfW: 0.3,
    halfD: 0.3,
    mass: 0.55,
    health: 2.55,
    coins: 8,
    required: true,
  },
  vase: {
    shape: 'cylinder',
    radius: 0.23,
    halfH: 0.43,
    halfW: 0.23,
    halfD: 0.23,
    mass: 0.72,
    health: 3.1,
    coins: 15,
    required: true,
  },
  bottle: {
    shape: 'cylinder',
    radius: 0.16,
    halfH: 0.31,
    halfW: 0.16,
    halfD: 0.16,
    mass: 0.28,
    health: 1.7,
    coins: 20,
    required: true,
  },
  stone: {
    shape: 'box',
    radius: 0.32,
    halfH: 0.28,
    halfW: 0.32,
    halfD: 0.3,
    mass: 6.2,
    health: 15,
    coins: 6,
    required: false,
  },
  crate: {
    shape: 'box',
    radius: 0.28,
    halfH: 0.28,
    halfW: 0.28,
    halfD: 0.28,
    mass: 1.3,
    health: 3.3,
    coins: 8,
    required: true,
  },
}

export function isBreakKind(kind: string): kind is BreakKind {
  return kind in SPECS
}
