import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pointAt } from '../track.js'
import { random } from '../random.js'

/**
 * CE QUE TOUS LES DÉCORS PARTAGENT : placer une instance, le lampadaire, les
 * immeubles en une seule géométrie, le relief au loin, et les shaders du ciel
 * et de la mer.
 */

const matrix = new THREE.Matrix4()
const quaternion = new THREE.Quaternion()
const position = new THREE.Vector3()
const scale = new THREE.Vector3()
const euler = new THREE.Euler()

export function place(mesh, i, x, y, z, yaw, sx = 1, sy = 1, sz = 1) {
  euler.set(0, yaw, 0)
  quaternion.setFromEuler(euler)
  position.set(x, y, z)
  scale.set(sx, sy, sz)
  matrix.compose(position, quaternion, scale)
  mesh.setMatrixAt(i, matrix)
}

export function lampGeometry() {
  return mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.11, 6.9, 6).translate(0, 3.45, 0),
    new THREE.BoxGeometry(0.07, 0.07, 2.4).translate(0, 6.88, 1.2)
  ])
}

export function pushQuad(target, corners, normal, uvs, color) {
  const [a, b, c] = corners
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
  const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0
  const base = target.position.length / 3
  corners.forEach((corner, i) => {
    target.position.push(...corner)
    target.normal.push(...normal)
    target.uv.push(...uvs[i])
    target.color.push(color.r, color.g, color.b)
  })
  if (flip) target.index.push(base, base + 2, base + 1, base, base + 3, base + 2)
  else target.index.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

export function pushBuilding(target, { cx, cz, tx, tz, width, depth, height, base, tint, roof, offset }) {
  const rx = -tz
  const rz = tx
  const hw = width / 2
  const hd = depth / 2
  const at = (along, across, y) => [cx + tx * along + rx * across, y, cz + tz * along + rz * across]
  const top = base + height
  // Une travée = 4 m, un étage = 3,2 m, et l'atlas en compte 8 de chaque.
  const u = (m) => m / 32 + offset
  const v = (m) => m / 25.6
  const wall = (length) => [
    [u(0), v(0)],
    [u(length), v(0)],
    [u(length), v(height)],
    [u(0), v(height)]
  ]
  pushQuad(target, [at(-hw, hd, base), at(hw, hd, base), at(hw, hd, top), at(-hw, hd, top)], [rx, 0, rz], wall(width), tint)
  pushQuad(target, [at(hw, -hd, base), at(-hw, -hd, base), at(-hw, -hd, top), at(hw, -hd, top)], [-rx, 0, -rz], wall(width), tint)
  pushQuad(target, [at(-hw, -hd, base), at(-hw, hd, base), at(-hw, hd, top), at(-hw, -hd, top)], [-tx, 0, -tz], wall(depth), tint)
  pushQuad(target, [at(hw, hd, base), at(hw, -hd, base), at(hw, -hd, top), at(hw, hd, top)], [tx, 0, tz], wall(depth), tint)
  const plain = [0.004, 0.996]
  pushQuad(target, [at(-hw, -hd, top), at(hw, -hd, top), at(hw, hd, top), at(-hw, hd, top)], [0, 1, 0], [plain, plain, plain, plain], roof)
}

export function ridge(path, { u, from, to, step, low, high, color, seed }) {
  const rand = random(seed)
  const phases = [rand() * 10, rand() * 10, rand() * 10]
  const positions = []
  const index = []
  let column = 0
  for (let s = from; s <= to; s += step, column++) {
    const [x, z] = pointAt(path, s, u)
    const noise = 0.5 + 0.28 * Math.sin(s * 0.0021 + phases[0]) + 0.16 * Math.sin(s * 0.0063 + phases[1]) + 0.06 * Math.sin(s * 0.019 + phases[2])
    const top = low + (high - low) * Math.max(0, Math.min(1, noise))
    positions.push(x, -10, z, x, top, z)
    if (column > 0) {
      const a = (column - 1) * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }))
}

export const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMiddle;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uMiddle, uTop, smoothstep(0.08, 0.6, h));
    col = mix(uHorizon, col, smoothstep(-0.03, 0.2, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.5, s);
    col += uSunColor * (disc * 2.5 + pow(s, 8.0) * 0.18 + pow(s, 64.0) * 0.45);
    if (uStars > 0.0 && h > 0.0) {
      vec3 q = floor(d * 380.0);
      float star = step(0.9978, hash(q)) * smoothstep(0.02, 0.35, h);
      col += vec3(star) * uStars * (0.55 + 0.45 * sin(uTime * 2.3 + hash(q + 3.1) * 40.0));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const SEA_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const SEA_FRAGMENT = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  uniform float uGlitter;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    float cross1 = cos((p.x + p.y) * 0.19 + t * 1.6);
    float cross2 = cos(p.x * 0.43 - p.y * 0.31 + t * 2.3);
    vec2 slope = vec2(
      cos(p.x * 0.07 + t * 0.8) * 0.07 + cross1 * 0.05 + cross2 * 0.025,
      cos(p.y * 0.09 - t * 1.1) * 0.08 + cross1 * 0.05 - cross2 * 0.02
    );
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    vec3 col = mix(uDeep, uShallow, 0.22 + 0.4 * fresnel);
    vec3 r = reflect(-normalize(uSunDir), n);
    col += uSunColor * pow(max(dot(r, view), 0.0), 220.0) * uGlitter * 2.2;
    col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
