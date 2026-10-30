// Découpe uniquement les groupes du SVG téléchargé. Aucun tracé n’est recalculé.
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync(new URL('../src/assets/loumi-master.svg', import.meta.url), 'utf8')
const head = svg.match(/<g id="T[^>]*>([\s\S]*?)<\/g>/)?.[1]?.trim()
const eyes = [...svg.matchAll(/<path id="[^"]*"[^>]*\/>/g)].map(match => match[0])
if (!head || eyes.length !== 2 || !svg.includes('width="114" height="164"')) {
  throw new Error('Structure SVG Figma inattendue : vérifier l’export avant de le modifier.')
}
const artwork = { head, dash: eyes[0], ring: eyes[1] }
writeFileSync(new URL('../src/mascot/artwork.ts', import.meta.url),
  '// Généré depuis src/assets/loumi-master.svg par scripts/prepare-artwork.mjs.\n' +
  '// Les tracés, traits et couleurs Figma sont conservés à l’identique.\n' +
  'export const ARTWORK = ' + JSON.stringify(artwork, null, 2) + ' as const\n')
