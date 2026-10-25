import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ROAD_HALF, frameAt, pointAt, ribbon } from '../track.js'
import { random } from '../random.js'
import { SEA_FRAGMENT, SEA_VERTEX, SKY_FRAGMENT, SKY_VERTEX, lampGeometry, place, pushBuilding, ridge } from './parts.js'
import { facadeTextures, roadTexture, sidewalkTexture, signTexture } from '../textures.js'

/**
 * LE DÉCOR DE L'AVENUE DU PRADO, à Marseille.
 *
 * Le profil en travers, symétrique : la chaussée, deux trottoirs plantés de
 * platanes, des immeubles des deux côtés. La fontaine Cantini au départ
 * (Castellane), le Vélodrome au rond-point, Notre-Dame-de-la-Garde sur sa
 * colline, et la mer au bout, avec le David.
 *
 * TOUT CE QUI SE RÉPÈTE EST INSTANCIÉ (platanes, lampadaires) et TOUS LES
 * IMMEUBLES TIENNENT EN UNE GÉOMÉTRIE. Seule la voiture porte des ombres.
 */

/* Le profil en travers, en mètres depuis l'axe. */
export const PROFILE = {
  sidewalk: ROAD_HALF + 6,
  trees: ROAD_HALF + 3,
  front: ROAD_HALF + 7
}

const SEA_LEVEL = -1.55

/* ---------- géométries des objets ---------- */

/* ---------- les immeubles, en une seule géométrie ---------- */

function buildBuildings(path, rand, decor) {
  const target = { position: [], normal: [], uv: [], color: [], index: [] }
  const palette = ['#e9c46a', '#e8a598', '#f1e3c8', '#d98b5f', '#f4d28c', '#e7b7a3', '#efe8da', '#e6c7a1'].map(
    (hex) => new THREE.Color(hex)
  )
  const roof = new THREE.Color('#a9523a')
  for (const side of [-1, 1]) {
    for (const row of [0, 1]) {
      let s = row ? 9 : 0
      while (s < path.length) {
        const width = 16 + rand() * 22
        const depth = 16 + rand() * 10
        const floors = row ? 7 + Math.floor(rand() * 5) : 5 + Math.floor(rand() * 4)
        const frame = frameAt(path, s + width / 2)
        const across = side * (PROFILE.front + depth / 2 + (row ? 30 + rand() * 6 : 0))
        pushBuilding(target, {
          cx: frame.x + frame.rx * across,
          cz: frame.z + frame.rz * across,
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
  const at = (s, u) => pointAt(path, s, u)

  /* --- le sol : la chaussée, deux bordures, deux trottoirs --- */
  const stone = new THREE.MeshStandardMaterial({ color: '#d6cbb8', roughness: 0.95, side: THREE.DoubleSide })
  const road = add(
    new THREE.Mesh(
      ribbon(path, { u0: -ROAD_HALF, u1: ROAD_HALF, y0: 0.02, uvAlong: 12 }),
      new THREE.MeshStandardMaterial({ map: roadTexture(rand, anisotropy), roughness: night ? 0.7 : 0.9, metalness: 0, envMapIntensity: night ? 0.12 : 1 })
    )
  )
  road.receiveShadow = true
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ map: sidewalkTexture(rand, anisotropy), roughness: 0.9 })
  for (const side of [-1, 1]) {
    add(new THREE.Mesh(ribbon(path, { u0: side * ROAD_HALF, u1: side * ROAD_HALF, y0: 0.02, y1: 0.18, step: 4 }), stone))
    const [u0, u1] = side < 0 ? [-PROFILE.sidewalk, -ROAD_HALF] : [ROAD_HALF, PROFILE.sidewalk]
    add(new THREE.Mesh(ribbon(path, { u0, u1, y0: 0.18, uvAcross: 4, uvAlong: 4 }), sidewalkMaterial)).receiveShadow = true
    const [g0, g1] = side < 0 ? [-(ROAD_HALF + 900), -PROFILE.sidewalk] : [PROFILE.sidewalk, ROAD_HALF + 900]
    add(new THREE.Mesh(ribbon(path, { u0: g0, u1: g1, y0: 0.17, step: 8 }), new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 1 })))
  }

  /* --- les platanes, des deux côtés --- */
  const trees = []
  for (const side of [-1, 1]) for (let s = 8 + rand() * 6; s < path.length; s += 11 + rand() * 3) trees.push([s, side * PROFILE.trees])
  const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.42, 1, 7).translate(0, 0.5, 0)
  const crownGeometry = mergeGeometries([
    new THREE.IcosahedronGeometry(3.6, 1),
    new THREE.IcosahedronGeometry(2.8, 1).translate(2.4, -0.6, 0.8),
    new THREE.IcosahedronGeometry(2.6, 1).translate(-2.2, -0.4, -1)
  ])
  const trunks = new THREE.InstancedMesh(trunkGeometry, new THREE.MeshStandardMaterial({ color: '#b8ab92', roughness: 1, flatShading: true }), trees.length)
  const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshStandardMaterial({ color: night ? '#1f4a2a' : '#4f8a3c', roughness: 0.9, flatShading: true }), trees.length)
  trees.forEach(([s, u], i) => {
    const [x, z] = at(s, u)
    const height = 6 + rand() * 2.5
    place(trunks, i, x, 0.18, z, rand() * Math.PI * 2, 1, height, 1)
    const k = 1 + rand() * 0.3
    place(crowns, i, x, 0.18 + height + 2, z, rand() * Math.PI * 2, k, 0.8 * k, k)
  })
  add(trunks)
  add(crowns)

  /* --- les lampadaires --- */
  const lamps = []
  for (let s = 10; s < path.length; s += 32) {
    lamps.push([s, ROAD_HALF + 0.9, -1])
    lamps.push([s + 16, -(ROAD_HALF + 0.9), 1])
  }
  const poles = new THREE.InstancedMesh(lampGeometry(), new THREE.MeshStandardMaterial({ color: '#2c3036', roughness: 0.4, metalness: 0.6 }), lamps.length)
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.18, 0.34), new THREE.MeshBasicMaterial({ color: '#ffffff' }), lamps.length)
  const warm = new THREE.Color('#ffc978').multiplyScalar(2.2)
  const off = new THREE.Color('#dedcd4')
  lamps.forEach(([s, u, direction], i) => {
    const frame = frameAt(path, s)
    const [x, z] = at(s, u)
    const yaw = Math.atan2(frame.rx * direction, frame.rz * direction)
    place(poles, i, x, 0.18, z, yaw)
    const [hx, hz] = at(s, u + direction * 2.35)
    place(heads, i, hx, 0.18 + 6.76, hz, yaw)
    heads.setColorAt(i, decor.lamps === 0 ? off : warm)
  })
  add(poles)
  add(heads)

  /* --- la ville, des deux côtés --- */
  add(buildBuildings(path, rand, decor))

  // Les enseignes du quartier, sur les façades.
  const words = ['BAR TABAC', 'PASTIS', 'BOULANGERIE', 'PHARMACIE', 'PIZZERIA', 'SAVONNERIE', 'CAFÉ', 'OM CAFÉ']
  let sign = 0
  for (let s = 60; s < path.length; s += 110 + rand() * 80) {
    const side = sign % 2 ? 1 : -1
    const frame = frameAt(path, s)
    const [x, z] = at(s, side * (PROFILE.front - 0.3))
    const material = new THREE.MeshBasicMaterial({ map: signTexture(words[sign % words.length], '#f4efe6', sign % 3 ? '#1f3b63' : '#8a2b2b'), transparent: true, depthWrite: false })
    const board = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 2), material))
    board.position.set(x, 4.6 + rand() * 1.5, z)
    board.rotation.y = Math.atan2(-side * frame.rx, -side * frame.rz)
    sign++
  }

  /* --- la fontaine Cantini, au départ (Castellane) --- */
  const marble = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.6 })
  const [fx, fz] = at(40, 0)
  const fountain = [
    [new THREE.CylinderGeometry(13, 13.5, 0.9, 40), marble, 0.45],
    [new THREE.CylinderGeometry(12.2, 12.2, 0.2, 40), new THREE.MeshStandardMaterial({ color: '#3f8fb5', roughness: 0.2 }), 0.85],
    [new THREE.CylinderGeometry(3.2, 4, 3, 16), marble, 2.2],
    [new THREE.CylinderGeometry(0.9, 1.1, 14, 16), marble, 10.5],
    [new THREE.SphereGeometry(1.2, 12, 10), marble, 18.2]
  ]
  for (const [geometry, material, y] of fountain) add(new THREE.Mesh(geometry, material)).position.set(fx, y, fz)

  /* --- le Vélodrome, au rond-point du Prado --- */
  const [vx, vz] = at(2050, -190)
  const bowl = add(new THREE.Mesh(new THREE.CylinderGeometry(105, 110, 26, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9, side: THREE.DoubleSide })))
  bowl.scale.set(1, 1, 0.75)
  bowl.position.set(vx, 13, vz)
  const roofRing = add(new THREE.Mesh(new THREE.TorusGeometry(100, 16, 6, 48), new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.4 })))
  roofRing.rotation.x = Math.PI / 2
  roofRing.scale.set(1, 0.75, 0.45)
  roofRing.position.set(vx, 30, vz)

  /* --- Notre-Dame-de-la-Garde, sur sa colline, droit devant --- */
  const far = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, fog: false })
  const [hx, hz] = [40, 3500] // dans l’axe de la grande ligne droite, vue de tout le boulevard
  const hill = add(new THREE.Mesh(new THREE.SphereGeometry(320, 24, 14), far(night ? '#2a3324' : '#8f9a6c')))
  hill.scale.set(1.1, 0.75, 0.8)
  hill.position.set(hx, -40, hz)
  const summit = -40 + 320 * 0.75
  for (const [geometry, color, y] of [
    [new THREE.BoxGeometry(80, 30, 30), '#e9e2d2', summit + 15],
    [new THREE.BoxGeometry(18, 90, 18), '#e9e2d2', summit + 45],
    [new THREE.CylinderGeometry(5, 6.5, 16, 12), '#e9e2d2', summit + 98],
    [new THREE.ConeGeometry(4.5, 18, 10), '#e0b43a', summit + 115]
  ]) add(new THREE.Mesh(geometry, far(color))).position.set(hx, y, hz)

  /* --- la mer au bout du Prado, et le David --- */
  const end = frameAt(path, path.length)
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
  const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), seaMaterial))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(end.x + end.tx * 4560, SEA_LEVEL, end.z + end.tz * 4560)
  const [dx, dz] = at(path.length - 30, 0)
  for (const [geometry, y] of [
    [new THREE.BoxGeometry(3, 4, 3), 2],
    [new THREE.CylinderGeometry(0.9, 0.7, 5, 10), 6.5],
    [new THREE.SphereGeometry(0.7, 12, 10), 9.6]
  ]) add(new THREE.Mesh(geometry, marble)).position.set(dx, y, dz)

  /* --- au loin : l'Étoile et Marseilleveyre --- */
  add(ridge(path, { u: -1250, from: -2500, to: path.length + 2500, step: 50, low: 110, high: 380, color: decor.ridge.far, seed: 7 }))
  add(ridge(path, { u: 1300, from: -2500, to: path.length + 2500, step: 50, low: 90, high: 300, color: decor.ridge.far, seed: 13 }))

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
      sky.position.copy(camera.position)
    }
  }
}
