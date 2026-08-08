/**
 * CSV Engine — parse only, RFC 4180-shaped.
 *
 * No dependency was added for this (`package.json` carries none) — a correct
 * parser handling quoted fields, embedded commas/newlines and escaped `""`
 * quotes is a bounded, well-understood algorithm, not something that
 * warrants a new external package for one screen.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  while (i < len) {
    const char = text.charAt(i)
    const next = text.charAt(i + 1)

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\r') {
      i++
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop fully-blank rows (a trailing newline in the file becomes one).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Builds one CSV cell, quoting only when the value needs it — mirrors the
 *  quoting rule already used by every export in this app. */
export function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
