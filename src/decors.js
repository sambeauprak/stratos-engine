/**
 * LES TROIS DÉCORS DU SPRINT.
 *
 * Un décor n'est que des réglages : couleurs du ciel et de la mer, soleil (ou
 * lune), brouillard, et ce qui s'allume la nuit. La scène, elle, est la même
 * — la Promenade des Anglais ne bouge pas quand le soleil se couche.
 *
 * AUCUN IMPORT DE three.js ICI : l'écran d'accueil lit cette liste pour
 * dessiner ses cartes, et il ne doit pas charger le moteur 3D pour ça.
 *
 * `azimuth` : 0 = droit devant, positif vers la mer (à droite de la voiture).
 */
export const DECORS = [
  {
    id: 'soleil',
    label: 'Plein soleil',
    hint: 'Midi en été, mer turquoise',
    swatch: 'linear-gradient(180deg, #2a74c9 0%, #9fd3f2 52%, #33c5d0 53%, #0a5a8a 100%)',
    accent: '#ffd23f',
    sky: { top: '#2a74c9', middle: '#7fbde9', horizon: '#e2f2fa' },
    sun: { elevation: 55, azimuth: 30, color: '#fff2d6', intensity: 3.4, size: 0.004 },
    hemi: { sky: '#cfe6ff', ground: '#bfa27e', intensity: 1.15 },
    fog: { color: '#d7ecf6', near: 320, far: 1900 },
    sea: { deep: '#0a5a8a', shallow: '#33c5d0', foam: '#f2fdff', glitter: 1 },
    ridge: { far: '#8ea4c0', near: '#9fb3c9' },
    env: 0.9,
    exposure: 1,
    windows: 0,
    lamps: 0,
    stars: 0,
    headlights: false,
    bloom: 0
  },
  {
    id: 'coucher',
    label: 'Coucher de soleil',
    hint: 'La baie des Anges en orange',
    swatch: 'linear-gradient(180deg, #27306e 0%, #e3656b 44%, #ffc071 53%, #2a3b73 54%, #1a2350 100%)',
    accent: '#ff8a4c',
    sky: { top: '#27306e', middle: '#e3656b', horizon: '#ffc071' },
    sun: { elevation: 5, azimuth: 52, color: '#ff9a52', intensity: 2.6, size: 0.006 },
    hemi: { sky: '#ffb88a', ground: '#4a3550', intensity: 0.85 },
    fog: { color: '#eea07c', near: 220, far: 1600 },
    sea: { deep: '#1d2f66', shallow: '#c9706a', foam: '#ffe3c4', glitter: 1.7 },
    ridge: { far: '#6a4f7e', near: '#80607f' },
    env: 0.7,
    exposure: 1.05,
    windows: 0.45,
    lamps: 0.55,
    stars: 0,
    headlights: false,
    // Seuil haut : seuls le soleil et les lampadaires brillent, pas le trottoir au soleil rasant.
    bloom: 0.3,
    bloomThreshold: 1.15
  },
  {
    id: 'nuit',
    label: 'Nuit néon',
    hint: 'Lampadaires, reflets, néons roses',
    swatch: 'linear-gradient(180deg, #05020f 0%, #24094a 48%, #ff3ca0 53%, #120a33 54%, #05020f 100%)',
    accent: '#ff3ca0',
    sky: { top: '#05020f', middle: '#24094a', horizon: '#6b1b66' },
    sun: { elevation: 34, azimuth: 24, color: '#aebdff', intensity: 0.4, size: 0.003 },
    hemi: { sky: '#3a2a7a', ground: '#140a24', intensity: 0.4 },
    fog: { color: '#1b0b35', near: 140, far: 1150 },
    sea: { deep: '#06051a', shallow: '#3a1a66', foam: '#ff7ac8', glitter: 0.9 },
    ridge: { far: '#1a1036', near: '#22143f' },
    env: 0.35,
    exposure: 1.15,
    windows: 1,
    lamps: 1,
    stars: 1,
    headlights: true,
    bloom: 0.85,
    bloomThreshold: 0.85
  }
]

export const decorById = (id) => DECORS.find((decor) => decor.id === id) ?? DECORS[0]

/** La direction du soleil, en tableau [x, y, z] — sans three.js. */
export function sunDirection(decor) {
  const elevation = (decor.sun.elevation * Math.PI) / 180
  const azimuth = (decor.sun.azimuth * Math.PI) / 180
  return [-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)]
}
