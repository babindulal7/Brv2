/**
 * CSV Engine — parse only, RFC 4180-shaped.
 *
 * No dependency was added for this (`package.json` carries none) — a correct
 * parser handling quoted fields, embedded commas/newlines and escaped `""`
 * quotes is a bounded, well-understood algorithm, not something that
 * warrants a new external package for one screen.
 */
/**
 * What a parse produced, and whether it can be trusted.
 *
 * ⛔ `parseCsv` used to return a bare `string[][]` — **no error channel at all**
 * (`BUG_SWEEP_ENGINES` `R3-6`, `PLAN.md` §4.35). A file it could not parse
 * produced rows that looked exactly like rows it could, so `ImportCenter`
 * validated them, found `errors.length === 0`, and showed a green "Ready" badge
 * over silently corrupted data.
 *
 * `ok: false` means **the file was not parsed correctly and its rows must not be
 * imported**. `rows` is still returned so the screen can show what it got and
 * the operator can see the damage, not so anything can be written from it.
 */
export interface CsvParseResult {
  ok: boolean
  rows: string[][]
  /** Empty when `ok`. One human sentence per problem — these are shown verbatim. */
  errors: string[]
}

export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = []
  const errors: string[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  /** 1-based, for error messages. Counts source lines, not parsed rows. */
  let line = 1
  /** Where the currently-open quoted field started, for the unterminated message. */
  let quoteOpenedAtLine = 0
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
      if (char === '\n') line += 1
      field += char
      i++
      continue
    }

    /*
     * ⛔ A quote opens a quoted field ONLY at a field boundary.
     *
     * This used to be a bare `if (char === '"')`, so ANY quote anywhere opened
     * quote mode — and inch marks are quotes. A catalogue with `6" Pipe` in one
     * row and `24" Ladder` in a later one opened at the first and closed at the
     * second, swallowing every comma and newline between them: three hundred
     * rows silently collapsed into one whose Name was a blob and whose Phone
     * belonged to a different client. RFC 4180 §2.5 is explicit that a quote is
     * only special at the start of a field; elsewhere it is data.
     *
     * `field === ''` is the boundary test: nothing has been accumulated into
     * this field yet, so the quote is the first character of it.
     */
    if (char === '"' && field === '') {
      inQuotes = true
      quoteOpenedAtLine = line
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
      line += 1
      i++
      continue
    }
    field += char
    i++
  }

  /*
   * ⛔ Still inside a quoted field at end of input — the commonest CSV
   * corruption there is, and it used to be pushed as a normal field with no
   * complaint. Everything from the opening quote onward is now one field, so
   * the rows after it are gone whatever this function returns; the only honest
   * outcome is to say so.
   */
  if (inQuotes) {
    errors.push(
      `A quoted field opened on line ${quoteOpenedAtLine} is never closed — the file ends inside it. ` +
        `Everything after that quote has been read as a single value, so the rows below it are lost. ` +
        `This is usually an unescaped " in the data: inside a quoted field, write it twice ("").`,
    )
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop fully-blank rows (a trailing newline in the file becomes one).
  const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ''))

  /*
   * A ragged file — rows with differing column counts — is not a parse failure
   * (the parser read exactly what was there) but it is almost always a damaged
   * file, and reporting it is what turns "the import silently mapped the wrong
   * column" into a sentence the operator can act on. Reported, not fatal.
   */
  const header = cleaned[0]
  if (header) {
    const ragged = cleaned
      .map((r, idx) => ({ idx, n: r.length }))
      .filter((r) => r.idx > 0 && r.n !== header.length)
    if (ragged.length > 0) {
      const first = ragged[0]
      errors.push(
        `${ragged.length} row(s) do not have the same number of columns as the header ` +
          `(${header.length}). The first is row ${(first?.idx ?? 0) + 1}, with ${first?.n}. ` +
          `Check for an unescaped comma or quote.`,
      )
    }
  }

  return { ok: errors.length === 0, rows: cleaned, errors }
}

/**
 * Builds one CSV cell, quoting only when the value needs it — mirrors the
 * quoting rule already used by every export in this app.
 *
 *  is in the test alongside 
 because rows are joined with CRLF (RFC 4180)
 * and `parseCsv` drops a bare  outside quotes. Without it a value carrying a
 * lone carriage return — pasted from Excel, or from a Mac-classic export, both
 * of which reach the client-name field — was emitted unquoted and silently
 * split the row on re-import.
 */
export function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
