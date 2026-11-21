import { LEVELS } from './levels'

const KEY = 'lobshot.save.v1'

export interface Save {
  v: 1
  unlocked: number
  coins: number
  best: Record<string, number>
  cleared: number[]
  muted: boolean
}

export function freshSave(): Save {
  return { v: 1, unlocked: 1, coins: 0, best: {}, cleared: [], muted: false }
}

/** Coins a win adds. Replaying a cleared level pays neither smash coins nor the life bonus. */
export function clearPayout(alreadyCleared: boolean, smash: number, bonus: number): number {
  if (alreadyCleared) return 0
  return smash + bonus
}

function clampLevel(id: number): number {
  if (!Number.isInteger(id)) return 1
  return Math.max(1, Math.min(LEVELS.length, id))
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return freshSave()
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return freshSave()
    const record = data as Partial<Save>
    const best: Record<string, number> = {}
    if (record.best && typeof record.best === 'object') {
      for (const [id, value] of Object.entries(record.best)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) best[id] = value
      }
    }
    const cleared = Array.isArray(record.cleared)
      ? record.cleared.filter((id) => Number.isInteger(id) && id >= 1 && id <= LEVELS.length)
      : []
    return {
      v: 1,
      unlocked: clampLevel(typeof record.unlocked === 'number' ? record.unlocked : 1),
      coins: typeof record.coins === 'number' && Number.isFinite(record.coins) ? Math.max(0, record.coins) : 0,
      best,
      cleared,
      muted: record.muted === true,
    }
  } catch {
    return freshSave()
  }
}

export function writeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Private mode and full storage still let the round play; progress just stays in memory.
  }
}
