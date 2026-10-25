import * as THREE from 'three'

/**
 * LE TRACÉ DU SPRINT — la Promenade des Anglais, d'ouest en est.
 *
 * UNE IMITATION, PAS UN RELEVÉ : la vraie Promenade est presque droite sur
 * sept kilomètres. Ici elle fait deux kilomètres et demi, et ses courbes sont
 * accentuées pour qu'il y ait des virages à négocier. Ce qui est gardé, c'est
 * l'ordre des choses : la mer à droite, la ville à gauche, et la colline du
 * Château au bout.
 *
 * TOUT EST EN MÈTRES, sur le plan (x, z), la voiture partant vers +z. Le côté
 * mer est la droite de la voiture : un décalage latéral `u` positif.
 */

/* Demi-largeur de la chaussée : deux voies dans chaque sens. */
export const ROAD_HALF = 8

/**
 * UN TRACÉ : ses points de passage (x, z) en mètres, ce qui borne le centre de
 * la voiture de chaque côté (`limits`, en mètres depuis l'axe, la droite
 * positive), où commence le chrono (`start`) et combien de route reste après
 * l'arrivée (`endMargin`). Avant le départ et après l'arrivée, de la route en
 * plus : le décor continue, la voiture ne tombe pas dans le vide.
 */

/** La Promenade des Anglais : la mer à droite (bordure après la piste cyclable), le trottoir à gauche. */
export const PROMENADE = {
  limits: { min: -7.05, max: 10.05 },
  start: 150,
  endMargin: 300,
  points: [
  [0, -160],
  [0, 0],
  [4, 200],
  [-12, 420],
  [-50, 560],
  [-70, 660],
  [-40, 780],
  [10, 860],
  [40, 980],
  [44, 1140],
  [20, 1280],
  [-30, 1360],
  [-44, 1470],
  [-10, 1600],
  [40, 1700],
  [70, 1840],
  [60, 2000],
  [20, 2140],
  [0, 2300],
  [18, 2460],
  [70, 2580],
  [140, 2660],
  [220, 2700]
  ]
}

/** L'avenue du Prado, à Marseille, de Castellane vers la mer : un trottoir de chaque côté. */
export const PRADO = {
  limits: { min: -7.05, max: 7.05 },
  start: 150,
  endMargin: 300,
  points: [[0, -160], [0, 0], [0, 500], [3, 1000], [10, 1500], [28, 1900], [70, 2200], [130, 2450], [190, 2700], [240, 2950]]
}

/**
 * Le tracé échantillonné tous les mètres : position, tangente, normale côté
 * mer (`rx`, `rz`) et cap. Tout le reste — la route, le décor, la physique —
 * lit ces échantillons.
 */
export function buildPath({ points, limits, start = 150, endMargin = 300 } = PROMENADE) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal'
  )
  const length = curve.getLength()
  const count = Math.round(length)
  const step = length / count
  const samples = curve.getSpacedPoints(count).map((point, i) => ({
    x: point.x,
    z: point.z,
    s: i * step,
    tx: 0,
    tz: 1,
    rx: -1,
    rz: 0,
    heading: 0
  }))
  for (let i = 0; i < samples.length; i++) {
    const before = samples[Math.max(0, i - 2)]
    const after = samples[Math.min(samples.length - 1, i + 2)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const norm = Math.hypot(dx, dz) || 1
    const sample = samples[i]
    sample.tx = dx / norm
    sample.tz = dz / norm
    // La droite de la voiture : tangente × haut.
    sample.rx = -sample.tz
    sample.rz = sample.tx
    sample.heading = Math.atan2(sample.tx, sample.tz)
  }
  return { samples, length, step, start, end: length - endMargin, limits }
}

/** L'échantillon le plus proche d'une abscisse curviligne. */
export function frameAt(path, s) {
  const i = Math.max(0, Math.min(path.samples.length - 1, Math.round(s / path.step)))
  return path.samples[i]
}

/** Un point (x, z) à l'abscisse `s` et au décalage `u` — prolongé en ligne droite au-delà des bouts. */
export function pointAt(path, s, u = 0) {
  const last = path.samples.length - 1
  let frame
  let extra = 0
  if (s < 0) {
    frame = path.samples[0]
    extra = s
  } else if (s > path.length) {
    frame = path.samples[last]
    extra = s - path.length
  } else {
    frame = frameAt(path, s)
  }
  return [frame.x + frame.tx * extra + frame.rx * u, frame.z + frame.tz * extra + frame.rz * u]
}

/**
 * Où est un point par rapport au tracé : l'échantillon le plus proche,
 * l'abscisse et le décalage latéral. La recherche part de l'indice de la
 * dernière image — la voiture ne parcourt jamais plus de quelques mètres
 * entre deux images.
 */
export function project(path, x, z, hint = 0) {
  const { samples } = path
  const from = Math.max(0, hint - 40)
  const to = Math.min(samples.length - 1, hint + 40)
  let best = Math.max(0, Math.min(samples.length - 1, hint))
  let bestDistance = Infinity
  for (let i = from; i <= to; i++) {
    const sample = samples[i]
    const distance = (x - sample.x) ** 2 + (z - sample.z) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  const sample = samples[best]
  const dx = x - sample.x
  const dz = z - sample.z
  return {
    index: best,
    s: sample.s + dx * sample.tx + dz * sample.tz,
    u: dx * sample.rx + dz * sample.rz,
    rx: sample.rx,
    rz: sample.rz,
    heading: sample.heading
  }
}

/**
 * UN RUBAN LE LONG DU TRACÉ, entre deux décalages latéraux — la chaussée, la
 * piste cyclable, les dalles, la plage. Avec deux hauteurs différentes et un
 * même décalage, c'est un mur (bordure, mur de la plage).
 *
 * `uvAcross` : mètres par répétition en travers (sinon 0 → 1 d'un bord à
 * l'autre) ; `uvAlong` : mètres par répétition en long.
 */
export function ribbon(path, { u0, u1, y0 = 0, y1 = y0, from = 0, to = path.length, step = 2, uvAcross = null, uvAlong = 1 }) {
  const rows = Math.max(1, Math.ceil((to - from) / step))
  const positions = new Float32Array((rows + 1) * 6)
  const uvs = new Float32Array((rows + 1) * 4)
  const index = []
  const across0 = uvAcross ? u0 / uvAcross : 0
  const across1 = uvAcross ? u1 / uvAcross : 1
  for (let row = 0; row <= rows; row++) {
    const s = Math.min(to, from + row * step)
    const frame = frameAt(path, s)
    positions.set(
      [frame.x + frame.rx * u0, y0, frame.z + frame.rz * u0, frame.x + frame.rx * u1, y1, frame.z + frame.rz * u1],
      row * 6
    )
    uvs.set([across0, s / uvAlong, across1, s / uvAlong], row * 4)
    if (row < rows) {
      const a = row * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}
