// La démo peut aussi être ouverte directement, sans serveur ni connexion.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const directory = resolve('dist')
let html = readFileSync(resolve(directory, 'index.html'), 'utf8')
const readAsset = relative => {
  const path = resolve(directory, relative)
  if (dirname(path) !== resolve(directory, 'assets')) throw new Error('Ressource hors du dossier de compilation.')
  return readFileSync(path, 'utf8')
}
let scripts = 0
let styles = 0
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_, path) => {
  scripts++
  return '<script type="module">\n' + readAsset(path).replace(/<\/script/gi, '<\\/script') + '\n</script>'
})
html = html.replace(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/g, (_, path) => {
  styles++
  return '<style>\n' + readAsset(path) + '\n</style>'
})
if (scripts !== 1 || styles !== 1 || /(?:src|href)="\.\/assets\//.test(html)) {
  throw new Error('La démo autonome contient encore une dépendance externe.')
}
writeFileSync(resolve(directory, 'loumi-demo.html'), html)
console.log('Démo autonome : dist/loumi-demo.html')
