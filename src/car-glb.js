import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * N'IMPORTE QUELLE VOITURE EN .glb, pourvu que ses quatre roues soient des
 * objets à part, nommés avant/arrière et gauche/droite (`wheels`, une expression
 * régulière sur le nom : par défaut wheel_front_left, wheel_back_right…).
 * On mesure les roues pour mettre la voiture à l'échelle (`wheelbase`, en
 * mètres), l'orienter (avant vers +z) et la poser au sol, puis chaque roue va
 * sur un pivot pour tourner et braquer.
 *
 * Livrée avec : « Car-16 Peugeot 406 », zairiq (Sketchfab), licence CC BY 4.0
 * (models/peugeot-406.glb, voir models/LICENSES.md).
 */

export const PEUGEOT_406 = { url: new URL('../models/peugeot-406.glb', import.meta.url).href, wheelbase: 2.7 }
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const templates = new Map()

/** Le modèle préparé, chargé une seule fois par URL : rejouer ou changer de décor ne le retélécharge pas. */
export function loadCar(manager, { url, wheelbase = 2.7, wheels = /^wheel_(front|back)_(left|right)$/ } = PEUGEOT_406) {
  if (!templates.has(url)) {
    templates.set(
      url,
      new GLTFLoader(manager)
        .loadAsync(url)
        .then((gltf) => prepare(gltf, wheelbase, wheels))
        .catch((error) => {
          templates.delete(url)
          throw error
        })
    )
  }
  return templates.get(url)
}

function prepare(gltf, wheelbase, wheels) {
  const model = gltf.scene
  model.traverse((object) => {
    if (!object.isMesh) return
    object.castShadow = true
    object.userData.sharedAsset = true
  })
  const holder = new THREE.Group()
  holder.add(model)
  holder.updateMatrixWorld(true)
  const centerOf = (object) => new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
  const wheelNodes = []
  model.traverse((object) => {
    if (wheels.test(object.name)) wheelNodes.push(object)
  })
  const mean = (nodes) => nodes.map(centerOf).reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / nodes.length)
  const front = mean(wheelNodes.filter((w) => w.name.includes('front')))
  const back = mean(wheelNodes.filter((w) => w.name.includes('back')))
  // L'avant vers +z, l'empattement demandé, les roues au sol.
  holder.rotation.y = -Math.atan2(front.x - back.x, front.z - back.z)
  holder.scale.setScalar(wheelbase / front.distanceTo(back))
  holder.updateMatrixWorld(true)
  const middle = mean(wheelNodes)
  const box = new THREE.Box3().setFromObject(holder)
  holder.position.set(-middle.x, -box.min.y, -middle.z)
  const oriented = new THREE.Group()
  oriented.add(holder)
  oriented.updateMatrixWorld(true)
  // Chaque roue sur un pivot à son centre : elle braque (y) puis tourne (x).
  for (const wheel of wheelNodes) {
    const pivot = new THREE.Group()
    pivot.rotation.order = 'YXZ'
    pivot.position.copy(centerOf(wheel))
    oriented.add(pivot)
    pivot.updateMatrixWorld(true)
    pivot.attach(wheel)
    pivot.userData.wheel = true
    pivot.userData.front = wheel.name.includes('front')
  }
  const wheelRadius = new THREE.Box3().setFromObject(wheelNodes[0]).getSize(new THREE.Vector3()).y / 2
  // La caisse, qui plonge et roule ; le pivot, qui avance.
  const body = new THREE.Group()
  body.name = 'body'
  body.add(oriented)
  const pivot = new THREE.Group()
  pivot.add(body)
  pivot.userData.wheelRadius = wheelRadius
  return pivot
}

/** Une voiture de la scène : la copie du modèle préparé, et ce qui l'anime. */
export function createCar(template) {
  const object = template.clone(true)
  const wheelRadius = template.userData.wheelRadius
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
      const spin = (speed / wheelRadius) * dt
      for (const wheel of wheels) wheel.rotation.x += spin
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
