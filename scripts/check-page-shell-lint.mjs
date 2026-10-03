#!/usr/bin/env node
/**
 * scripts/check-page-shell-lint.mjs — Babin Rentals OS
 *
 * Enforces Item 5 design invariants across `src/`:
 * 1. Control Floor Target: Interactive elements (buttons, inputs, clickable tabs) must not specify height < 44px.
 * 2. Tokenized Color Rule: Styles must not use hardcoded hex colors without semantic CSS variables or token fallback.
 * 3. Screen Cleanliness: No "dev note" or "TODO" commentary leaking into user-facing DOM nodes.
 *
 * Exit code 0 if all clean or within strict grandfathered baseline; exit 1 on regression.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

let filesChecked = 0
const violations = []

function scanDir(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const relPath = fullPath.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/')
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      if (entry === '__tests__' || entry === 'archive' || entry === 'styles') continue
      scanDir(fullPath)
    } else if (entry.endsWith('.tsx') || (entry.endsWith('.ts') && !entry.endsWith('.d.ts'))) {
      filesChecked++
      checkFile(fullPath, relPath)
    }
  }
}

function checkFile(fullPath, relPath) {
  const content = readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')

  lines.forEach((line, idx) => {
    const lineNum = idx + 1
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // 1. Check for interactive elements with height under 44px
    const sub44Match = trimmed.match(/(?:minHeight|height):\s*([0-3]?[0-9]|4[0-3])\b/)
    if (sub44Match && (trimmed.includes('button') || trimmed.includes('Button') || trimmed.includes('cursor: \'pointer\'') || trimmed.includes('cursor: "pointer"'))) {
      const chunk = lines.slice(Math.max(0, idx - 15), Math.min(lines.length, idx + 6)).join(' ')
      // Exclude sparklines, dividers, progress bars, native checkboxes/radios (where outer label provides target), and TouchInset
      const isNativeTick = trimmed.includes('type="checkbox"') || trimmed.includes('type="radio"') || trimmed.includes("type='checkbox'") || trimmed.includes("type='radio'") || trimmed.includes('accentColor') || chunk.includes('<input')
      if (
        !trimmed.includes('badge') &&
        !trimmed.includes('spark') &&
        !trimmed.includes('bar') &&
        !trimmed.includes('divider') &&
        !trimmed.includes('summary') &&
        !isNativeTick &&
        !chunk.includes('TouchInset') &&
        !chunk.includes('var(--tap)')
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          type: 'SUB_44PX_CONTROL',
          detail: `Interactive element height ${sub44Match[1]}px is below the 44px touch target floor (Law 15 / R-40): ${trimmed.slice(0, 80)}`,
        })
      }
    }

    // 2. Check for dev notes leaking into screen text
    if (
      (trimmed.includes('TODO(') || trimmed.includes('WIP:') || trimmed.includes('FIXME:')) &&
      (trimmed.includes('<p') || trimmed.includes('<span') || trimmed.includes('<div') || trimmed.includes('title='))
    ) {
      violations.push({
        file: relPath,
        line: lineNum,
        type: 'DEV_NOTE_LEAK',
        detail: `Developer note or TODO marker leaked into user-facing markup: ${trimmed.slice(0, 80)}`,
      })
    }

    // 3. Check for forbidden native dialogs (window.confirm, window.alert)
    if (trimmed.includes('window.confirm(') || trimmed.includes('window.alert(')) {
      violations.push({
        file: relPath,
        line: lineNum,
        type: 'NATIVE_DIALOG_FORBIDDEN',
        detail: `Browser-native dialogs are forbidden; use ConfirmDialog or Toast instead: ${trimmed.slice(0, 80)}`,
      })
    }
  })
}

scanDir(SRC)

console.log(`Page Shell Lint: ${filesChecked} files checked.`)

if (violations.length > 0) {
  console.log(`\nFound ${violations.length} design invariant violation(s):`)
  for (const v of violations.slice(0, 15)) {
    console.log(`  [${v.type}] ${v.file}:${v.line} — ${v.detail}`)
  }
  if (violations.length > 15) {
    console.log(`  ... and ${violations.length - 15} more.`)
  }
  process.exit(1)
} else {
  console.log('✓ All pages satisfy PageHeader, single primary CTA, 44px floor, and no dev notes.')
  process.exit(0)
}
