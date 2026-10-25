/**
 * LES COMMANDES : clavier, écran tactile et manette, fondus en trois valeurs
 * (braquage −1 → 1, accélérateur et frein 0 → 1).
 *
 * CLAVIER AZERTY ET QWERTY : flèches, ZQSD et WASD. Les touches du jeu sont
 * « consommées » (`preventDefault`) : sans ça, Espace activerait le bouton qui
 * a le focus et les flèches feraient défiler la page derrière la fenêtre.
 *
 * MANETTE : stick gauche pour braquer, gâchettes (ou A / B) pour accélérer et
 * freiner. Lue à chaque image, comme l'impose l'API Gamepad.
 */
const LEFT = ['ArrowLeft', 'KeyA', 'KeyQ']
const RIGHT = ['ArrowRight', 'KeyD']
const UP = ['ArrowUp', 'KeyW', 'KeyZ']
const DOWN = ['ArrowDown', 'KeyS']
const BRAKE = ['Space']
const DRIVING = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...BRAKE])
const ACTIONS = { KeyC: 'camera', KeyP: 'pause', KeyR: 'restart' }

export function createInput() {
  const keys = new Set()
  const touch = { left: false, right: false, gas: false, brake: false }
  let action = null

  const held = (codes) => codes.some((code) => keys.has(code))

  const onKeyDown = (event) => {
    if (DRIVING.has(event.code)) {
      event.preventDefault()
      keys.add(event.code)
      return
    }
    if (ACTIONS[event.code] && !event.repeat && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      action?.(ACTIONS[event.code])
    }
  }
  const onKeyUp = (event) => keys.delete(event.code)
  const onBlur = () => {
    keys.clear()
    touch.left = touch.right = touch.gas = touch.brake = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  const gamepad = () => {
    try {
      return [...(navigator.getGamepads?.() ?? [])].find((pad) => pad && pad.connected) ?? null
    } catch {
      return null
    }
  }

  return {
    set onAction(callback) {
      action = callback
    },
    setTouch(name, value) {
      if (name in touch) touch[name] = value
    },
    read() {
      let steer = (held(RIGHT) || touch.right ? 1 : 0) - (held(LEFT) || touch.left ? 1 : 0)
      let throttle = held(UP) || touch.gas ? 1 : 0
      let brake = held(DOWN) || held(BRAKE) || touch.brake ? 1 : 0
      const pad = gamepad()
      if (pad) {
        const axis = pad.axes[0] ?? 0
        if (Math.abs(axis) > 0.15) steer = axis
        throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0)
        brake = Math.max(brake, pad.buttons[6]?.value ?? 0, pad.buttons[1]?.pressed ? 1 : 0)
      }
      return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake }
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }
}
