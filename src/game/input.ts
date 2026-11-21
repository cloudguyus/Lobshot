import * as THREE from 'three'
import { clamp, clampAngle } from './ballistics'

/**
 * Drag anywhere on the range: the world point under the pointer sets the angle,
 * and the pixel distance from the cannon sets power. Release fires.
 * Arrows and space are the desktop path.
 */
export class AimInput {
  angle = Math.PI / 2
  power = 0.6
  dragging = false
  keyboard = false
  interacted = false
  enabled = false

  private pointer: number | null = null
  private moved = false
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly hit = new THREE.Vector3()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  private readonly pivot = new THREE.Vector3()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: () => THREE.Camera,
    private readonly cannon: () => { x: number; y: number },
    private readonly handlers: { engage: () => void; change: () => void; fire: () => void },
  ) {
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('contextmenu', this.onMenu)
    window.addEventListener('keydown', this.onKey)
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.canvas.removeEventListener('pointercancel', this.onUp)
    this.canvas.removeEventListener('contextmenu', this.onMenu)
    window.removeEventListener('keydown', this.onKey)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.dragging = false
      this.pointer = null
    }
  }

  reset(angle: number, power: number): void {
    this.angle = clampAngle(angle)
    this.power = clamp(power, 0, 1)
    this.interacted = false
    this.dragging = false
    this.keyboard = false
    this.moved = false
    this.pointer = null
  }

  private onMenu = (event: Event): void => {
    event.preventDefault()
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0 || this.pointer !== null) return
    this.pointer = event.pointerId
    this.dragging = true
    this.moved = false
    this.handlers.engage()
    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch {
      // Some browsers reject capture if the pointer is already gone.
    }
    this.aim(event.clientX, event.clientY)
  }

  private onMove = (event: PointerEvent): void => {
    if (!this.enabled || event.pointerId !== this.pointer) return
    this.aim(event.clientX, event.clientY)
  }

  private onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return
    this.pointer = null
    const shouldFire = this.enabled && this.moved && this.power >= 0.12
    this.dragging = false
    this.moved = false
    if (shouldFire) this.handlers.fire()
  }

  private aim(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera())
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return
    const origin = this.cannon()
    this.angle = clampAngle(Math.atan2(this.hit.y - origin.y, this.hit.x - origin.x))
    this.pivot.set(origin.x, origin.y, 0).project(this.camera())
    const sx = (this.pivot.x * 0.5 + 0.5) * rect.width + rect.left
    const sy = (-this.pivot.y * 0.5 + 0.5) * rect.height + rect.top
    const pixels = Math.hypot(clientX - sx, clientY - sy)
    this.power = clamp((pixels - 18) / 150, 0, 1)
    if (pixels > 24) {
      this.moved = true
      this.interacted = true
    }
    this.handlers.change()
  }

  private onKey = (event: KeyboardEvent): void => {
    if (!this.enabled) return
    const onButton = event.target instanceof HTMLElement && Boolean(event.target.closest('button'))
    if (onButton && (event.key === ' ' || event.key === 'Enter')) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      this.nudge(-0.04, 0)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      this.nudge(0.04, 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.nudge(0, 0.045)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.nudge(0, -0.045)
    } else if (event.key === ' ' || event.key === 'Enter') {
      if (event.repeat) return
      event.preventDefault()
      this.handlers.fire()
    }
  }

  private nudge(dAngle: number, dPower: number): void {
    this.keyboard = true
    this.interacted = true
    this.angle = clampAngle(this.angle + dAngle)
    if (dPower !== 0) this.power = clamp(this.power + dPower, 0.12, 1)
    this.handlers.change()
  }
}
