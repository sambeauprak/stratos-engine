/**
 * UN HASARD QUI REDONNE TOUJOURS LE MÊME DÉCOR.
 *
 * Les palmiers, les façades et les chaises sont placés au hasard, mais une
 * graine fixe redessine la même Promenade à chaque course : un joueur qui
 * cherche son meilleur temps doit retrouver les mêmes repères. (mulberry32)
 */
export function random(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
