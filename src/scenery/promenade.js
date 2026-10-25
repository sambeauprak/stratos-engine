import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ROAD_HALF, frameAt, pointAt, ribbon } from '../track.js'
import { random } from '../random.js'
import { SEA_FRAGMENT, SEA_VERTEX, SKY_FRAGMENT, SKY_VERTEX, lampGeometry, place, pushBuilding, ridge } from './parts.js'
import {
  bannerTexture,
  bikeLaneTexture,
  checkerTexture,
  facadeTextures,
  foamTexture,
  glowTexture,
  pavementTexture,
  pebbleTexture,
  roadTexture,
  sidewalkTexture,
  signTexture
} from '../textures.js'

/**
 * LE DÉCOR DE LA PROMENADE DES ANGLAIS.
 *
 * Le profil en travers, de la ville à la mer : immeubles, trottoir, chaussée
 * à deux fois deux voies, piste cyclable, la Promenade elle-même (ses dalles,
 * ses palmiers, ses chaises bleues, sa rambarde), le mur, la plage de galets,
 * l'écume, la baie des Anges. Au loin, les collines et le cap ; au bout, la
 * colline du Château.
 *
 * TOUT CE QUI SE RÉPÈTE EST INSTANCIÉ (palmiers, chaises, lampadaires,
 * poteaux) et TOUS LES IMMEUBLES TIENNENT EN UNE GÉOMÉTRIE : quelques appels
 * de dessin pour des milliers d'objets. Seule la voiture porte des ombres.
 */

/* Le profil en travers, en mètres depuis l'axe (côté mer positif). */
export const PROFILE = {
  bike: ROAD_HALF + 3,
  wall: ROAD_HALF + 14,
  beach: ROAD_HALF + 42,
  sidewalk: ROAD_HALF + 5,
  front: ROAD_HALF + 6.5
}

const SEA_LEVEL = -1.55

/* ---------- géométries des objets ---------- */

function palmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 1, 7, 6, true)
  trunk.translate(0, 0.5, 0)
  const fronds = []
  for (let i = 0; i < 9; i++) {
    const frond = new THREE.PlaneGeometry(0.9, 4.4, 1, 6)
    frond.translate(0, 2.2, 0)
    const points = frond.attributes.position
    for (let v = 0; v < points.count; v++) {
      const t = points.getY(v) / 4.4
      points.setZ(v, -t * t * 1.8)
      points.setX(v, points.getX(v) * (1 - t * 0.7))
    }
    frond.rotateX(-Math.PI / 2 + 0.55)
    frond.rotateY((i / 9) * Math.PI * 2)
    frond.computeVertexNormals()
    fronds.push(frond)
  }
  return { trunk, crown: mergeGeometries(fronds) }
}

/* La chaise bleue de la Promenade : son dossier est derrière (−z), elle
   regarde +z. */
function chairGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.52, 0.05, 0.5).translate(0, 0.45, 0),
    new THREE.BoxGeometry(0.52, 0.56, 0.05).rotateX(-0.28).translate(0, 0.74, -0.27),
    new THREE.BoxGeometry(0.05, 0.25, 0.5).translate(-0.26, 0.6, 0),
    new THREE.BoxGeometry(0.05, 0.25, 0.5).translate(0.26, 0.6, 0)
  ]
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.22, 0.22]) parts.push(new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(x, 0.225, z))
  }
  return mergeGeometries(parts)
}

/* ---------- les immeubles, en une seule géométrie ---------- */

function buildBuildings(path, rand, decor, landmarks) {
  const target = { position: [], normal: [], uv: [], color: [], index: [] }
  const palette = ['#e9c46a', '#e8a598', '#f1e3c8', '#d98b5f', '#f4d28c', '#e7b7a3', '#efe8da', '#e6c7a1'].map(
    (hex) => new THREE.Color(hex)
  )
  const roof = new THREE.Color('#a9523a')
  for (const row of [0, 1]) {
    let s = row ? 9 : 0
    while (s < path.length) {
      const width = 16 + rand() * 22
      const landmark = row === 0 && landmarks.find((l) => s + width > l.s - l.width / 2 - 2 && s < l.s + l.width / 2 + 2)
      if (landmark) {
        s = landmark.s + landmark.width / 2 + 2
        continue
      }
      const depth = 16 + rand() * 10
      const floors = row ? 7 + Math.floor(rand() * 5) : 5 + Math.floor(rand() * 4)
      const frame = frameAt(path, s + width / 2)
      const across = PROFILE.front + depth / 2 + (row ? 30 + rand() * 6 : 0)
      pushBuilding(target, {
        cx: frame.x - frame.rx * across,
        cz: frame.z - frame.rz * across,
        tx: frame.tx,
        tz: frame.tz,
        width,
        depth,
        height: floors * 3.2 + 1.4,
        base: 0.17,
        tint: palette[Math.floor(rand() * palette.length)],
        roof,
        offset: Math.floor(rand() * 8) / 8
      })
      s += width + (rand() < 0.22 ? 5 + rand() * 7 : 0.3)
    }
  }
  for (const landmark of landmarks) {
    const frame = frameAt(path, landmark.s)
    const across = PROFILE.front + landmark.depth / 2
    pushBuilding(target, {
      cx: frame.x - frame.rx * across,
      cz: frame.z - frame.rz * across,
      tx: frame.tx,
      tz: frame.tz,
      width: landmark.width,
      depth: landmark.depth,
      height: landmark.height,
      base: 0.17,
      tint: new THREE.Color(landmark.tint),
      roof: new THREE.Color(landmark.roof),
      offset: 0
    })
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.position, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normal, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.uv, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.color, 3))
  geometry.setIndex(target.index)
  const facade = facadeTextures(rand)
  const material = new THREE.MeshStandardMaterial({
    map: facade.map,
    vertexColors: true,
    roughness: 0.85,
    emissive: new THREE.Color(decor.windows > 0 ? '#ffd9a0' : '#000000'),
    emissiveMap: facade.emissive,
    emissiveIntensity: decor.windows * 1.4
  })
  return new THREE.Mesh(geometry, material)
}

/* ---------- le ciel et la mer ---------- */

/* ---------- la scène ---------- */

export function buildScenery({ path, decor, sunDir, anisotropy }) {
  const rand = random(20260911)
  const group = new THREE.Group()
  const add = (object) => {
    group.add(object)
    return object
  }
  const night = decor.id === 'nuit'
  const sprint = path.end - path.start

  /* --- le sol, de la ville à la plage --- */
  const stone = new THREE.MeshStandardMaterial({ color: '#d6cbb8', roughness: 0.95, side: THREE.DoubleSide })
  const road = add(
    new THREE.Mesh(
      ribbon(path, { u0: -ROAD_HALF, u1: ROAD_HALF, y0: 0.02, uvAlong: 12 }),
      new THREE.MeshStandardMaterial({
        map: roadTexture(rand, anisotropy),
        // L'environnement est une pièce blanche : de nuit, son reflet rasant voilait toute la route.
        roughness: night ? 0.7 : 0.9,
        metalness: 0,
        envMapIntensity: night ? 0.12 : 1
      })
    )
  )
  road.receiveShadow = true
  const bike = add(
    new THREE.Mesh(
      ribbon(path, { u0: ROAD_HALF, u1: PROFILE.bike, y0: 0.02, uvAlong: 6 }),
      new THREE.MeshStandardMaterial({ map: bikeLaneTexture(rand, anisotropy), roughness: 0.9 })
    )
  )
  bike.receiveShadow = true
  add(new THREE.Mesh(ribbon(path, { u0: PROFILE.bike, u1: PROFILE.bike, y0: 0.02, y1: 0.2, step: 4 }), stone))
  const promenade = add(
    new THREE.Mesh(
      ribbon(path, { u0: PROFILE.bike, u1: PROFILE.wall, y0: 0.2, uvAcross: 4, uvAlong: 4 }),
      new THREE.MeshStandardMaterial({ map: pavementTexture(rand, anisotropy), roughness: 0.85 })
    )
  )
  promenade.receiveShadow = true
  add(new THREE.Mesh(ribbon(path, { u0: PROFILE.wall, u1: PROFILE.wall, y0: 0.2, y1: -1.2, step: 4 }), stone))
  add(
    new THREE.Mesh(
      ribbon(path, { u0: PROFILE.wall, u1: PROFILE.beach, y0: -1.2, y1: -1.9, uvAcross: 5, uvAlong: 5, step: 4 }),
      new THREE.MeshStandardMaterial({ map: pebbleTexture(rand, anisotropy), roughness: 1 })
    )
  )
  add(new THREE.Mesh(ribbon(path, { u0: -ROAD_HALF, u1: -ROAD_HALF, y0: 0.02, y1: 0.18, step: 4 }), stone))
  const sidewalk = add(
    new THREE.Mesh(
      ribbon(path, { u0: -PROFILE.sidewalk, u1: -ROAD_HALF, y0: 0.18, uvAcross: 4, uvAlong: 4 }),
      new THREE.MeshStandardMaterial({ map: sidewalkTexture(rand, anisotropy), roughness: 0.9 })
    )
  )
  sidewalk.receiveShadow = true
  add(
    new THREE.Mesh(
      ribbon(path, { u0: -(ROAD_HALF + 900), u1: -PROFILE.sidewalk, y0: 0.17, step: 8 }),
      new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 1 })
    )
  )

  /* --- la baie des Anges --- */
  const middle = frameAt(path, path.length / 2)
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uDeep: { value: new THREE.Color(decor.sea.deep) },
      uShallow: { value: new THREE.Color(decor.sea.shallow) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(decor.sun.color) },
      uFogColor: { value: new THREE.Color(decor.fog.color) },
      uFogNear: { value: decor.fog.near },
      uFogFar: { value: decor.fog.far },
      uTime: { value: 0 },
      uGlitter: { value: decor.sea.glitter }
    },
    vertexShader: SEA_VERTEX,
    fragmentShader: SEA_FRAGMENT
  })
  const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), seaMaterial))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(middle.x + middle.rx * 6500, SEA_LEVEL, middle.z + middle.rz * 6500)

  const foamMap = foamTexture(rand)
  add(
    new THREE.Mesh(
      ribbon(path, { u0: PROFILE.wall + 12, u1: PROFILE.wall + 19, y0: SEA_LEVEL + 0.03, uvAcross: 7, uvAlong: 18, step: 4 }),
      new THREE.MeshBasicMaterial({ map: foamMap, color: decor.sea.foam, transparent: true, opacity: 0.75, depthWrite: false })
    )
  )

  /* --- les palmiers --- */
  const palm = palmGeometries()
  const palms = []
  for (let s = 4; s < path.length; s += 22 + rand() * 6) palms.push([s, PROFILE.bike + 5.5, 0.2])
  for (let s = 12; s < path.length; s += 30 + rand() * 8) palms.push([s, -(ROAD_HALF + 2.6), 0.18])
  const trunks = new THREE.InstancedMesh(
    palm.trunk,
    new THREE.MeshStandardMaterial({ color: '#8a6b4c', roughness: 1, flatShading: true }),
    palms.length
  )
  const crowns = new THREE.InstancedMesh(
    palm.crown,
    new THREE.MeshStandardMaterial({ color: night ? '#1f4a2a' : '#3d7a3a', roughness: 0.8, side: THREE.DoubleSide }),
    palms.length
  )
  palms.forEach(([s, u, base], i) => {
    const [x, z] = pointAt(path, s, u)
    const height = 8 + rand() * 5
    place(trunks, i, x, base, z, rand() * Math.PI * 2, 1, height, 1)
    const crownScale = 1 + rand() * 0.25
    place(crowns, i, x, base + height - 0.1, z, rand() * Math.PI * 2, crownScale, 1 + rand() * 0.2, crownScale)
  })
  add(trunks)
  add(crowns)

  /* --- les chaises bleues, face à la mer --- */
  const seats = []
  for (let s = 6; s < path.length; s += 7) {
    if (rand() < 0.3) continue
    const count = 1 + Math.floor(rand() * 3)
    for (let k = 0; k < count; k++) seats.push([s + k * 0.8, PROFILE.wall - 1.6 - rand() * 0.6, (rand() - 0.5) * 0.5])
  }
  const chairs = new THREE.InstancedMesh(
    chairGeometry(),
    new THREE.MeshStandardMaterial({ color: '#3b8ad9', roughness: 0.55 }),
    seats.length
  )
  seats.forEach(([s, u, jitter], i) => {
    const frame = frameAt(path, s)
    const [x, z] = pointAt(path, s, u)
    place(chairs, i, x, 0.2, z, Math.atan2(frame.rx, frame.rz) + jitter)
  })
  add(chairs)

  /* --- la rambarde au-dessus de la plage --- */
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.5 })
  const postCount = Math.floor(path.length / 2.5)
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0), railMaterial, postCount)
  for (let i = 0; i < postCount; i++) {
    const [x, z] = pointAt(path, i * 2.5, PROFILE.wall - 0.25)
    place(posts, i, x, 0.2, z, 0)
  }
  add(posts)
  add(new THREE.Mesh(ribbon(path, { u0: PROFILE.wall - 0.34, u1: PROFILE.wall - 0.16, y0: 1.22, step: 3 }), railMaterial))

  /* --- les lampadaires, et leurs flaques de lumière --- */
  const lamps = []
  for (let s = 10; s < path.length; s += 32) {
    lamps.push([s, PROFILE.bike + 0.8, -1, 0.2])
    lamps.push([s + 16, -(ROAD_HALF + 0.9), 1, 0.18])
  }
  const poles = new THREE.InstancedMesh(
    lampGeometry(),
    new THREE.MeshStandardMaterial({ color: '#2c3036', roughness: 0.4, metalness: 0.6 }),
    lamps.length
  )
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.18, 0.34), new THREE.MeshBasicMaterial({ color: '#ffffff' }), lamps.length)
  const pools =
    decor.lamps > 0
      ? new THREE.InstancedMesh(
          new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            map: glowTexture(),
            transparent: true,
            opacity: decor.lamps * 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          }),
          lamps.length
        )
      : null
  const warm = new THREE.Color('#ffc978').multiplyScalar(2.2)
  const neon = [new THREE.Color('#ff4fb0').multiplyScalar(3), new THREE.Color('#4fe8ff').multiplyScalar(3)]
  const off = new THREE.Color('#dedcd4')
  lamps.forEach(([s, u, direction, base], i) => {
    const frame = frameAt(path, s)
    const [x, z] = pointAt(path, s, u)
    const yaw = Math.atan2(frame.rx * direction, frame.rz * direction)
    place(poles, i, x, base, z, yaw)
    const [hx, hz] = pointAt(path, s, u + direction * 2.35)
    place(heads, i, hx, base + 6.76, hz, yaw)
    const color = decor.lamps === 0 ? off : night ? neon[i % 2] : warm
    heads.setColorAt(i, color)
    if (pools) {
      const [px, pz] = pointAt(path, s, u + direction * 3.4)
      place(pools, i, px, 0.06, pz, 0)
      pools.setColorAt(i, night ? neon[i % 2] : warm)
    }
  })
  add(poles)
  add(heads)
  if (pools) add(pools)

  /* --- la ville --- */
  const landmarks = [
    { s: path.start + sprint * 0.42, width: 74, depth: 26, height: 7 * 3.2 + 2.4, tint: '#f6f1e8', roof: '#cfc6b6', dome: true },
    { s: path.start + sprint * 0.66, width: 62, depth: 22, height: 6 * 3.2 + 2, tint: '#fbfaf5', roof: '#d9d4c9' }
  ]
  add(buildBuildings(path, rand, decor, landmarks))

  // L'hôtel au dôme rose, sur son angle côté départ.
  const domeMaterial = new THREE.MeshStandardMaterial({ color: '#df6f7a', roughness: 0.45, metalness: 0.1 })
  const drumMaterial = new THREE.MeshStandardMaterial({ color: '#f6f1e8', roughness: 0.8 })
  for (const landmark of landmarks.filter((l) => l.dome)) {
    const frame = frameAt(path, landmark.s)
    const along = -landmark.width / 2 + 10
    const across = -(PROFILE.front + 10)
    const x = frame.x + frame.tx * along + frame.rx * across
    const z = frame.z + frame.tz * along + frame.rz * across
    const top = 0.17 + landmark.height
    const parts = [
      [new THREE.CylinderGeometry(7.5, 7.5, 5, 28), drumMaterial, top + 2.5],
      [new THREE.SphereGeometry(7.8, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial, top + 5],
      [new THREE.CylinderGeometry(0.9, 1.2, 2.6, 12), drumMaterial, top + 13.6],
      [new THREE.ConeGeometry(1.1, 2.4, 12), domeMaterial, top + 16.1]
    ]
    for (const [geometry, material, y] of parts) {
      const mesh = add(new THREE.Mesh(geometry, material))
      mesh.position.set(x, y, z)
    }
  }

  // Les enseignes : des panneaux émaillés le jour, des néons la nuit.
  const words = ['HÔTEL', 'CASINO', 'PLAGE', 'GLACIER', 'CAFÉ', 'CINÉMA', 'OPÉRA', 'BAR']
  let sign = 0
  for (let s = path.start + 90; s < path.end + 60; s += 190 + rand() * 90) {
    if (landmarks.some((l) => Math.abs(l.s - s) < l.width / 2 + 6)) continue
    const frame = frameAt(path, s)
    const [x, z] = pointAt(path, s, -(PROFILE.front - 0.3))
    const glowColor = night ? (sign % 2 ? '#4fe8ff' : '#ff4fb0') : decor.id === 'coucher' ? '#ffd6a3' : '#f4efe6'
    const panel = night ? 'rgba(10, 6, 24, 0.85)' : decor.id === 'coucher' ? '#3a2340' : '#1f3b63'
    const material = new THREE.MeshBasicMaterial({ map: signTexture(words[sign % words.length], glowColor, panel), transparent: true, depthWrite: false })
    if (night) material.color.setScalar(2.2)
    const board = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 2), material))
    board.position.set(x, 8.5 + rand() * 3, z)
    board.rotation.y = Math.atan2(frame.rx, frame.rz)
    sign++
  }

  /* --- les arches de départ et d'arrivée --- */
  const archMaterial = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.5, metalness: 0.4 })
  const arch = (s, title, subtitle) => {
    const frame = frameAt(path, s)
    const gate = new THREE.Group()
    gate.position.set(frame.x, 0, frame.z)
    gate.rotation.y = frame.heading
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.4, 0.7), archMaterial)
      post.position.set(side * (ROAD_HALF + 1.4), 3.7, 0)
      gate.add(post)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 3.5, 1.9, 0.6), archMaterial)
    beam.position.y = 7
    gate.add(beam)
    const bannerMaterial = new THREE.MeshBasicMaterial({ map: bannerTexture(title, subtitle, decor.accent) })
    for (const face of [-1, 1]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 3, 1.6), bannerMaterial)
      banner.position.set(0, 7, face * 0.31)
      banner.rotation.y = face > 0 ? 0 : Math.PI
      gate.add(banner)
    }
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 1.4).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 })
    )
    line.position.y = 0.035
    gate.add(line)
    add(gate)
  }
  arch(path.start, 'DÉPART', 'Promenade des Anglais')
  arch(path.end, 'ARRIVÉE', 'Colline du Château')

  /* --- au loin --- */
  add(ridge(path, { u: -1250, from: -2500, to: path.length + 2500, step: 50, low: 110, high: 380, color: decor.ridge.far, seed: 7 }))
  add(ridge(path, { u: -620, from: -1200, to: path.length + 1200, step: 30, low: 40, high: 150, color: decor.ridge.near, seed: 11 }))
  add(ridge(path, { u: 2200, from: 400, to: path.length + 3200, step: 80, low: 12, high: 60, color: decor.ridge.far, seed: 23 }))

  // La colline du Château, au bout de la course, et ses cyprès.
  const [hillX, hillZ] = pointAt(path, path.end + 230, -130)
  const hill = add(
    new THREE.Mesh(
      new THREE.SphereGeometry(150, 24, 14),
      new THREE.MeshStandardMaterial({ color: night ? '#1f3321' : '#4d7443', roughness: 1, flatShading: true })
    )
  )
  hill.scale.set(1.35, 0.55, 1.1)
  hill.position.set(hillX, -28, hillZ)
  const cypresses = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.4, 13, 7).translate(0, 6.5, 0),
    new THREE.MeshStandardMaterial({ color: night ? '#14241a' : '#2d4a2a', roughness: 1, flatShading: true }),
    60
  )
  for (let i = 0; i < 60; i++) {
    const angle = rand() * Math.PI * 2
    const distance = Math.sqrt(rand()) * 0.8
    const x = hillX + Math.cos(angle) * distance * 150 * 1.35
    const z = hillZ + Math.sin(angle) * distance * 150 * 1.1
    const y = -28 + 150 * 0.55 * Math.sqrt(1 - distance * distance)
    place(cypresses, i, x, y - 1, z, 0, 1, 0.8 + rand() * 0.6, 1)
  }
  add(cypresses)

  /* --- le ciel --- */
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(decor.sky.top) },
      uMiddle: { value: new THREE.Color(decor.sky.middle) },
      uHorizon: { value: new THREE.Color(decor.sky.horizon) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(decor.sun.color) },
      uSunSize: { value: decor.sun.size },
      uStars: { value: decor.stars },
      uTime: { value: 0 }
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT
  })
  const sky = add(new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), skyMaterial))
  sky.renderOrder = -1
  sky.frustumCulled = false

  return {
    group,
    update(time, camera) {
      seaMaterial.uniforms.uTime.value = time
      skyMaterial.uniforms.uTime.value = time
      foamMap.offset.set(Math.sin(time * 0.6) * 0.05, -time * 0.02)
      sky.position.copy(camera.position)
    }
  }
}
