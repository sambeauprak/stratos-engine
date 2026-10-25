import * as THREE from 'three'

/**
 * LES MATIÈRES DE LA PROMENADE, PEINTES AU CANVAS.
 *
 * Aucune image à télécharger : la chaussée, les dalles, les galets et les
 * façades sont dessinés au lancement, avec le hasard à graine fixe du décor.
 * C'est léger, net à toutes les distances (anisotropie), et ça ne passe par
 * aucun serveur tiers.
 */

function surface(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return [canvas, canvas.getContext('2d')]
}

function toTexture(canvas, { anisotropy = 4, repeat = true } = {}) {
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = anisotropy
  return map
}

function speckle(g, width, height, count, colors, rand, size = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rand() * colors.length)]
    const s = 0.6 + rand() * size
    g.fillRect(rand() * width, rand() * height, s, s)
  }
}

/** La chaussée : 16 m de large (32 px/m), 12 m de long par répétition. */
export function roadTexture(rand, anisotropy) {
  const [canvas, g] = surface(512, 384)
  g.fillStyle = '#3a3c41'
  g.fillRect(0, 0, 512, 384)
  speckle(g, 512, 384, 6000, ['#2f3136', '#45474d', '#50525a', '#34363b'], rand)
  const px = (m) => (m + 8) * 32
  g.fillStyle = '#ecebe4'
  // Les bords, continus.
  g.fillRect(px(-7.7), 0, 6, 384)
  g.fillRect(px(7.7) - 6, 0, 6, 384)
  // Les voies : 3 m peints, 9 m vides.
  for (const u of [-4, 4]) g.fillRect(px(u) - 3, 0, 6, 96)
  // L'axe : deux lignes continues.
  g.fillRect(px(-0.3) - 3, 0, 5, 384)
  g.fillRect(px(0.3) - 2, 0, 5, 384)
  return toTexture(canvas, { anisotropy })
}

/** La piste cyclable, rouge brique, bordée de blanc côté route. */
export function bikeLaneTexture(rand, anisotropy) {
  const [canvas, g] = surface(96, 192)
  g.fillStyle = '#a24a36'
  g.fillRect(0, 0, 96, 192)
  speckle(g, 96, 192, 900, ['#8f3f2e', '#b35a45', '#973f2c'], rand)
  g.fillStyle = '#efe9df'
  g.fillRect(0, 0, 5, 192)
  return toTexture(canvas, { anisotropy })
}

/** Les dalles claires de la Promenade : 4 m par répétition, dalles de 50 cm. */
export function pavementTexture(rand, anisotropy) {
  const [canvas, g] = surface(256, 256)
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const shade = 204 + Math.floor(rand() * 18)
      g.fillStyle = `rgb(${shade + 12}, ${shade + 3}, ${shade - 10})`
      g.fillRect(x, y, 32, 32)
    }
  }
  g.strokeStyle = 'rgba(120, 105, 90, 0.35)'
  g.lineWidth = 1
  for (let i = 0; i <= 256; i += 32) {
    g.beginPath()
    g.moveTo(i + 0.5, 0)
    g.lineTo(i + 0.5, 256)
    g.moveTo(0, i + 0.5)
    g.lineTo(256, i + 0.5)
    g.stroke()
  }
  speckle(g, 256, 256, 1400, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.08)'], rand)
  return toTexture(canvas, { anisotropy })
}

/** Le trottoir côté ville : grandes dalles grises. */
export function sidewalkTexture(rand, anisotropy) {
  const [canvas, g] = surface(256, 256)
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      const shade = 188 + Math.floor(rand() * 16)
      g.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 12})`
      g.fillRect(x, y, 64, 64)
    }
  }
  g.strokeStyle = 'rgba(80, 72, 64, 0.35)'
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath()
    g.moveTo(i + 0.5, 0)
    g.lineTo(i + 0.5, 256)
    g.moveTo(0, i + 0.5)
    g.lineTo(256, i + 0.5)
    g.stroke()
  }
  speckle(g, 256, 256, 1600, ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.06)'], rand)
  return toTexture(canvas, { anisotropy })
}

/** Les galets de la plage de Nice — pas du sable. */
export function pebbleTexture(rand, anisotropy) {
  const [canvas, g] = surface(256, 256)
  g.fillStyle = '#b4a996'
  g.fillRect(0, 0, 256, 256)
  const colors = ['#d9d0c2', '#a39b90', '#8c877e', '#e9e2d7', '#c2b7a5', '#9c9384']
  for (let i = 0; i < 1600; i++) {
    const r = 1.5 + rand() * 4.5
    g.fillStyle = colors[Math.floor(rand() * colors.length)]
    g.beginPath()
    g.ellipse(rand() * 256, rand() * 256, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  return toTexture(canvas, { anisotropy })
}

/**
 * LES FAÇADES NIÇOISES — un atlas de 8 × 8 travées (une fenêtre, un étage).
 *
 * La carte est claire et neutre : la couleur du mur vient de la teinte de
 * chaque immeuble (couleurs de sommet), si bien qu'un seul matériau habille
 * toute la rue. La carte d'émission, alignée case pour case, allume des
 * fenêtres au hasard la nuit.
 *
 * Le coin haut-gauche d'une case est un mur uni : c'est là que pointent les
 * coordonnées des toits.
 */
export function facadeTextures(rand) {
  const tiles = 8
  const tile = 96
  const size = tiles * tile
  const [canvas, g] = surface(size, size)
  const [glowCanvas, glow] = surface(size, size)
  g.fillStyle = '#f4f1ea'
  g.fillRect(0, 0, size, size)
  glow.fillStyle = '#000000'
  glow.fillRect(0, 0, size, size)
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x = tx * tile
      const y = ty * tile
      g.fillStyle = '#e2dccf'
      g.fillRect(x, y + tile - 8, tile, 8)
      const wx = x + 30
      const wy = y + 16
      g.fillStyle = '#ffffff'
      g.fillRect(wx - 4, wy - 4, 44, 64)
      g.fillStyle = '#2b3542'
      g.fillRect(wx, wy, 36, 56)
      g.fillStyle = 'rgba(255, 255, 255, 0.18)'
      g.fillRect(wx + 3, wy + 3, 12, 50)
      g.fillStyle = '#7fa08a'
      g.fillRect(wx - 17, wy, 11, 56)
      g.fillRect(wx + 42, wy, 11, 56)
      g.fillStyle = '#c9c1b4'
      g.fillRect(x + 18, wy + 58, tile - 36, 4)
      if (rand() < 0.42) {
        glow.fillStyle = rand() < 0.5 ? '#ffd28a' : '#ffb870'
        glow.fillRect(wx, wy, 36, 56)
      }
    }
  }
  return { map: toTexture(canvas), emissive: toTexture(glowCanvas) }
}

/** L'écume au bord de l'eau : des lignes blanches parallèles au rivage. */
export function foamTexture(rand) {
  const [canvas, g] = surface(128, 256)
  for (let line = 0; line < 7; line++) {
    const x0 = 8 + line * 17 + rand() * 6
    g.strokeStyle = `rgba(255, 255, 255, ${0.25 + rand() * 0.55})`
    g.lineWidth = 1.5 + rand() * 2
    g.beginPath()
    for (let y = 0; y <= 256; y += 8) g.lineTo(x0 + Math.sin(y * 0.05 + line) * 4, y)
    g.stroke()
  }
  return toTexture(canvas)
}

/** Un halo rond, pour les flaques de lumière des lampadaires. */
export function glowTexture() {
  const [canvas, g] = surface(128, 128)
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.35)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  g.fillStyle = gradient
  g.fillRect(0, 0, 128, 128)
  return toTexture(canvas, { repeat: false })
}

/** Une enseigne : un mot, une couleur, un panneau. */
export function signTexture(word, color, panel) {
  const [canvas, g] = surface(512, 128)
  g.fillStyle = panel
  g.beginPath()
  g.roundRect(6, 6, 500, 116, 18)
  g.fill()
  g.font = 'italic 800 76px Poppins, "Helvetica Neue", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = color
  g.shadowBlur = 22
  g.fillStyle = color
  g.fillText(word, 256, 68)
  return toTexture(canvas, { repeat: false })
}

/** La banderole des arches de départ et d'arrivée. */
export function bannerTexture(title, subtitle, accent) {
  const [canvas, g] = surface(1024, 96)
  g.fillStyle = '#0d0e12'
  g.fillRect(0, 0, 1024, 96)
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffffff' : '#0d0e12'
      g.fillRect(i * 12, j * 24, 12, 24)
      g.fillRect(1024 - 144 + i * 12, j * 24, 12, 24)
    }
  }
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.fillStyle = '#ffffff'
  g.font = 'italic 800 52px Poppins, "Helvetica Neue", Arial, sans-serif'
  g.fillText(title, 512, 40)
  g.fillStyle = accent
  g.font = '600 20px "JetBrains Mono", Menlo, monospace'
  g.fillText(subtitle.toUpperCase(), 512, 78)
  return toTexture(canvas, { repeat: false })
}

/** Le damier de la ligne. */
export function checkerTexture() {
  const [canvas, g] = surface(320, 32)
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#f5f5f0' : '#16171b'
      g.fillRect(i * 16, j * 16, 16, 16)
    }
  }
  return toTexture(canvas, { repeat: false })
}
