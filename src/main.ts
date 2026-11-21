import './style.css'
import { Game } from './game/Game'

const canvas = document.querySelector<HTMLCanvasElement>('#c')
const fallback = document.querySelector<HTMLElement>('#fallback')

function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

if (!canvas || !fallback || !hasWebGL()) {
  if (fallback) fallback.hidden = false
} else {
  try {
    const game = new Game(canvas)
    game.start()
    if (import.meta.hot) import.meta.hot.dispose(() => game.destroy())
  } catch (error) {
    console.error(error)
    fallback.hidden = false
  }
}
