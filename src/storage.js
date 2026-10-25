/**
 * CE QUE LE JEU GARDE SUR L'APPAREIL : le meilleur temps par décor, et le
 * dernier décor choisi. Rien ne part au serveur. Chaque lecture est protégée :
 * un stockage indisponible (navigation privée, réglages) ne doit pas empêcher
 * de jouer — on repart simplement sans record.
 */
const BEST_KEY = 'codebreak-lancia-best'
const DECOR_KEY = 'codebreak-lancia-decor'

export function readBestTimes() {
  try {
    const value = JSON.parse(localStorage.getItem(BEST_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function saveBestTime(decorId, ms) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ ...readBestTimes(), [decorId]: ms }))
  } catch {
    // Pas de stockage : le record vaut pour cette course seulement.
  }
}

export function readLastDecor() {
  try {
    return localStorage.getItem(DECOR_KEY) || 'coucher'
  } catch {
    return 'coucher'
  }
}

export function saveLastDecor(decorId) {
  try {
    localStorage.setItem(DECOR_KEY, decorId)
  } catch {
    // Sans stockage, on reproposera le décor par défaut.
  }
}

/** 83 456 ms → « 1:23.45 ». */
export function formatTime(ms) {
  if (ms == null) return '—'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor(ms / 1000) % 60
  const hundredths = Math.floor(ms / 10) % 100
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}
