import * as THREE from 'three'
import { TUNING } from './tuning'
import type { LevelDef } from './types'
import type { Actor } from './sim'

const MAX_DOTS = 36

function profile(kind: string, radius: number, halfH: number): THREE.Vector2[] {
  const r = radius
  const y = halfH
  const pairs: [number, number][] =
    kind === 'vase'
      ? [
          [0.001, -y],
          [r * 0.62, -y],
          [r, -y * 0.42],
          [r * 0.78, y * 0.05],
          [r * 0.42, y * 0.48],
          [r * 0.34, y * 0.78],
          [r * 0.55, y],
          [0.001, y],
        ]
      : kind === 'bottle'
        ? [
            [0.001, -y],
            [r * 0.78, -y],
            [r, -y * 0.42],
            [r * 0.92, -y * 0.02],
            [r * 0.38, y * 0.38],
            [r * 0.34, y * 0.72],
            [r * 0.48, y],
            [0.001, y],
          ]
        : kind === 'pot'
          ? [
              [0.001, -y],
              [r * 0.86, -y],
              [r, -y * 0.2],
              [r * 0.9, y * 0.35],
              [r * 0.48, y * 0.72],
              [r * 0.66, y],
              [0.001, y],
            ]
          : [
              [0.001, -y],
              [r * 0.7, -y],
              [r, -y * 0.4],
              [r * 0.94, y * 0.08],
              [r * 0.58, y * 0.5],
              [r * 0.46, y * 0.76],
              [r * 0.64, y],
              [0.001, y],
            ]
  return pairs.map(([px, py]) => new THREE.Vector2(px, py))
}

export class Stage {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly meshes = new Map<string, THREE.Object3D>()
  private readonly geos = new Map<string, THREE.BufferGeometry>()
  private readonly mats = new Map<string, THREE.Material>()
  private readonly rig: THREE.Group
  private readonly pivot: THREE.Group
  private readonly loaded: THREE.Object3D
  private readonly flash: THREE.Mesh
  private readonly dots: THREE.InstancedMesh
  private readonly dummy = new THREE.Object3D()
  private readonly backboard: THREE.Mesh
  private readonly brick: THREE.CanvasTexture
  private readonly trail: THREE.Line
  private readonly trailPts: THREE.Vector3[] = []
  private readonly base = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly projector = new THREE.Vector3()
  private field: LevelDef['field'] = { halfW: 3.15, height: 12.2 }
  private aspect = 1
  private shake = 0
  private flashT = 0
  private readonly reduce: boolean
  private sawBall = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor(0x1b2438, 1)

    this.scene.background = new THREE.Color(0x1b2438)
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)

    const hemi = new THREE.HemisphereLight(0xffe1c4, 0x243049, 0.9)
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.35)
    sun.position.set(4.2, 11, 9)
    sun.target.position.set(0, 4.5, 0)
    sun.castShadow = true
    const shadow = window.matchMedia('(pointer: coarse)').matches ? 512 : 1024
    sun.shadow.mapSize.set(shadow, shadow)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 36
    sun.shadow.camera.left = -8
    sun.shadow.camera.right = 8
    sun.shadow.camera.top = 8
    sun.shadow.camera.bottom = -8
    sun.shadow.bias = -0.00025
    sun.shadow.normalBias = 0.035
    const rim = new THREE.DirectionalLight(0x9eb4dd, 0.45)
    rim.position.set(-6, 5, 4)
    this.scene.add(hemi, sun, sun.target, rim)

    this.brick = brickTexture()
    this.backboard = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ map: this.brick, roughness: 1, metalness: 0 }),
    )
    this.backboard.receiveShadow = true
    this.scene.add(this.backboard)

    const built = this.buildCannon()
    this.rig = built.rig
    this.pivot = built.pivot
    this.loaded = built.loaded
    this.flash = built.flash
    this.scene.add(this.rig)

    this.dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xf6ead0 }),
      MAX_DOTS,
    )
    this.dots.count = 0
    this.dots.frustumCulled = false
    this.scene.add(this.dots)

    this.trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf6e7c4, transparent: true, opacity: 0.75 }),
    )
    this.trail.frustumCulled = false
    this.trail.visible = false
    this.scene.add(this.trail)

    this.resize()
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const coarse = window.matchMedia('(pointer: coarse)').matches
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75))
    this.renderer.setSize(width, height, false)
    this.aspect = width / Math.max(1, height)
    this.frame()
  }

  setField(level: LevelDef): void {
    this.field = level.field
    // Wider than the alley so landscape screens show kiln wall instead of empty void.
    this.backboard.scale.set(36, level.field.height + 1.6, 1)
    this.backboard.position.set(0, level.field.height / 2 - 0.2, -1.05)
    this.brick.repeat.set(12, level.field.height / 2.4)
    this.frame()
  }

  setCannon(x: number, y: number, angle: number): void {
    this.rig.position.set(x, y, 0)
    this.pivot.rotation.z = angle
  }

  setLoaded(visible: boolean): void {
    this.loaded.visible = visible
  }

  setTrajectory(points: { x: number; y: number }[]): void {
    const count = Math.min(points.length, MAX_DOTS)
    this.dots.count = count
    for (let i = 0; i < count; i++) {
      const point = points[i]
      this.dummy.position.set(point.x, point.y, 0.42)
      this.dummy.scale.setScalar(i === count - 1 ? 1.35 : 0.8)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.updateMatrix()
      this.dots.setMatrixAt(i, this.dummy.matrix)
    }
    this.dots.instanceMatrix.needsUpdate = true
    this.dots.visible = count > 0
  }

  popMuzzle(): void {
    this.flashT = 1
  }

  kick(amount: number): void {
    if (this.reduce) return
    this.shake = Math.min(0.26, this.shake + amount)
  }

  project(x: number, y: number): { x: number; y: number } {
    this.projector.set(x, y, 0).project(this.camera)
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (this.projector.x * 0.5 + 0.5) * rect.width,
      y: (-this.projector.y * 0.5 + 0.5) * rect.height,
    }
  }

  clearDynamics(): void {
    for (const mesh of this.meshes.values()) this.disposeObject(mesh)
    this.meshes.clear()
    this.clearTrail()
  }

  sync(actors: Actor[]): void {
    const seen = new Set<string>()
    let ball = false
    for (const actor of actors) {
      seen.add(actor.id)
      let mesh = this.meshes.get(actor.id)
      if (!mesh) {
        mesh = this.createMesh(actor)
        this.meshes.set(actor.id, mesh)
        this.scene.add(mesh)
      }
      mesh.position.set(actor.body.position.x, actor.body.position.y, actor.body.position.z)
      mesh.quaternion.set(
        actor.body.quaternion.x,
        actor.body.quaternion.y,
        actor.body.quaternion.z,
        actor.body.quaternion.w,
      )
      if (actor.kind === 'ball') {
        ball = true
        this.noteBall(actor.body.position.x, actor.body.position.y)
      }
    }
    const drop: string[] = []
    for (const id of this.meshes.keys()) if (!seen.has(id)) drop.push(id)
    for (const id of drop) {
      const mesh = this.meshes.get(id)
      if (!mesh) continue
      this.disposeObject(mesh)
      this.meshes.delete(id)
    }
    if (!ball && this.sawBall) this.clearTrail()
    this.sawBall = ball
  }

  render(): void {
    if (this.shake > 0.004 && !this.reduce) {
      this.camera.position.set(
        this.base.x + (Math.random() - 0.5) * this.shake,
        this.base.y + (Math.random() - 0.5) * this.shake,
        this.base.z,
      )
      this.shake *= 0.84
    } else {
      this.camera.position.copy(this.base)
      this.shake = 0
    }
    this.camera.lookAt(this.look)
    if (this.flashT > 0.04) {
      this.flash.visible = true
      const scale = 0.25 + this.flashT * 0.55
      this.flash.scale.setScalar(scale)
      const material = this.flash.material
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = this.flashT * 0.8
      this.flashT *= 0.84
    } else {
      this.flash.visible = false
      this.flashT = 0
    }
    this.renderer.render(this.scene, this.camera)
  }

  destroy(): void {
    this.clearDynamics()
    this.renderer.dispose()
    for (const material of this.mats.values()) material.dispose()
    for (const geometry of this.geos.values()) geometry.dispose()
    this.brick.dispose()
  }

  private frame(): void {
    const { halfW, height } = this.field
    const minX = -halfW - 0.42
    const maxX = halfW + 0.42
    const minY = -0.85
    const maxY = height + 0.4
    const worldW = maxX - minX
    const worldH = maxY - minY
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2 + 0.05
    const fov = (30 * Math.PI) / 180
    const distH = worldH / 2 / Math.tan(fov / 2)
    const distW = worldW / 2 / (Math.tan(fov / 2) * this.aspect)
    this.camera.fov = 30
    this.camera.aspect = this.aspect
    this.camera.position.set(cx, cy, Math.max(distH, distW) * 1.02)
    this.camera.lookAt(cx, cy, 0)
    this.camera.updateProjectionMatrix()
    this.base.copy(this.camera.position)
    this.look.set(cx, cy, 0)
  }

  private noteBall(x: number, y: number): void {
    const last = this.trailPts[this.trailPts.length - 1]
    if (last && Math.hypot(last.x - x, last.y - y) < 0.08) return
    this.trailPts.push(new THREE.Vector3(x, y, 0.3))
    if (this.trailPts.length > 8) this.trailPts.shift()
    if (this.trailPts.length > 1) {
      this.trail.geometry.dispose()
      this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPts)
      this.trail.visible = true
    }
  }

  private clearTrail(): void {
    this.trailPts.length = 0
    this.trail.visible = false
  }

  private buildCannon(): { rig: THREE.Group; pivot: THREE.Group; loaded: THREE.Object3D; flash: THREE.Mesh } {
    const wood = this.standard('wood', '#6b422c', 0.86, 0.02)
    const woodDark = this.standard('wood-dark', '#3a2a22', 0.9, 0.04)
    const brass = this.standard('brass', '#e6b25a', 0.32, 0.78)
    const bore = this.standard('bore', '#1a140f', 0.72, 0.08)
    const rig = new THREE.Group()
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.4), wood)
    carriage.position.set(-0.06, -0.2, 0)
    carriage.castShadow = true
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16)
    const wheelA = new THREE.Mesh(wheelGeo, woodDark)
    wheelA.rotation.x = Math.PI / 2
    wheelA.position.set(-0.16, -0.18, 0.16)
    wheelA.castShadow = true
    const wheelB = wheelA.clone()
    wheelB.position.z = -0.16
    const pivot = new THREE.Group()
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.155, 0.9, 18), brass)
    barrel.rotation.z = -Math.PI / 2
    barrel.position.x = 0.36
    barrel.castShadow = true
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.022, 8, 18), brass)
    band.rotation.y = Math.PI / 2
    band.position.x = 0.52
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.03, 8, 18), brass)
    lip.rotation.y = Math.PI / 2
    lip.position.x = 0.8
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), bore)
    hole.rotation.y = Math.PI / 2
    hole.position.x = 0.812
    const loaded = new THREE.Group()
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(TUNING.ballRadius * 0.92, 18, 14),
      this.standard('ball', '#f6f1e6', 0.4, 0.05),
    )
    ball.castShadow = true
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(TUNING.ballRadius * 0.72, 0.022, 6, 16),
      this.standard('stripe', '#e07a45', 0.48, 0.05),
    )
    stripe.rotation.y = Math.PI / 2
    loaded.add(ball, stripe)
    loaded.position.set(0.74, 0, 0)
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe1a8, transparent: true, opacity: 0.8 }),
    )
    flash.position.set(TUNING.muzzle, 0, 0)
    flash.visible = false
    pivot.add(barrel, band, lip, hole, loaded, flash)
    rig.add(carriage, wheelA, wheelB, pivot)
    return { rig, pivot, loaded, flash }
  }

  private createMesh(actor: Actor): THREE.Object3D {
    const { hx, hy, hz } = actor.span
    if (actor.kind === 'jar' || actor.kind === 'pot' || actor.kind === 'vase' || actor.kind === 'bottle') {
      const group = new THREE.Group()
      const geo = this.sharedGeo(actor.kind, () => new THREE.LatheGeometry(profile(actor.kind, hx, hy), 18))
      const body = new THREE.Mesh(geo, this.standard(`glaze-${actor.color}`, actor.color, 0.58, 0.03))
      const lipR = hx * (actor.kind === 'bottle' ? 0.5 : actor.kind === 'vase' ? 0.52 : 0.62)
      const lip = new THREE.Mesh(
        this.sharedGeo(`lip-${actor.kind}`, () => new THREE.TorusGeometry(lipR, 0.018, 6, 16)),
        this.standard(`lip-${actor.color}`, darken(actor.color), 0.4, 0.08),
      )
      lip.rotation.x = Math.PI / 2
      lip.position.y = hy * 0.92
      group.add(body, lip)
      this.cast(group)
      return group
    }
    if (actor.kind === 'stone') {
      const mesh = new THREE.Mesh(
        this.sharedGeo('stone', () => new THREE.IcosahedronGeometry(1, 0)),
        this.standard('stone', actor.color, 0.96, 0.02),
      )
      mesh.scale.set(hx, hy, hz)
      mesh.castShadow = true
      mesh.receiveShadow = true
      return mesh
    }
    if (actor.kind === 'ball') {
      const group = new THREE.Group()
      const ball = new THREE.Mesh(
        this.sharedGeo('ball', () => new THREE.SphereGeometry(TUNING.ballRadius, 18, 14)),
        this.standard('ball', '#f6f1e6', 0.4, 0.05),
      )
      const stripe = new THREE.Mesh(
        this.sharedGeo('ball-stripe', () => new THREE.TorusGeometry(TUNING.ballRadius * 0.78, 0.025, 6, 18)),
        this.standard('stripe', '#e07a45', 0.48, 0.05),
      )
      stripe.rotation.y = Math.PI / 2
      group.add(ball, stripe)
      this.cast(group)
      return group
    }
    if (actor.kind === 'shard') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        this.standard(`glaze-${actor.color}`, actor.color, 0.7, 0.02),
      )
      mesh.userData.disposeGeo = true
      mesh.castShadow = true
      return mesh
    }
    if (actor.kind === 'pedestal') {
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(hx, hx * 1.08, hy * 2, 10),
        this.standard('stand', actor.color, 0.84, 0.03),
      )
      stand.userData.disposeGeo = true
      stand.castShadow = true
      stand.receiveShadow = true
      return stand
    }
    const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2)
    const material =
      actor.kind === 'ground'
        ? this.planks()
        : actor.kind === 'wall'
          ? this.standard('wall', '#2a241e', 0.92, 0.02)
          : this.standard(actor.kind === 'crate' ? 'crate' : 'stand', actor.color, 0.84, 0.03)
    const mesh = new THREE.Mesh(geo, material)
    mesh.userData.disposeGeo = true
    mesh.castShadow = actor.kind !== 'ground'
    mesh.receiveShadow = true
    if (actor.kind === 'ground') mesh.scale.set(5, 1, 1.6)
    return mesh
  }

  private sharedGeo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
    const existing = this.geos.get(key)
    if (existing) return existing
    const geo = build()
    this.geos.set(key, geo)
    return geo
  }

  private standard(key: string, color: string, roughness: number, metalness: number): THREE.MeshStandardMaterial {
    const id = `${key}:${color}:${roughness}`
    const existing = this.mats.get(id)
    if (existing instanceof THREE.MeshStandardMaterial) return existing
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    this.mats.set(id, material)
    return material
  }

  private planks(): THREE.MeshStandardMaterial {
    const existing = this.mats.get('planks')
    if (existing instanceof THREE.MeshStandardMaterial) return existing
    const material = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9, metalness: 0.02 })
    this.mats.set('planks', material)
    return material
  }

  private cast(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }

  private disposeObject(object: THREE.Object3D): void {
    this.scene.remove(object)
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.disposeGeo) child.geometry.dispose()
    })
  }
}

function darken(hex: string): string {
  const color = new THREE.Color(hex)
  color.multiplyScalar(0.72)
  return `#${color.getHexString()}`
}

function brickTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the kiln wall.')
  g.fillStyle = '#1c2740'
  g.fillRect(0, 0, 256, 256)
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : 32
    for (let col = -1; col < 5; col++) {
      g.fillStyle = (col + row) % 2 === 0 ? '#2a3854' : '#33456a'
      g.fillRect(col * 64 + offset + 2, row * 32 + 2, 60, 28)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function plankTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the stage floor.')
  g.fillStyle = '#5c3b28'
  g.fillRect(0, 0, 128, 64)
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 === 0 ? '#7a5238' : '#68462f'
    g.fillRect(0, i * 16, 128, 15)
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(0, i * 16 + 14, 128, 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 2)
  return texture
}
