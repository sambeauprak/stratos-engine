import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * LA LANCIA STRATOS.
 *
 * Modèle : « Lancia Stratos HF – Rally – Alitalia Livery », James Slater
 * (Sketchfab), licence CC BY 4.0 : à créditer à l'écran (voir models/LICENSES.md).
 * Recompressé pour le web (textures WebP, 5,6 Mo au lieu de 51) : models/stratos.glb.
 *
 * LES ROUES NE SONT PAS DES OBJETS À PART dans le fichier : pneus et jantes
 * sont fondus dans deux maillages (« tyre » et « mechanical »). On les en
 * extrait au chargement, triangle par triangle, autour de chaque centre de
 * roue — la méthode de wheels.js dans le projet d'origine — pour pouvoir les
 * faire tourner et braquer.
 *
 * REPÈRE DU FICHIER : unités en centimètres, l'avant vers −x, la largeur sur
 * z. On le ramène au repère du jeu : mètres, avant vers +z, roues au sol.
 */

const MODEL_URL = new URL('../models/stratos.glb', import.meta.url).href
const UNIT = 0.01
const WHEEL_RADIUS = 0.3065
const WHEELS = {
  RL: [-111.1, -33, 4.7],
  FL: [106.4, -33, 5.6],
  RR: [-111.1, -33, -145.8],
  FR: [106.4, -33, -146.7]
}
const RIM_RADIUS = 30.6
const RIM_HALF_WIDTH = 16

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

let templatePromise = null

/** Le modèle préparé, chargé une seule fois : rejouer ou changer de décor ne le retélécharge pas. */
export function loadCar(manager) {
  if (!templatePromise) {
    templatePromise = new GLTFLoader(manager)
      .loadAsync(MODEL_URL)
      .then(prepare)
      .catch((error) => {
        templatePromise = null
        throw error
      })
  }
  return templatePromise
}

function centroid(position, index, triangle) {
  let x = 0
  let y = 0
  let z = 0
  for (let k = 0; k < 3; k++) {
    const i = index.getX(triangle * 3 + k)
    x += position.getX(i)
    y += position.getY(i)
    z += position.getZ(i)
  }
  return [x / 3, y / 3, z / 3]
}

/* Un sous-maillage fait des triangles choisis, recentré sur le centre de la roue. */
function extract(source, triangles, center) {
  const remap = new Map()
  const index = []
  for (const triangle of triangles) {
    for (let k = 0; k < 3; k++) {
      const vertex = source.index.getX(triangle * 3 + k)
      if (!remap.has(vertex)) remap.set(vertex, remap.size)
      index.push(remap.get(vertex))
    }
  }
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize
    const array = new Float32Array(remap.size * size)
    for (const [vertex, target] of remap) {
      array[target * size] = attribute.getX(vertex)
      if (size > 1) array[target * size + 1] = attribute.getY(vertex)
      if (size > 2) array[target * size + 2] = attribute.getZ(vertex)
      if (size > 3) array[target * size + 3] = attribute.getW(vertex)
    }
    if (name === 'position') {
      for (let i = 0; i < remap.size; i++) {
        array[i * 3] -= center[0]
        array[i * 3 + 1] -= center[1]
        array[i * 3 + 2] -= center[2]
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized))
  }
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return geometry
}

function tagWheel(mesh, center) {
  mesh.position.set(...center)
  mesh.castShadow = true
  mesh.frustumCulled = false
  mesh.userData.wheel = true
  // Les roues directrices sont à −x : l'avant du modèle.
  mesh.userData.front = center[0] < 0
  mesh.userData.sharedAsset = true
}

function splitWheels(tyre, mechanical) {
  // Les pneus : quatre groupes, selon la position de chaque triangle.
  {
    const { position } = tyre.geometry.attributes
    const { index } = tyre.geometry
    const groups = { RL: [], FL: [], RR: [], FR: [] }
    for (let t = 0; t < index.count / 3; t++) {
      const c = centroid(position, index, t)
      groups[(c[0] > -2.4 ? 'F' : 'R') + (c[2] > -70.6 ? 'L' : 'R')].push(t)
    }
    for (const [key, triangles] of Object.entries(groups)) {
      const mesh = new THREE.Mesh(extract(tyre.geometry, triangles, WHEELS[key]), tyre.material)
      tagWheel(mesh, WHEELS[key])
      tyre.add(mesh)
    }
    tyre.geometry.setIndex([])
  }
  // Les jantes : les triangles du mécanique qui tombent dans chaque roue.
  {
    const { position } = mechanical.geometry.attributes
    const { index } = mechanical.geometry
    const count = index.count / 3
    const claimed = new Set()
    for (const center of Object.values(WHEELS)) {
      const triangles = []
      for (let t = 0; t < count; t++) {
        const c = centroid(position, index, t)
        if (Math.hypot(c[0] - center[0], c[1] - center[1]) < RIM_RADIUS && Math.abs(c[2] - center[2]) < RIM_HALF_WIDTH) {
          triangles.push(t)
        }
      }
      const mesh = new THREE.Mesh(extract(mechanical.geometry, triangles, center), mechanical.material)
      tagWheel(mesh, center)
      mechanical.add(mesh)
      for (const t of triangles) claimed.add(t)
    }
    const kept = []
    for (let t = 0; t < count; t++) {
      if (claimed.has(t)) continue
      kept.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2))
    }
    mechanical.geometry.setIndex(kept)
  }
}

function prepare(gltf) {
  const root = gltf.scene
  let tyre = null
  let mechanical = null
  root.traverse((object) => {
    if (!object.isMesh) return
    object.castShadow = true
    object.userData.sharedAsset = true
    if (object.name.includes('tyre_0')) tyre = object
    if (object.name.includes('mechanical_0')) mechanical = object
    if (object.material && object.name.includes('bodywork')) object.material.envMapIntensity = 1.4
  })
  if (tyre && mechanical) splitWheels(tyre, mechanical)

  root.scale.setScalar(UNIT)
  // PAS DE RECENTRAGE ICI : le nœud « Object_4 » du fichier porte déjà la
  // translation (6.5, 63.6, 70.5) qui pose les roues à y = 0 et centre la
  // caisse. La réappliquer faisait flotter la voiture 64 cm au-dessus de la
  // route, et la décalait de 70 cm sur le côté.
  // L'avant du modèle (−x) vers l'avant du jeu (+z).
  const oriented = new THREE.Group()
  oriented.rotation.y = Math.PI / 2
  oriented.add(root)
  // La caisse, qui plonge et roule ; le pivot, qui avance.
  const body = new THREE.Group()
  body.name = 'body'
  body.add(oriented)
  const pivot = new THREE.Group()
  pivot.add(body)
  return pivot
}

/** Une Stratos de la scène : la copie du modèle préparé, et ce qui l'anime. */
export function createCar(template) {
  const object = template.clone(true)
  const body = object.getObjectByName('body')
  const wheels = []
  const steering = []
  object.traverse((child) => {
    if (!child.userData.wheel) return
    wheels.push(child)
    if (child.userData.front) steering.push(child)
  })
  let pitch = 0
  let roll = 0
  return {
    object,
    update(dt, speed, steer, acceleration) {
      const spin = (speed / WHEEL_RADIUS) * dt
      for (const wheel of wheels) wheel.rotation.z += spin
      // Braquer à droite, dans le repère du modèle, c'est tourner autour de y en négatif.
      for (const wheel of steering) wheel.rotation.y = clamp(-steer * 1.4, -0.6, 0.6)
      const k = 1 - Math.exp(-6 * dt)
      pitch += (clamp(-acceleration * 0.0035, -0.03, 0.03) - pitch) * k
      roll += (clamp(-steer * speed * 0.004, -0.05, 0.05) - roll) * k
      body.rotation.x = pitch
      body.rotation.z = roll
    }
  }
}
