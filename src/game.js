import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import * as stratos from './car.js'
import * as glb from './car-glb.js'
import { decorById, sunDirection } from './decors.js'
import { createInput } from './input.js'
import { buildScenery as promenade } from './scenery/promenade.js'
import { buildScenery as boulevard } from './scenery/boulevard.js'
import { PROMENADE, ROAD_HALF, buildPath, frameAt, project } from './track.js'
import { readBestTimes, saveBestTime } from './storage.js'

export { THREE }
export { PRADO, PROMENADE, frameAt, pointAt, project } from './track.js'
export { DECORS, decorById } from './decors.js'
export { PEUGEOT_406 } from './car-glb.js'

/**
 * STRATOS ENGINE — rendu, physique, caméras, chrono.
 *
 * createGame({ canvas, decorId, track, car, scenery, finishLine, onProgress, onHud, onState, onReady, onStep, pilot })
 *   canvas      : le <canvas> à dessiner (sa taille suit son parent).
 *   decorId     : 'soleil' | 'coucher' | 'nuit' (voir decors.js).
 *   track       : { points, limits, start, endMargin } — PROMENADE (défaut) ou PRADO, ou le tien.
 *   car         : 'stratos' (défaut) ou { url, wheelbase, wheels } pour un .glb aux roues nommées (PEUGEOT_406).
 *   scenery     : 'promenade' (défaut) | 'boulevard' | ta fonction ({ path, decor, sunDir, anisotropy }) → { group, update }.
 *   finishLine  : true (défaut) : la course s'arrête à path.end et garde le meilleur temps.
 *   onProgress  : chargement de la voiture (0 → 1).  onHud : les cadrans, ~15 fois par seconde.
 *   onState     : 'intro' | 'countdown' (3, 2, 1) | 'race' | 'paused' | 'finish' ({ time, best, previous, record }).
 *   onReady     : ({ scene, car, sim, path }) une fois la scène construite — pour y ajouter tes objets.
 *   onStep      : (dt) à chaque image pendant la course — pour ta logique de jeu (sim est lisible).
 *   pilot       : (sim, path) → { steer, throttle, brake } : conduit à la place du joueur (tournage, démo).
 *
 * Un import dynamique de ce fichier garde three.js hors de la page tant qu'on ne joue pas.
 *
 * LA PHYSIQUE EST ARCADE, CALÉE SUR LA STRATOS : environ 5 s de 0 à 100 km/h,
 * 230 km/h en pointe, un modèle « bicyclette » pour la direction, et un
 * braquage qui se réduit avec la vitesse (sinon on tourne sur place à
 * 200 km/h). La piste cyclable freine, les bordures renvoient sur la route.
 *
 * LES ÉTATS : intro (la caméra tourne autour de la voiture) → compte à rebours
 * → course → arrivée. La pause fige tout sauf le rendu.
 */

const CAR = { wheelbase: 2.18, accel: 10.5, vmax: 64, brake: 17, reverse: 6, reverseMax: 6, rolling: 0.35, air: 0.00055, offroad: 3.2 }
const GEARS = [0, 32, 62, 100, 150, 195, 240]
const NO_INPUT = { steer: 0, throttle: 0, brake: 0 }

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

export async function createGame({ canvas, decorId, track = PROMENADE, car: carSpec = 'stratos', scenery: scenerySpec = 'promenade', finishLine = true, onProgress, onHud, onState, onReady, onStep, pilot }) {
  const decor = decorById(decorId)
  const lowPower = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760

  /* --- rendu --- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = decor.exposure
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(decor.fog.color, decor.fog.near, decor.fog.far)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04)
  room.dispose?.()
  scene.environment = environment.texture
  scene.environmentIntensity = decor.env

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000)

  const path = buildPath(track)
  const sunDir = new THREE.Vector3(...sunDirection(decor)).normalize()
  const buildScenery = typeof scenerySpec === 'function' ? scenerySpec : scenerySpec === 'boulevard' ? boulevard : promenade
  const scenery = buildScenery({ path, decor, sunDir, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) })
  scene.add(scenery.group)

  const sun = new THREE.DirectionalLight(decor.sun.color, decor.sun.intensity)
  sun.castShadow = true
  const shadowSize = lowPower ? 1024 : 2048
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 180 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)
  scene.add(new THREE.HemisphereLight(decor.hemi.sky, decor.hemi.ground, decor.hemi.intensity))

  /* --- la voiture --- */
  const manager = new THREE.LoadingManager()
  manager.onProgress = (_url, loaded, total) => onProgress?.(total ? loaded / total : 0)
  const cars = carSpec === 'stratos' ? stratos : glb
  const template = await cars.loadCar(manager, carSpec === 'stratos' ? undefined : carSpec)
  onProgress?.(1)
  const car = cars.createCar(template)
  scene.add(car.object)
  if (decor.headlights) {
    for (const side of [-1, 1]) {
      const beam = new THREE.SpotLight('#ffe7c2', 9, 70, 0.36, 0.7, 1.4)
      beam.position.set(side * 0.6, 0.7, 1.9)
      beam.target.position.set(side * 0.8, 0, 24)
      car.object.add(beam, beam.target)
    }
  }

  /* --- le halo des néons (grand écran seulement) --- */
  let composer = null
  let bloom = null
  if (decor.bloom > 0 && !lowPower) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), decor.bloom, 0.55, decor.bloomThreshold ?? 0.85)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
  }

  const host = canvas.parentElement
  const resize = () => {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    composer?.setSize(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  /* --- la simulation --- */
  const input = createInput()
  const sim = { x: 0, z: 0, heading: 0, speed: 0, steer: 0, accel: 0, index: 0, s: 0, u: 0, time: 0, shake: 0, touching: false }
  const cameraPosition = new THREE.Vector3()
  const cameraTarget = new THREE.Vector3()
  const goal = new THREE.Vector3()
  const look = new THREE.Vector3()
  // Où était la voiture à la dernière image de la caméra — voir updateCamera.
  const cameraAnchor = { x: 0, z: 0 }

  let state = 'idle'
  let resumeState = 'race'
  let stateTime = 0
  let elapsed = 0
  let hudClock = 0
  let lastCount = 3
  let cameraMode = 0
  let best = readBestTimes()[decor.id] ?? null
  let frameId = 0
  let last = 0

  const setState = (next, payload) => {
    state = next
    stateTime = 0
    if (next === 'countdown') lastCount = payload
    onState?.(next, payload)
  }

  const resetCar = () => {
    const s = path.start - 8
    const frame = frameAt(path, s)
    const u = 3.5
    Object.assign(sim, {
      x: frame.x + frame.rx * u,
      z: frame.z + frame.rz * u,
      heading: frame.heading,
      speed: 0,
      steer: 0,
      accel: 0,
      index: Math.round(s / path.step),
      s,
      u,
      time: 0,
      shake: 0,
      touching: false
    })
    cameraPosition.set(sim.x - Math.sin(sim.heading) * 8, 2.4, sim.z - Math.cos(sim.heading) * 8)
    cameraTarget.set(sim.x, 0.8, sim.z)
    cameraAnchor.x = sim.x
    cameraAnchor.z = sim.z
  }

  const drive = (dt, control) => {
    const v = sim.speed
    let a = 0
    if (control.throttle > 0) {
      a += v < -0.2 ? CAR.brake * control.throttle : CAR.accel * control.throttle * Math.pow(Math.max(0, 1 - v / CAR.vmax), 0.85)
    }
    if (control.brake > 0) {
      if (v > 0.3) a -= CAR.brake * control.brake
      else if (state === 'race') a -= CAR.reverse * control.brake
    }
    if (Math.abs(v) > 0.05) {
      const onBikeLane = sim.u > ROAD_HALF ? CAR.offroad : 0
      a -= Math.sign(v) * (CAR.rolling + CAR.air * v * v + onBikeLane)
    }
    let next = v + a * dt
    // Le frein arrête la voiture ; il ne la jette pas en marche arrière d'un coup.
    if (Math.abs(v) > 0.05 && Math.sign(next) !== Math.sign(v)) next = 0
    sim.speed = clamp(next, -CAR.reverseMax, CAR.vmax)
    sim.accel = a

    const pace = Math.abs(sim.speed)
    // Environ 1 rad/s de lacet à 60 km/h, 0,6 à fond : au clavier, on garde la trajectoire.
    const steerMax = 0.45 / (1 + (pace * pace) / 180)
    const target = control.steer * steerMax
    sim.steer += (target - sim.steer) * (1 - Math.exp(-(control.steer === 0 ? 6 : 3.2) * dt))
    sim.heading -= (sim.speed / CAR.wheelbase) * Math.tan(sim.steer) * dt
    sim.x += Math.sin(sim.heading) * sim.speed * dt
    sim.z += Math.cos(sim.heading) * sim.speed * dt

    const where = project(path, sim.x, sim.z, sim.index)
    sim.index = where.index
    sim.s = where.s
    sim.u = where.u

    const limit = where.u > path.limits.max ? path.limits.max : where.u < path.limits.min ? path.limits.min : null
    if (limit !== null) {
      const push = where.u - limit
      sim.x -= where.rx * push
      sim.z -= where.rz * push
      sim.u = limit
      // La bordure remet la voiture dans l'axe de la route, dans le sens où elle roulait.
      const along = Math.cos(angleDelta(sim.heading, where.heading)) >= 0 ? where.heading : where.heading + Math.PI
      const impact = Math.abs(Math.sin(angleDelta(along, sim.heading)))
      sim.heading += angleDelta(along, sim.heading) * Math.min(1, 6 * dt)
      // Le choc coûte selon l'angle : on frotte, on ralentit un peu ; on tape de face, on perd gros.
      if (!sim.touching) {
        sim.speed *= 1 - Math.min(0.55, 0.12 + impact * 0.8)
        sim.shake = Math.min(1, (Math.abs(v) / 30) * (0.3 + impact) + 0.15)
      } else {
        sim.speed *= Math.exp(-0.25 * dt)
      }
      sim.touching = true
    } else {
      sim.touching = false
    }

    // Derrière le départ et loin après l'arrivée : un mur invisible.
    for (const [bound, direction] of [
      [path.start - 30, 1],
      [path.length - 40, -1]
    ]) {
      const beyond = (sim.s - bound) * direction
      if (beyond < 0) {
        const frame = frameAt(path, bound)
        sim.x -= frame.tx * beyond * direction
        sim.z -= frame.tz * beyond * direction
        if (Math.sign(sim.speed) === -direction) sim.speed = 0
      }
    }
  }

  const updateCamera = (dt) => {
    const fx = Math.sin(sim.heading)
    const fz = Math.cos(sim.heading)
    const pace = clamp(Math.abs(sim.speed) / CAR.vmax, 0, 1)
    let k
    if (state === 'intro' || state === 'finish') {
      const intro = state === 'intro'
      const angle = sim.heading + (intro ? -1.2 + stateTime * 0.9 : stateTime * 0.3)
      const radius = intro ? 7.5 : 9.5
      goal.set(sim.x + Math.sin(angle) * radius, intro ? 2.1 : 3, sim.z + Math.cos(angle) * radius)
      look.set(sim.x, 0.8, sim.z)
      k = intro ? 1 : 1 - Math.exp(-2 * dt)
    } else if (cameraMode === 1) {
      goal.set(sim.x + fx * 1.9, 0.95, sim.z + fz * 1.9)
      look.set(sim.x + fx * 30, 0.9, sim.z + fz * 30)
      k = 1
    } else {
      const wide = cameraMode === 2
      const distance = (wide ? 12 : 5.8) + pace * (wide ? 2 : 0.6)
      goal.set(sim.x - fx * distance, (wide ? 4.8 : 2) + pace * 0.3, sim.z - fz * distance)
      look.set(sim.x + fx * 6, wide ? 1.2 : 1, sim.z + fz * 6)
      k = 1 - Math.exp(-7 * dt)
    }
    // LA CAMÉRA AVANCE AVEC LA VOITURE, PUIS SE LISSE. Lisser la position
    // entière la faisait traîner de v/7 mètres — près de 8 m de plus à
    // 190 km/h, et la Stratos filait vers l'horizon. Déplacée d'abord de ce
    // que la voiture vient de parcourir, elle ne lisse plus que l'écart : le
    // balancement dans les virages et les changements de vue.
    const movedX = sim.x - cameraAnchor.x
    const movedZ = sim.z - cameraAnchor.z
    cameraPosition.x += movedX
    cameraPosition.z += movedZ
    cameraTarget.x += movedX
    cameraTarget.z += movedZ
    cameraAnchor.x = sim.x
    cameraAnchor.z = sim.z
    cameraPosition.lerp(goal, k)
    cameraTarget.lerp(look, Math.min(1, k * 1.6))
    camera.position.copy(cameraPosition)
    if (sim.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * sim.shake * 0.35
      camera.position.y += (Math.random() - 0.5) * sim.shake * 0.25
      sim.shake *= Math.exp(-5 * dt)
    }
    camera.lookAt(cameraTarget)
    // +8° à fond et non +14 : l'élargissement vend la vitesse, mais au-delà il
    // rapetissait la voiture d'un quart.
    const fov = cameraMode === 1 ? 68 : 58 + pace * 8
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt))
      camera.updateProjectionMatrix()
    }
  }

  const finish = () => {
    const ms = Math.round(sim.time * 1000)
    const previous = readBestTimes()[decor.id] ?? null
    const record = previous == null || ms < previous
    if (record) {
      saveBestTime(decor.id, ms)
      best = ms
    }
    setState('finish', { time: ms, best: record ? ms : previous, previous, record })
  }

  const emitHud = () => {
    const kmh = Math.round(Math.abs(sim.speed) * 3.6)
    let gear = 'N'
    let rpm = 0
    if (sim.speed < -0.3) {
      gear = 'R'
      rpm = Math.min(1, kmh / 25)
    } else if (kmh >= 1) {
      let g = 1
      while (g < GEARS.length - 1 && kmh >= GEARS[g]) g++
      gear = String(g)
      rpm = clamp((kmh - GEARS[g - 1]) / (GEARS[g] - GEARS[g - 1]), 0, 1)
    }
    onHud?.({
      state,
      kmh,
      gear,
      rpm,
      time: Math.round(sim.time * 1000),
      best,
      progress: clamp((sim.s - path.start) / (path.end - path.start), 0, 1),
      remaining: Math.max(0, Math.round(path.end - sim.s)),
      camera: cameraMode,
      bikeLane: sim.u > ROAD_HALF
    })
  }

  const step = (dt) => {
    elapsed += dt
    stateTime += dt
    if (state === 'intro' && stateTime >= 2.2) setState('countdown', 3)
    if (state === 'countdown') {
      if (stateTime >= 3) setState('race')
      else {
        const count = 3 - Math.floor(stateTime)
        if (count !== lastCount) {
          lastCount = count
          onState?.('countdown', count)
        }
      }
    }
    const control = state === 'race' ? (pilot?.(sim, path) ?? input.read()) : state === 'finish' ? { steer: 0, throttle: 0, brake: 1 } : NO_INPUT
    drive(dt, control)
    if (state === 'race') {
      sim.time += dt
      onStep?.(dt)
      if (finishLine && sim.s >= path.end) finish()
    }
    car.object.position.set(sim.x, 0, sim.z)
    car.object.rotation.y = sim.heading
    car.update(dt, sim.speed, sim.steer, sim.accel)
    updateCamera(dt)
    sun.position.set(sim.x + sunDir.x * 90, sunDir.y * 90 + 2, sim.z + sunDir.z * 90)
    sun.target.position.set(sim.x, 0, sim.z)
    scenery.update(elapsed, camera)
    if (elapsed - hudClock > 0.066) {
      hudClock = elapsed
      emitHud()
    }
  }

  const render = () => {
    if (composer) composer.render()
    else renderer.render(scene, camera)
  }

  const frame = (now) => {
    frameId = requestAnimationFrame(frame)
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    if (state !== 'paused') step(dt)
    render()
  }

  const togglePause = () => {
    if (state === 'paused') {
      state = resumeState
      last = performance.now()
      onState?.(state, state === 'countdown' ? lastCount : undefined)
      return
    }
    if (state !== 'race' && state !== 'countdown') return
    resumeState = state
    state = 'paused'
    onState?.('paused')
  }

  const cycleCamera = () => {
    cameraMode = (cameraMode + 1) % 3
    emitHud()
  }

  const restart = () => {
    resetCar()
    setState('intro')
    emitHud()
  }

  input.onAction = (action) => {
    if (action === 'camera') cycleCamera()
    if (action === 'pause') togglePause()
    if (action === 'restart') restart()
  }

  const onVisibility = () => {
    if (document.hidden && (state === 'race' || state === 'countdown')) togglePause()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onReady?.({ scene, car, sim, path })

  return {
    start() {
      resetCar()
      last = performance.now()
      setState('intro')
      emitHud()
      frameId = requestAnimationFrame(frame)
    },
    restart,
    togglePause,
    cycleCamera,
    setTouch: (name, value) => input.setTouch(name, value),
    dispose() {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      input.dispose()
      document.removeEventListener('visibilitychange', onVisibility)
      scene.traverse((object) => {
        if (object.userData.sharedAsset) return
        object.geometry?.dispose?.()
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
        for (const material of materials) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose()
          material.dispose()
        }
      })
      environment.dispose()
      pmrem.dispose()
      composer?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }
}
