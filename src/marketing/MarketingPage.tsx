import { useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/**
 * Babin Rentals — public marketing site.
 *
 * A Persuade surface, deliberately separate from the internal ops app: its own
 * Vite entry (`marketing.html`), its own stylesheet, its own React root. It
 * shares the brand mark colour with `src/styles/theme.css` and nothing else —
 * none of the ops app's locked layout laws (44x44 targets, 768/1280-only
 * breakpoints, colour-never-alone) govern a landing page, and none of this
 * page's CSS can reach the ops app.
 *
 * Content is grounded in the real business: the gear list, the membership
 * tiers and the four-gate operations model are all pulled from what Babin
 * Rentals actually runs, not invented for copy. The one exception is flagged
 * inline at the quotes section.
 */

const MARQUEE_KIT = [
  'Sony FX6',
  'ARRI Alexa Mini LF',
  'RED Komodo 6K',
  'Sony FX3',
  'NISI Athena Primes',
  'DJI Ronin 4D',
  'Aputure 600D Pro',
  'Sigma 24-70mm f/2.8',
  'Canon CN-E 24mm',
  'Rode Wireless GO II',
  'Portkeys Monitor',
  'DJI RS3',
]

interface KitRow {
  name: string
  detail: string
  seed: string
}

const INVENTORY: KitRow[] = [
  { name: 'ARRI Alexa Mini LF', detail: 'Large-format body, full accessory build', seed: 'alexa-body' },
  { name: 'RED Komodo 6K', detail: 'Compact 6K global shutter', seed: 'komodo-rig' },
  { name: 'Sony FX6 / FX3', detail: 'Documentary and run-and-gun bodies', seed: 'sony-fx-body' },
  { name: 'NISI Athena Prime Set', detail: 'Full T2.1 cine prime set', seed: 'cine-primes' },
  { name: 'DJI Ronin 4D', detail: 'Four-axis stabilised cinema system', seed: 'gimbal-move' },
  { name: 'Aputure 600D Pro', detail: 'Daylight point-source with modifiers', seed: 'film-lighting' },
]

interface Gate {
  no: string
  name: string
  copy: string
  seed: string
}

/** The real four-job operations model the rental floor runs on. */
const GATES: Gate[] = [
  {
    no: '01',
    name: 'Pack',
    copy: 'Every line on your booking is scanned against the list before the case closes. Short-packs get flagged on the spot, not discovered on location.',
    seed: 'packing-cases',
  },
  {
    no: '02',
    name: 'Handover',
    copy: 'You sign for exactly what is in the case. Serial numbers, counts and condition photos are recorded at the counter, so there is no argument later.',
    seed: 'gear-handover',
  },
  {
    no: '03',
    name: 'Return',
    copy: 'Checked back in against what actually went out — including substitutions. Discrepancies are raised while you are standing there, in daylight.',
    seed: 'gear-return',
  },
  {
    no: '04',
    name: 'Reset',
    copy: 'Cleaned, tested, batteries charged, cards formatted, and re-shelved. A kit does not go back on the floor until it has passed this gate.',
    seed: 'lens-cleaning',
  },
]

interface Tier {
  name: string
  note: string
}

const TIERS: Tier[] = [
  { name: 'Academy', note: 'Students and film schools' },
  { name: 'Creator', note: 'Solo shooters and freelancers' },
  { name: 'Cinematographer', note: 'Working DoPs, KYC verified' },
  { name: 'Production Alliance', note: 'Companies, on registered PAN' },
  { name: 'Elite', note: 'Long-run productions' },
]

/**
 * Placeholder quotes. These are NOT real client testimonials and are labelled
 * as such in the UI — writing invented endorsements for a real business's
 * public page would be fabricating reviews. Replace `quote`/`who` with
 * approved client copy before this page is published, and delete the notice
 * below the carousel.
 */
interface Quote {
  quote: string
  who: string
  role: string
  seed: string
}

const QUOTES: Quote[] = [
  {
    quote: 'Placeholder quote — replace with an approved client sentence about turnaround or kit condition.',
    who: 'Client name',
    role: 'Production company, Kathmandu',
    seed: 'director-portrait',
  },
  {
    quote: 'Placeholder quote — replace with an approved client sentence about a specific shoot or location.',
    who: 'Client name',
    role: 'Documentary unit',
    seed: 'dop-portrait',
  },
  {
    quote: 'Placeholder quote — replace with an approved client sentence about support or availability.',
    who: 'Client name',
    role: 'Commercial director',
    seed: 'producer-portrait',
  },
]

function img(seed: string, w: number, h: number): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`
}

export default function MarketingPage() {
  const root = useRef<HTMLElement | null>(null)
  const pinSection = useRef<HTMLDivElement | null>(null)
  const pinTitle = useRef<HTMLDivElement | null>(null)
  const [activeQuote, setActiveQuote] = useState(0)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        /* Hero — headline lines rise, image settles. */
        gsap.from('[data-hero-line]', {
          yPercent: 115,
          duration: 1.15,
          ease: 'power4.out',
          stagger: 0.09,
        })
        gsap.from('[data-hero-fade]', {
          opacity: 0,
          y: 18,
          duration: 0.9,
          ease: 'power3.out',
          delay: 0.45,
          stagger: 0.08,
        })
        gsap.fromTo(
          '[data-hero-media]',
          { scale: 1.14, opacity: 0.35 },
          { scale: 1, opacity: 1, duration: 1.8, ease: 'power3.out' },
        )

        /* Scroll-pinning split — the heading holds while the kit scrolls past. */
        if (pinSection.current && pinTitle.current) {
          ScrollTrigger.create({
            trigger: pinSection.current,
            start: 'top top',
            end: 'bottom bottom',
            pin: pinTitle.current,
            pinSpacing: false,
          })
        }

        /* Each kit plate grows in, then dims as it leaves. */
        gsap.utils.toArray<HTMLElement>('[data-kit-plate]').forEach((plate) => {
          gsap.fromTo(
            plate,
            { scale: 0.82, opacity: 0.25 },
            {
              scale: 1,
              opacity: 1,
              ease: 'none',
              scrollTrigger: { trigger: plate, start: 'top 88%', end: 'top 42%', scrub: true },
            },
          )
          gsap.to(plate, {
            opacity: 0.18,
            ease: 'none',
            scrollTrigger: { trigger: plate, start: 'bottom 38%', end: 'bottom 8%', scrub: true },
          })
        })

        /* Scrubbing reveal — the statement lights up word by word. */
        gsap.fromTo(
          '[data-scrub-word]',
          { opacity: 0.12 },
          {
            opacity: 1,
            ease: 'none',
            stagger: 1,
            scrollTrigger: { trigger: '[data-scrub]', start: 'top 78%', end: 'bottom 62%', scrub: true },
          },
        )

        /* Card stacking — each gate shrinks back as the next slides over it. */
        gsap.utils.toArray<HTMLElement>('[data-gate-card]').forEach((card, i, all) => {
          if (i === all.length - 1) return
          gsap.to(card, {
            scale: 0.9,
            opacity: 0.45,
            ease: 'none',
            scrollTrigger: { trigger: card, start: 'top 12%', end: '+=520', scrub: true },
          })
        })
      })

      return () => mm.revert()
    },
    { scope: root },
  )

  const heroLines = ['Cinema-grade kit, prepped', 'and tested before your call time.']

  return (
    <main ref={root} className="w-full max-w-full overflow-x-hidden bg-ink text-bone">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-5 z-50 flex justify-center px-4">
        <nav className="flex w-full max-w-4xl items-center gap-4 rounded-full border border-white/10 bg-ink/70 px-3 py-2 backdrop-blur-xl sm:px-5">
          <a href="#top" className="flex items-center gap-2.5 pl-1">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gold font-display text-sm font-bold text-ink">
              B
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight">Babin Rentals</span>
          </a>
          <div className="ml-auto hidden items-center gap-7 text-sm text-ash md:flex">
            <a href="#kit" className="transition-colors hover:text-bone">Kit</a>
            <a href="#gates" className="transition-colors hover:text-bone">How it works</a>
            <a href="#membership" className="transition-colors hover:text-bone">Membership</a>
          </div>
          <a
            href="#contact"
            className="rounded-full bg-bone px-4 py-2 text-sm font-semibold text-ink transition-transform duration-300 hover:scale-[1.04]"
          >
            Check availability
          </a>
        </nav>
      </header>

      {/* ── Attention: hero ────────────────────────────────────────── */}
      <section id="top" className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-5 pt-32 pb-24">
        <div className="absolute inset-0 -z-10">
          <img
            data-hero-media
            src={img('kathmandu-film-set', 2400, 1400)}
            alt=""
            className="h-full w-full object-cover opacity-90 contrast-125 grayscale"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_5%,rgba(11,18,32,0.82)_58%,#0b1220_92%)]" />
          <div className="absolute inset-0 bg-ink/45" />
        </div>

        <div className="mx-auto w-full max-w-6xl text-center">
          <h1 className="font-display font-bold leading-[0.98] tracking-[-0.035em] text-[clamp(2.6rem,5.2vw,5.5rem)]">
            {heroLines.map((line) => (
              <span key={line} className="block overflow-hidden">
                <span data-hero-line className="block">{line}</span>
              </span>
            ))}
          </h1>

          <p
            data-hero-fade
            className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-ash sm:text-xl"
          >
            Camera, lens, lighting and grip rental in Boudha, Kathmandu — cleaned,
            charged and checked between every shoot.
          </p>

          <div data-hero-fade className="mt-11 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#kit"
              className="w-full rounded-full bg-gold px-8 py-4 font-display text-base font-semibold text-ink transition-transform duration-300 hover:scale-[1.04] sm:w-auto"
            >
              Browse the kit
            </a>
            <a
              href="#contact"
              className="w-full rounded-full border border-bone/30 px-8 py-4 font-display text-base font-semibold text-bone transition-colors duration-300 hover:bg-bone/10 sm:w-auto"
            >
              Talk to the floor
            </a>
          </div>
        </div>
      </section>

      {/* ── Marquee ────────────────────────────────────────────────── */}
      <section className="border-y border-slate-line/70 bg-ink-2/60 py-7">
        <div className="flex overflow-hidden">
          <div className="marquee-track flex shrink-0 items-center gap-12 pr-12">
            {[...MARQUEE_KIT, ...MARQUEE_KIT].map((item, i) => (
              <span
                key={`${item}-${i}`}
                className="flex shrink-0 items-center gap-12 font-display text-lg font-medium whitespace-nowrap text-ash/70"
              >
                {item}
                <span className="h-1 w-1 rounded-full bg-gold/70" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Interest: bento ────────────────────────────────────────── */}
      <section id="kit" className="px-5 py-32 md:py-48">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-4xl font-display text-[clamp(2rem,3.8vw,3.6rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            A floor built for the shoots this city actually books.
          </h2>
          <p className="mt-6 max-w-xl text-lg text-ash">
            Documentary, commercial, wedding and feature work — the inventory is
            weighted to what gets asked for, not what looks good in a catalogue.
          </p>

          <div className="mt-16 grid auto-rows-[13rem] grid-flow-dense grid-cols-2 gap-4 md:grid-cols-4">
            {/* Camera bodies — 2x2 */}
            <article className="group relative col-span-2 row-span-2 overflow-hidden rounded-3xl border border-slate-line">
              <img
                src={img('cinema-camera-body', 1400, 1400)}
                alt="Cinema camera body on the prep bench"
                className="absolute inset-0 h-full w-full object-cover opacity-70 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <h3 className="font-display text-3xl font-semibold tracking-tight">Camera bodies</h3>
                <p className="mt-2 max-w-sm text-ash">
                  ARRI Alexa Mini LF, RED Komodo 6K, Sony FX6 and FX3 — built out
                  with cages, monitoring, media and power.
                </p>
              </div>
            </article>

            {/* Glass — 2x1 */}
            <article className="group relative col-span-2 overflow-hidden rounded-3xl border border-slate-line bg-ink-2 p-7">
              <div
                className="absolute -right-8 -top-8 h-44 w-44 rounded-full bg-cover bg-center opacity-25 transition-transform duration-700 ease-out group-hover:scale-110"
                style={{ backgroundImage: `url(${img('cine-lens-glass', 600, 600)})` }}
              />
              <h3 className="relative font-display text-2xl font-semibold tracking-tight">Glass</h3>
              <p className="relative mt-2 max-w-xs text-ash">
                NISI Athena T2.1 primes, Sigma 24-70mm f/2.8, Canon CN-E — matched
                sets, never mixed coatings.
              </p>
            </article>

            {/* Light and grip — 2x1 */}
            <article className="group relative col-span-2 overflow-hidden rounded-3xl border border-slate-line">
              <img
                src={img('film-lighting-setup', 1200, 700)}
                alt="Lighting setup on a stage"
                className="absolute inset-0 h-full w-full object-cover opacity-45 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-ink/55" />
              <div className="relative p-7">
                <h3 className="font-display text-2xl font-semibold tracking-tight">Light and grip</h3>
                <p className="mt-2 max-w-xs text-ash">
                  Aputure 600D Pro and modifiers, stands, flags and the boring
                  hardware that saves a setup.
                </p>
              </div>
            </article>

            {/* Movement — 1x2 */}
            <article className="group relative col-span-1 row-span-2 overflow-hidden rounded-3xl border border-slate-line">
              <img
                src={img('gimbal-operator', 800, 1400)}
                alt="Operator with a stabilised rig"
                className="absolute inset-0 h-full w-full object-cover opacity-60 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="font-display text-2xl font-semibold tracking-tight">Movement</h3>
                <p className="mt-2 text-sm text-ash">DJI Ronin 4D, RS3, sliders and heads.</p>
              </div>
            </article>

            {/* Counter hours — 1x2 */}
            <article className="col-span-1 row-span-2 flex flex-col justify-between rounded-3xl border border-gold/25 bg-gold/[0.07] p-6">
              <div>
                <h3 className="font-display text-2xl font-semibold tracking-tight text-gold">
                  Boudha counter
                </h3>
                <p className="mt-2 text-sm text-ash">
                  Same-day pickup on anything showing free. Sunday to Friday,
                  07:00 to 19:00.
                </p>
              </div>
              <a
                href="#contact"
                className="mt-6 inline-flex items-center gap-2 font-display text-sm font-semibold text-gold transition-transform duration-300 hover:translate-x-1"
              >
                Reserve a slot
                <span aria-hidden>-&gt;</span>
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ── Desire: pinned split ───────────────────────────────────── */}
      <section ref={pinSection} className="relative px-5 pb-32 md:pb-48">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[0.85fr_1.15fr] md:gap-16">
          <div ref={pinTitle} className="h-fit md:sticky md:top-32 md:self-start md:py-10">
            <h2 className="font-display text-[clamp(2rem,3.6vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              The shelf, in detail.
            </h2>
            <p className="mt-5 max-w-sm text-lg text-ash">
              Everything here is owned and maintained in-house. If a body is out,
              we will tell you what is actually free instead of taking the booking
              and sorting it out later.
            </p>
            <a
              href="#contact"
              className="mt-8 inline-flex rounded-full border border-bone/25 px-6 py-3 font-display text-sm font-semibold transition-colors duration-300 hover:bg-bone/10"
            >
              Ask what is free this week
            </a>
          </div>

          <div className="flex flex-col gap-6">
            {INVENTORY.map((kit) => (
              <article
                key={kit.name}
                data-kit-plate
                className="group relative h-64 overflow-hidden rounded-3xl border border-slate-line sm:h-72"
              >
                <img
                  src={img(kit.seed, 1200, 800)}
                  alt={kit.name}
                  className="absolute inset-0 h-full w-full object-cover opacity-60 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6">
                  <div>
                    <h3 className="font-display text-2xl font-semibold tracking-tight">{kit.name}</h3>
                    <p className="mt-1 text-sm text-ash">{kit.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scrubbing statement ────────────────────────────────────── */}
      <section data-scrub className="px-5 py-32 md:py-48">
        <p className="mx-auto max-w-5xl text-center font-display text-[clamp(1.6rem,3.4vw,3rem)] font-semibold leading-[1.25] tracking-[-0.02em]">
          {'A rental house is only as good as the last kit it handed over.'
            .split(' ')
            .map((word, i) => (
              <span key={`${word}-${i}`} data-scrub-word className="inline-block">
                {word}
                <span>&nbsp;</span>
              </span>
            ))}
        </p>
      </section>

      {/* ── Desire: stacking gates ─────────────────────────────────── */}
      <section id="gates" className="px-5 pb-32 md:pb-48">
        <div className="mx-auto max-w-5xl">
          <h2 className="max-w-4xl font-display text-[clamp(2rem,3.8vw,3.6rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            Every kit passes
            <span
              className="mx-3 inline-block h-[0.62em] w-[1.8em] translate-y-[0.04em] rounded-full bg-cover bg-center align-middle"
              style={{ backgroundImage: `url(${img('equipment-check', 400, 200)})` }}
              aria-hidden
            />
            four gates before it reaches you.
          </h2>

          <div className="mt-16 flex flex-col gap-8">
            {GATES.map((gate) => (
              <article
                key={gate.no}
                data-gate-card
                className="sticky top-28 overflow-hidden rounded-3xl border border-slate-line bg-ink-2"
              >
                <div className="grid gap-0 sm:grid-cols-[1.25fr_1fr]">
                  <div className="p-8 sm:p-10">
                    <span className="font-mono text-sm text-gold">{gate.no}</span>
                    <h3 className="mt-3 font-display text-3xl font-semibold tracking-tight">{gate.name}</h3>
                    <p className="mt-4 max-w-md leading-relaxed text-ash">{gate.copy}</p>
                  </div>
                  <div className="relative min-h-[11rem]">
                    <img
                      src={img(gate.seed, 900, 700)}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-45 grayscale"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-ink-2 to-transparent" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Membership ─────────────────────────────────────────────── */}
      <section id="membership" className="px-5 pb-32 md:pb-48">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-line bg-ink-2/70 p-8 md:p-14">
          <div className="grid gap-12 md:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="font-display text-[clamp(1.9rem,3.2vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]">
                Shoot often? Stop paying list.
              </h2>
              <p className="mt-5 max-w-md text-lg text-ash">
                Five tiers, from film students to production houses running back-to-back
                schedules. Rates, credit terms and priority holds scale with the tier.
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-slate-line/80">
              {TIERS.map((tier) => (
                <li
                  key={tier.name}
                  className="group flex items-center justify-between gap-6 py-5 transition-colors duration-300 hover:bg-bone/[0.03]"
                >
                  <div>
                    <p className="font-display text-xl font-semibold tracking-tight">{tier.name}</p>
                    <p className="mt-0.5 text-sm text-ash">{tier.note}</p>
                  </div>
                  <span
                    aria-hidden
                    className="text-gold opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                  >
                    -&gt;
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Quotes carousel ────────────────────────────────────────── */}
      <section className="px-5 pb-32 md:pb-48">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
            <div className="flex -space-x-4">
              {QUOTES.map((q, i) => (
                <button
                  key={q.seed}
                  type="button"
                  onClick={() => setActiveQuote(i)}
                  aria-label={`Show quote ${i + 1}`}
                  aria-pressed={i === activeQuote}
                  className={`h-16 w-16 overflow-hidden rounded-full border-2 transition-all duration-300 ${
                    i === activeQuote
                      ? 'z-10 scale-110 border-gold'
                      : 'border-ink-3 opacity-55 hover:opacity-90'
                  }`}
                >
                  <img src={img(q.seed, 200, 200)} alt="" className="h-full w-full object-cover grayscale" />
                </button>
              ))}
            </div>

            <figure>
              <blockquote className="font-display text-[clamp(1.25rem,2.3vw,1.95rem)] font-medium leading-[1.35] tracking-[-0.01em]">
                {QUOTES[activeQuote]?.quote}
              </blockquote>
              <figcaption className="mt-5 text-sm text-ash">
                <span className="font-semibold text-bone">{QUOTES[activeQuote]?.who}</span>
                {' — '}
                {QUOTES[activeQuote]?.role}
              </figcaption>
            </figure>
          </div>

          {/* Honest disclosure: see the QUOTES comment in this file. */}
          <p className="mt-10 rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm text-gold/90">
            Draft notice — these three quotes are placeholders, not real client
            testimonials. Swap in approved quotes and delete this notice before
            the page goes live.
          </p>
        </div>
      </section>

      {/* ── Action ─────────────────────────────────────────────────── */}
      <section id="contact" className="relative overflow-hidden px-5 py-32 md:py-48">
        <div className="absolute inset-0 -z-10">
          <img
            src={img('kathmandu-street-night', 2000, 1200)}
            alt=""
            className="h-full w-full object-cover opacity-25 grayscale"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(216,169,58,0.10),transparent_62%)]" />
          <div className="absolute inset-0 bg-ink/70" />
        </div>

        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-display text-[clamp(2.4rem,6vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.04em]">
            Tell us the shoot. We will tell you what is free.
          </h2>
          <div className="mt-11 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="tel:+9779800000000"
              className="w-full rounded-full bg-gold px-8 py-4 font-display text-base font-semibold text-ink transition-transform duration-300 hover:scale-[1.04] sm:w-auto"
            >
              Call the counter
            </a>
            <a
              href="mailto:hello@babinrentals.com"
              className="w-full rounded-full border border-bone/30 px-8 py-4 font-display text-base font-semibold text-bone transition-colors duration-300 hover:bg-bone/10 sm:w-auto"
            >
              Send a kit list
            </a>
          </div>
          <p className="mt-8 text-sm text-ash/80">
            Placeholder contact details — replace the phone number and address
            with the real ones before publishing.
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-line px-5 py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gold font-display text-sm font-bold text-ink">
                B
              </span>
              <span className="font-display text-[15px] font-semibold tracking-tight">Babin Rentals</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ash">
              Babin Rentals Pvt. Ltd. — Boudha, Kathmandu, Nepal.
              <br />
              VAT 623587106
            </p>
          </div>

          <div className="flex gap-14">
            <div className="flex flex-col gap-3 text-sm text-ash">
              <a href="#kit" className="transition-colors hover:text-bone">Kit</a>
              <a href="#gates" className="transition-colors hover:text-bone">How it works</a>
              <a href="#membership" className="transition-colors hover:text-bone">Membership</a>
            </div>
            <div className="flex flex-col gap-3 text-sm text-ash">
              <a href="#contact" className="transition-colors hover:text-bone">Contact</a>
              <a href="/" className="transition-colors hover:text-bone">Staff login</a>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-12 max-w-6xl text-xs text-ash/50">
          Imagery on this page is placeholder stock pending a real kit shoot.
        </p>
      </footer>
    </main>
  )
}
