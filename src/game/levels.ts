import { SPECS, type BreakKind } from './tuning'
import type { LevelDef, LevelObject } from './types'

const FIELD = { halfW: 3.15, height: 12.2 }
const CANNON = { x: 0, y: 0.42 }
const GAP = 0.008

function place(kind: BreakKind, x: number, surface: number, required?: boolean): LevelObject {
  const spec = SPECS[kind]
  return {
    kind,
    x,
    y: surface + spec.halfH + GAP,
    required: required ?? spec.required,
  }
}

/** A short bracket, not a column, so a shot from below can reach the clay. */
function bracket(kind: BreakKind, x: number, top: number, required?: boolean): LevelObject[] {
  const spec = SPECS[kind]
  const height = 0.14
  const width = Math.max(spec.halfW * 1.55, 0.24)
  return [
    { kind: 'shelf', x, y: top - height / 2, w: width, h: height, d: 0.52 },
    place(kind, x, top, required),
  ]
}

function tower(kind: BreakKind, x: number, count: number): LevelObject[] {
  const spec = SPECS[kind]
  const parts: LevelObject[] = []
  let surface = 0
  for (let i = 0; i < count; i++) {
    parts.push(place(kind, x, surface, true))
    surface += spec.halfH * 2 + GAP
  }
  return parts
}

function ledge(
  x: number,
  top: number,
  width: number,
  items: { kind: BreakKind; x: number; required?: boolean }[],
): LevelObject[] {
  const height = 0.18
  const parts: LevelObject[] = [
    { kind: 'shelf', x, y: top - height / 2, w: width, h: height, d: 1.25 },
  ]
  for (const item of items) parts.push(place(item.kind, item.x, top, item.required))
  return parts
}

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Warm Shelf',
    blurb: 'Three pieces out in the open.',
    win: 'First shelf down.',
    field: FIELD,
    cannon: CANNON,
    hint: { angle: 2.1642, power: 0.4 },
    objects: [
      ...bracket('jar', -1.65, 1.75),
      ...bracket('pot', 1.55, 3.2),
      ...bracket('vase', -1.9, 5.15),
    ],
  },
  {
    id: 2,
    name: 'Cup Tower',
    blurb: 'The stack is proud. It should not be.',
    win: 'The stack did not last.',
    field: FIELD,
    cannon: CANNON,
    objects: [...tower('pot', -1.5, 3), ...bracket('vase', 1.75, 4.35)],
  },
  {
    id: 3,
    name: 'Stone Lid',
    blurb: 'The grey one wants a heavier lob.',
    win: 'Heavy work, clean break.',
    field: FIELD,
    cannon: CANNON,
    objects: [
      ...bracket('jar', -1.8, 1.65),
      ...bracket('stone', 0.85, 3.35, true),
      ...bracket('jar', 1.9, 1.8),
      ...bracket('bottle', -1.45, 5.45),
    ],
  },
  {
    id: 4,
    name: 'Balcony Kiln',
    blurb: 'Higher stands, smaller clay.',
    win: 'The balcony is clear.',
    field: FIELD,
    cannon: CANNON,
    objects: [
      ...ledge(-1.85, 2.15, 1.9, [
        { kind: 'pot', x: -2.25 },
        { kind: 'pot', x: -1.35 },
      ]),
      ...bracket('vase', 1.7, 4.55),
      ...bracket('bottle', 0.45, 7.15),
    ],
  },
  {
    id: 5,
    name: 'Last Firing',
    blurb: 'Crates, a stone, and the last glaze.',
    win: 'The yard is clear.',
    field: FIELD,
    cannon: CANNON,
    objects: [
      ...tower('crate', -1.6, 2),
      ...bracket('stone', 1.2, 2.7, true),
      ...bracket('bottle', 1.85, 5.65),
      ...bracket('vase', -1.75, 7.2),
    ],
  },
]

export function levelById(id: number): LevelDef {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0]
}
