import type { BreakKind } from './tuning'

export type Kind = BreakKind | 'pedestal' | 'shelf' | 'wall' | 'ground' | 'ball' | 'shard'

export interface LevelObject {
  kind: BreakKind | 'pedestal' | 'shelf'
  x: number
  y: number
  w?: number
  h?: number
  d?: number
  required?: boolean
}

export interface Aim {
  angle: number
  power: number
}

export interface LevelDef {
  id: number
  name: string
  blurb: string
  win: string
  field: { halfW: number; height: number }
  cannon: { x: number; y: number }
  /** Shown before the player touches the aim. Level 1 uses this as the tutorial shot. */
  hint?: Aim
  objects: LevelObject[]
}

export interface Shot {
  angle: number
  power: number
}
