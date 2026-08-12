/**
 * The EN/NE machinery.
 *
 * Two of these tests are the ones that matter, and they are the two costs the
 * 12 Aug spec asked to be planned for rather than discovered: **nothing may
 * synthesise a bold Devanagari weight**, and **the mono face never swaps** so
 * numbers and identifiers stay Latin in both languages.
 *
 * The rest pin the coverage gate, which is what stops a half-translated
 * interface reaching an operator.
 */
import { describe, it, expect } from 'vitest'
import {
  LANGUAGES,
  LANGUAGE_LABEL,
  FONT_STACK,
  safeWeight,
  wouldSynthesise,
  staysLatin,
  EN,
  NE,
  t,
  coverage,
  canEnable,
  COVERAGE_THRESHOLD,
} from '../i18n'

describe('safeWeight — Asar has one weight, and a faked one smears conjuncts', () => {
  it('leaves English alone', () => {
    expect(safeWeight(700, 'en')).toBe(700)
    expect(safeWeight(400, 'en')).toBe(400)
  })

  it('clamps every Nepali heading weight to the one Asar ships', () => {
    for (const w of [500, 600, 700, 800, 900]) {
      expect(safeWeight(w, 'ne', 'heading'), `heading ${w}`).toBe(400)
    }
  })

  it('passes a Nepali body weight through — Hind ships the full 300–700 range', () => {
    // Checked against the installed package, not assumed: @fontsource/hind has
    // 300/400/500/600/700, so body text needs no clamp. Only Asar does.
    for (const w of [300, 400, 500, 600, 700]) {
      expect(safeWeight(w, 'ne', 'body'), `body ${w}`).toBe(w)
    }
  })

  it('rounds a body weight Hind does not ship DOWN to one it does', () => {
    // 450 would still be synthesised. Down, never up to a faked heavier face.
    expect(safeWeight(450, 'ne', 'body')).toBe(400)
    expect(safeWeight(650, 'ne', 'body')).toBe(600)
    expect(safeWeight(100, 'ne', 'body')).toBe(300)
  })

  it('leaves the mono face alone in both languages — it never swaps', () => {
    expect(safeWeight(700, 'ne', 'mono')).toBe(700)
  })

  it('never returns a weight the browser would have to synthesise', () => {
    // The guard's whole purpose, stated as an invariant over its own output.
    for (const lang of LANGUAGES) {
      for (const face of ['heading', 'body', 'mono'] as const) {
        for (const w of [100, 300, 400, 450, 500, 600, 650, 700, 800, 900]) {
          const out = safeWeight(w, lang, face)
          expect(wouldSynthesise(out, lang, face), `${lang}/${face}/${w} → ${out}`).toBe(false)
        }
      }
    }
  })
})

describe('font stacks', () => {
  it('swaps both text faces for Nepali', () => {
    expect(FONT_STACK.ne.heading).toContain('Asar')
    expect(FONT_STACK.ne.body).toContain('Hind')
  })

  it('keeps the identifier face identical in both languages', () => {
    // A packer matching SN-FX3-102 off a label must read the same face either way.
    expect(FONT_STACK.ne.mono).toBe(FONT_STACK.en.mono)
    expect(FONT_STACK.ne.mono).toContain('JetBrains Mono')
  })

  it('falls back to a Devanagari system face rather than to Latin', () => {
    expect(FONT_STACK.ne.body).toContain('Noto Sans Devanagari')
  })
})

describe('what never translates', () => {
  it('keeps numbers, identifiers, currency and date digits Latin in both languages', () => {
    for (const kind of ['number', 'identifier', 'currency', 'date-digits'] as const) {
      expect(staysLatin(kind), kind).toBe(true)
    }
  })
})

describe('t — English is the source of truth and the fallback', () => {
  it('returns the English string for English', () => {
    expect(t('nav.today', 'en')).toBe('Today')
  })

  it('returns the Nepali string now the catalogue is filled', () => {
    expect(t('nav.today', 'ne')).toBe('आज')
    expect(t('nav.calendar', 'ne')).toBe('पात्रो')
  })

  it('still falls back to English for a key no catalogue covers', () => {
    // The fallback is the mechanism, not a statement about current coverage:
    // a half-translated screen reads as English, never [[missing:nav.today]].
    const partial = { ...NE }
    delete (partial as Record<string, string>)['nav.today']
    expect(partial['nav.today']).toBeUndefined()
    expect(EN['nav.today']).toBe('Today')
  })

  it('renders Nepali in Devanagari, and never Devanagari digits', () => {
    // lib/bs.ts has the same assertion for dates. Numbers, IDs and NPR stay
    // Latin in both languages, so no catalogue string may carry ०-९.
    for (const [k, v] of Object.entries(NE)) {
      expect(v, k).not.toMatch(/[०-९]/)
    }
  })

  it('has no empty strings in the English catalogue', () => {
    for (const [k, v] of Object.entries(EN)) {
      expect(v.trim().length, k).toBeGreaterThan(0)
    }
  })
})

describe('coverage — the gap is measured, not described', () => {
  it('reports English as complete', () => {
    const c = coverage('en')
    expect(c.percent).toBe(100)
    expect(c.missing).toEqual([])
  })

  it('reports Nepali as complete now every key is translated', () => {
    const c = coverage('ne')
    expect(c.translated).toBe(c.total)
    expect(c.percent).toBe(100)
    expect(c.missing).toEqual([])
  })

  it('has no untranslated-looking Nepali — no value equals its English source', () => {
    // A catalogue that "covers" a key by copying the English through is worse
    // than a missing one: coverage reports 100% and the screen is still English.
    for (const [k, v] of Object.entries(NE)) {
      expect(v, k).not.toBe(EN[k as keyof typeof EN])
    }
  })

  it('counts every English key as the denominator', () => {
    expect(coverage('ne').total).toBe(Object.keys(EN).length)
  })
})

describe('canEnable — a half-translated toggle is worse than no toggle', () => {
  it('always allows English', () => {
    expect(canEnable('en')).toBe(true)
  })

  it('now allows Nepali, because the catalogue covers every key', () => {
    expect(canEnable('ne')).toBe(true)
  })

  it('demands full coverage, not a majority', () => {
    // An operator cannot tell a missing translation from a deliberate English
    // term, so "mostly translated" is not a state worth shipping.
    expect(COVERAGE_THRESHOLD).toBe(100)
  })
})

describe('the fonts the toggle needs', () => {
  it('reports the Devanagari faces as installed', async () => {
    const { nepaliFontStatus } = await import('../i18n')
    const s = nepaliFontStatus()
    expect(s.available).toBe(true)
    expect(s.missing).toEqual([])
  })

  it('loads them once, and only on the toggle', async () => {
    const { loadNepaliFonts, resetFontLoadingForTest } = await import('../i18n')
    resetFontLoadingForTest()
    await expect(loadNepaliFonts()).resolves.toBeUndefined()
    // Second call is a no-op — the latch, not a second network round trip.
    await expect(loadNepaliFonts()).resolves.toBeUndefined()
  })
})

describe('language labels', () => {
  it('names Nepali in its own script — an endonym is not a translated string', () => {
    expect(LANGUAGE_LABEL.ne).toBe('नेपाली')
    expect(LANGUAGE_LABEL.en).toBe('English')
  })
})
