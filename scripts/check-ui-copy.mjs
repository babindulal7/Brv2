import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const forbidden = /§|\bLaw\s+\d+|\blib\/|TODO|⭐|query module|\bschema\b|\b(?:booking_lines|booking_transport|booking_stage_transitions|document_registry|security_deposits|deposit_movements)\b/i
const copyKeys = /^(title|description|reason|message|label|hint|note|tooltip|subtitle|emptyMessage|emptyTitle)$/

export function copyViolations(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  function visit(node) {
    const literal = ts.isStringLiteralLike(node) || ts.isJsxText(node) || node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail
    if (literal && forbidden.test(node.text)) {
      let parent = node.parent
      let rendered = false
      while (parent) {
        if (ts.isImportTypeNode(parent) || (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)) break
        if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxFragment(parent)) { rendered = true; break }
        if (ts.isPropertyAssignment(parent) && copyKeys.test(parent.name.getText(tree).replace(/['"]/g, ''))) { rendered = true; break }
        if (ts.isVariableDeclaration(parent) && /(?:NOTE|UNAVAILABLE|NOT_TRACKED|NOT_BUILT|REASON|COPY|MESSAGE|LABEL|HINT|FOOTER)$/.test(parent.name.getText(tree))) { rendered = true; break }
        if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) break
        parent = parent.parent
      }
      if (rendered) found.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, start: node.getStart(tree), end: node.end, kind: ts.isJsxText(node) ? 'text' : 'string', text: node.text.trim() })
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

export function scanUiCopy(root = 'src') {
  const found = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'archive' || entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'mock') continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.tsx?$/.test(file) && !/\.test\./.test(file)) found.push(...copyViolations(file, fs.readFileSync(file, 'utf8')))
    }
  }
  walk(root)
  return found
}

if (process.argv[1]?.endsWith('check-ui-copy.mjs')) {
  const found = scanUiCopy()
  for (const hit of found) console.error(`${hit.file}:${hit.line}: ${hit.text.replace(/\s+/g, ' ').slice(0, 220)}`)
  console.log(`UI copy: ${found.length} developer-text violations`)
  if (found.length) process.exitCode = 1
}
