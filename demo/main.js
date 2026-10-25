import { createGame, PEUGEOT_406, PRADO } from '../src/game.js'
import { formatTime } from '../src/storage.js'

const $ = (id) => document.getElementById(id)
let game = null

async function launch(decorId, prado) {
  $('menu').hidden = true
  game?.dispose()
  game = await createGame({
    canvas: $('scene'),
    decorId,
    track: prado ? PRADO : undefined,
    car: prado ? PEUGEOT_406 : 'stratos',
    scenery: prado ? 'boulevard' : 'promenade',
    onHud: (hud) => {
      $('time').textContent = formatTime(hud.time)
      $('speed').textContent = `${hud.kmh} km/h`
    },
    onState: (state, payload) => {
      $('count').textContent = state === 'countdown' ? payload : state === 'race' ? 'GO' : state === 'paused' ? 'PAUSE' : ''
      if (state === 'race') setTimeout(() => ($('count').textContent = ''), 700)
      if (state === 'finish') {
        $('count').textContent = `${formatTime(payload.time)}${payload.record ? ' · record !' : ''}`
        setTimeout(() => ($('menu').hidden = false), 2500)
      }
    }
  })
  game.start()
}

for (const button of document.querySelectorAll('#menu button')) {
  button.addEventListener('click', () => launch(button.dataset.decor, button.dataset.track === 'prado'))
}

// ?decor=nuit&track=prado&auto : lance tout de suite, et un pilote suit la route (tournage, tests).
const params = new URLSearchParams(location.search)
if (params.has('decor')) {
  const auto = params.has('auto')
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
  const original = launch
  const prado = params.get('track') === 'prado'
  $('menu').hidden = true
  game?.dispose()
  import('../src/game.js').then(async ({ createGame, pointAt }) => {
    game = await createGame({
      canvas: $('scene'),
      decorId: params.get('decor'),
      track: prado ? PRADO : undefined,
      car: prado ? PEUGEOT_406 : 'stratos',
      scenery: prado ? 'boulevard' : 'promenade',
      onHud: (hud) => {
        $('time').textContent = formatTime(hud.time)
        $('speed').textContent = `${hud.kmh} km/h`
      },
      onState: (state, payload) => {
        $('count').textContent = state === 'countdown' ? payload : state === 'race' ? 'GO' : ''
        if (state === 'race') setTimeout(() => ($('count').textContent = ''), 700)
        if (state === 'finish') $('count').textContent = formatTime(payload.time)
      },
      pilot: auto
        ? (sim, path) => {
            const [x, z] = pointAt(path, sim.s + 12, 2.5)
            const err = angleDelta(Math.atan2(x - sim.x, z - sim.z), sim.heading)
            return { steer: Math.max(-1, Math.min(1, -err * 3)), throttle: sim.speed < 40 ? 1 : 0, brake: 0 }
          }
        : undefined
    })
    game.start()
    void original
  })
}
