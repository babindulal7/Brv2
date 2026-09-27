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
    copy: 'Checked back in against what actually went out, including substitutions. Discrepancies are raised while you are standing there, in daylight.',
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
  perk: string
  rate: string
}

const TIERS: Tier[] = [
  { name: 'Academy', note: 'Students and film schools', perk: 'Valid institutional ID or faculty endorsement', rate: '20% off list' },
  { name: 'Creator', note: 'Solo shooters and freelancers', perk: 'Fast-track checkout, 24h equipment holds', rate: '10% off list' },
  { name: 'Cinematographer', note: 'Working DoPs, KYC verified', perk: 'Prep bay reservation, matched prime priority', rate: '15% off list' },
  { name: 'Production Alliance', note: 'Companies, on registered PAN', perk: '30-day invoice credit, standby backup body', rate: 'Contract rate' },
  { name: 'Elite', note: 'Long-run feature productions', perk: 'Dedicated floor technician, custom cage buildouts', rate: 'Custom terms' },
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
  production: string
  gear: string
  seed: string
}

const QUOTES: Quote[] = [
  {
    quote: 'Placeholder quote: replace with an approved client sentence about turnaround or kit condition.',
    who: 'Client name',
    role: 'Production company, Kathmandu',
    production: 'Commercial Campaign · Boudha Prep Bay',
    gear: 'RED V-Raptor 8K + NISI Athena Primes',
    seed: 'director-portrait',
  },
  {
    quote: 'Placeholder quote: replace with an approved client sentence about a specific shoot or location.',
    who: 'Client name',
    role: 'Documentary unit',
    production: 'High-Altitude Documentary · Mustang',
    gear: 'Sony FX6 Dual-Operator Package',
    seed: 'dop-portrait',
  },
  {
    quote: 'Placeholder quote: replace with an approved client sentence about support or availability.',
    who: 'Client name',
    role: 'Commercial director',
    production: 'Feature Narrative · Patan Studio',
    gear: 'ARRI Alexa Mini LF + Cine V-Mounts',
    seed: 'producer-portrait',
  },
]

function img(seed: string, w: number, h: number): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`
}

interface GearPackage {
  id: string
  title: string
  category: string
  spec: string
  seed: string
}

const GEAR_PACKAGES: GearPackage[] = [
  {
    id: 'cine-a',
    title: 'Large Format A-Cam',
    category: 'Body & Rigging',
    spec: 'ARRI Alexa Mini LF, Cage, Gold-Mount, 2TB Codex Drives',
    seed: 'alexa-build',
  },
  {
    id: 'optics',
    title: 'Full Frame Cine Primes',
    category: 'Glass',
    spec: 'NISI Athena T2.1 Primes (14, 24, 35, 50, 85mm)',
    seed: 'athena-primes',
  },
  {
    id: 'gimbal',
    title: 'Stabilised 4-Axis System',
    category: 'Camera Movement',
    spec: 'DJI Ronin 4D 6K, High-Bright Monitor, Wireless Handgrips',
    seed: 'ronin-rig',
  },
  {
    id: 'lighting',
    title: 'High-Output Daylight',
    category: 'Lighting & Modifiers',
    spec: 'Aputure 600D Pro, F10 Fresnel, Light Dome 150, C-Stands',
    seed: 'aputure-set',
  },
  {
    id: 'sound',
    title: 'Broadcast Field Audio',
    category: 'Sound & Comms',
    spec: 'Sound Devices MixPre, MKH 416 Boom, Dual Wisycom Wireless',
    seed: 'sound-rig',
  },
]

export default function MarketingPage() {
  const root = useRef<HTMLElement | null>(null)
  const pinSection = useRef<HTMLDivElement | null>(null)
  const pinTitle = useRef<HTMLDivElement | null>(null)
  const [activeQuote, setActiveQuote] = useState(0)
  const [activePackage, setActivePackage] = useState('cine-a')
  const [activeTier, setActiveTier] = useState('Cinematographer')

  const nextQuote = () => setActiveQuote((prev) => (prev + 1) % QUOTES.length)
  const prevQuote = () => setActiveQuote((prev) => (prev - 1 + QUOTES.length) % QUOTES.length)

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

        /* Hero HUD overlay reveal */
        gsap.from('[data-hero-hud]', {
          opacity: 0,
          scale: 0.98,
          duration: 1.4,
          ease: 'power2.out',
          delay: 0.15,
        })

        /* Floating rig plate entrance and gentle floating bob */
        gsap.from('[data-hero-rig]', {
          opacity: 0,
          y: 35,
          duration: 1.2,
          ease: 'power3.out',
          delay: 0.55,
        })
        gsap.to('[data-hero-rig]', {
          y: -8,
          duration: 3.6,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 1.75,
        })

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

        /* 3D Perspective Card Stacking — gates recede along the Z-axis with progressive depth blur */
        gsap.utils.toArray<HTMLElement>('[data-gate-card]').forEach((card, i, all) => {
          if (i === all.length - 1) return
          gsap.to(card, {
            scale: 0.92,
            yPercent: -4,
            opacity: 0.35,
            filter: 'blur(2px)',
            transformOrigin: 'top center',
            ease: 'none',
            scrollTrigger: { trigger: card, start: 'top 10%', end: '+=480', scrub: true },
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
            <a href="#packages" className="transition-colors hover:text-bone">Packages</a>
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
      <section id="top" className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 pt-32 pb-24">
        <div className="absolute inset-0 -z-10">
          <img
            data-hero-media
            src={img('kathmandu-film-set', 2400, 1400)}
            alt=""
            className="h-full w-full object-cover opacity-85 contrast-125 grayscale"
          />
          {/* Atmospheric Ambient Lighting */}
          <div className="pointer-events-none absolute -top-40 right-1/4 h-[32rem] w-[32rem] rounded-full bg-gold/10 blur-[130px]" />
          <div className="pointer-events-none absolute -bottom-40 left-1/4 h-[32rem] w-[32rem] rounded-full bg-blue-600/10 blur-[140px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(11,18,32,0.85)_60%,#0b1220_95%)]" />
          <div className="absolute inset-0 bg-ink/40" />
        </div>

        {/* Camera Viewfinder HUD Overlay */}
        <div
          data-hero-hud
          aria-hidden="true"
          className="pointer-events-none absolute inset-4 sm:inset-8 z-10 flex flex-col justify-between select-none opacity-80"
        >
          {/* Top HUD line */}
          <div className="flex items-center justify-between font-mono text-[10px] sm:text-xs text-ash/60 tracking-wider">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-semibold text-bone/90">REC</span>
              <span className="text-ash/40">|</span>
              <span>24.000 FPS</span>
              <span className="hidden md:inline text-ash/40">|</span>
              <span className="hidden md:inline">TC 00:14:28:09</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">SHUTTER 180.0°</span>
              <span className="text-ash/40">|</span>
              <span className="text-gold font-semibold">ISO 800</span>
              <span className="text-ash/40">|</span>
              <span>5600K</span>
            </div>
          </div>

          {/* Center reticle and 4-corner bracket marks */}
          <div className="relative my-auto flex h-full w-full items-center justify-center">
            <div className="absolute top-2 left-2 h-6 w-6 border-t-2 border-l-2 border-white/20" />
            <div className="absolute top-2 right-2 h-6 w-6 border-t-2 border-r-2 border-white/20" />
            <div className="absolute bottom-2 left-2 h-6 w-6 border-b-2 border-l-2 border-white/20" />
            <div className="absolute bottom-2 right-2 h-6 w-6 border-b-2 border-r-2 border-white/20" />

            {/* Center crosshair */}
            <div className="relative flex items-center justify-center">
              <div className="h-6 w-[1px] bg-white/25" />
              <div className="absolute w-6 h-[1px] bg-white/25" />
              <div className="absolute h-1.5 w-1.5 rounded-full border border-white/40" />
            </div>

            {/* 2.39:1 scope guidelines */}
            <div className="absolute inset-x-8 top-1/6 bottom-1/6 border-y border-dashed border-white/10 hidden lg:block" />
          </div>

          {/* Bottom HUD line */}
          <div className="flex items-center justify-between font-mono text-[10px] sm:text-xs text-ash/60 tracking-wider">
            <div className="flex items-center gap-2">
              <span className="text-gold/90 font-medium">BOUDHAFILM OS</span>
              <span className="text-ash/40">|</span>
              <span>PRORES 4444 XQ</span>
              <span className="hidden sm:inline text-ash/40">|</span>
              <span className="hidden sm:inline">4.5K OPEN GATE</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden md:inline">BAT 14.8V (94%)</span>
              <span className="text-ash/40">|</span>
              <span className="text-bone/80">MEDIA 124 MIN</span>
            </div>
          </div>
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
            Camera, lens, lighting and grip rental in Boudha, Kathmandu. Cleaned,
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

          {/* Floating Macro Rig Plate */}
          <div
            data-hero-rig
            className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-slate-line/80 bg-ink-2/85 p-4 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] sm:p-6"
          >
            <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-7">
              <div className="relative h-28 w-28 sm:h-32 sm:w-32 shrink-0 overflow-hidden rounded-xl border border-slate-line bg-ink">
                <img
                  src={img('alexa-camera-rig', 600, 600)}
                  alt="ARRI Alexa Mini LF Rig Build"
                  className="h-full w-full object-cover grayscale contrast-125 transition-transform duration-700 hover:scale-110"
                />
                <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/90 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-gold">
                  Bay 02
                </span>
              </div>

              <div className="flex flex-1 flex-col text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-gold">
                    Prep Bay Live Spec
                  </span>
                  <span className="font-mono text-xs text-ash/60">
                    REF: BK-2026-ALX
                  </span>
                </div>

                <h3 className="mt-1.5 font-display text-lg sm:text-xl font-bold tracking-tight text-bone">
                  ARRI Alexa Mini LF + NISI Athena 35mm T2.1
                </h3>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 font-mono text-[11px] text-ash/80">
                  <div>
                    <span className="text-ash/40 block text-[9px] uppercase">Mount</span>
                    PL Native
                  </div>
                  <div>
                    <span className="text-ash/40 block text-[9px] uppercase">Power</span>
                    Dual V-Mount
                  </div>
                  <div>
                    <span className="text-ash/40 block text-[9px] uppercase">Monitoring</span>
                    SmallHD Cine 7
                  </div>
                  <div>
                    <span className="text-ash/40 block text-[9px] uppercase">Inspection</span>
                    Gate Cleaned
                  </div>
                </div>
              </div>
            </div>
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
            A floor built for the shoots
            <span
              className="mx-3 inline-block h-[0.65em] w-[2em] translate-y-[0.06em] rounded-full border border-gold/30 bg-cover bg-center align-middle shadow-md"
              style={{ backgroundImage: `url(${img('lens-anamorphic', 400, 200)})` }}
              aria-hidden
            />
            this city actually books.
          </h2>
          <p className="mt-6 max-w-xl text-lg text-ash">
            Documentary, commercial, wedding and feature work: the inventory is
            weighted to what gets asked for, not what looks good in a catalogue.
          </p>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* Camera bodies — full width on mobile, left column on desktop */}
            <article className="group relative md:col-span-1 overflow-hidden rounded-3xl border border-slate-line md:h-80 lg:h-96">
              <img
                src={img('cinema-camera-body', 1400, 1400)}
                alt="Cinema camera body on the prep bench"
                className="absolute inset-0 h-full w-full object-cover opacity-70 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Camera bodies</h3>
                <p className="mt-2 max-w-sm text-ash">
                  ARRI Alexa Mini LF, RED Komodo 6K, Sony FX6 and FX3, built out
                  with cages, monitoring, media and power.
                </p>
              </div>
            </article>

            {/* Glass — right column, shorter */}
            <article className="group relative md:col-span-1 overflow-hidden rounded-3xl border border-slate-line bg-ink-2 p-7 md:h-80 lg:h-96">
              <div
                className="absolute -right-8 -top-8 h-44 w-44 rounded-full bg-cover bg-center opacity-25 transition-transform duration-700 ease-out group-hover:scale-110"
                style={{ backgroundImage: `url(${img('cine-lens-glass', 600, 600)})` }}
              />
              <h3 className="relative font-display text-xl md:text-2xl font-semibold tracking-tight">Glass</h3>
              <p className="relative mt-2 max-w-xs text-ash">
                NISI Athena T2.1 primes, Sigma 24-70mm f/2.8, Canon CN-E. Matched
                sets, never mixed coatings.
              </p>
            </article>

            {/* Light and grip — full width on mobile, left column on desktop, taller */}
            <article className="group relative md:col-span-1 overflow-hidden rounded-3xl border border-slate-line md:h-80 lg:h-96">
              <img
                src={img('film-lighting-setup', 1200, 700)}
                alt="Lighting setup on a stage"
                className="absolute inset-0 h-full w-full object-cover opacity-45 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-ink/55" />
              <div className="relative p-7">
                <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Light and grip</h3>
                <p className="mt-2 max-w-xs text-ash">
                  Aputure 600D Pro and modifiers, stands, flags and the boring
                  hardware that saves a setup.
                </p>
              </div>
            </article>

            {/* Movement — right column, shorter */}
            <article className="group relative md:col-span-1 overflow-hidden rounded-3xl border border-slate-line md:h-80 lg:h-96">
              <img
                src={img('gimbal-operator', 800, 1400)}
                alt="Operator with a stabilised rig"
                className="absolute inset-0 h-full w-full object-cover opacity-60 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="font-display text-xl md:text-2xl font-semibold tracking-tight">Movement</h3>
                <p className="mt-2 text-sm text-ash">DJI Ronin 4D, RS3, sliders and heads.</p>
              </div>
            </article>

            {/* Counter hours — full width on mobile, spans both columns on desktop */}
            <article className="md:col-span-2 flex flex-col justify-between rounded-3xl border border-gold/25 bg-gold/[0.07] p-6 md:py-10">
              <div>
                <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-gold">
                  Boudha counter
                </h3>
                <p className="mt-2 text-sm md:text-base text-ash max-w-xl">
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

      {/* ── Desire: turnkey packages horizontal accordion ─────────── */}
      <section id="packages" className="px-5 pb-32 md:pb-48">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="inline-block rounded-full border border-gold/30 px-3 py-1 font-mono text-xs uppercase tracking-widest text-gold">
                Turnkey Builds
              </span>
              <h2 className="mt-4 font-display text-[clamp(2rem,3.8vw,3.6rem)] font-bold leading-[1.05] tracking-[-0.03em]">
                Complete packages,
                <span
                  className="mx-3 inline-block h-[0.62em] w-[1.9em] translate-y-[0.06em] rounded-full border border-gold/30 bg-cover bg-center align-middle shadow-md"
                  style={{ backgroundImage: `url(${img('lens-mount', 400, 200)})` }}
                  aria-hidden
                />
                pre-configured for deployment.
              </h2>
            </div>
            <p className="max-w-md text-base text-ash md:text-right">
              Matched lenses, power distribution, and monitoring cased together so your crew never hunts for cables on call time.
            </p>
          </div>

          <div className="mt-14 flex h-[36rem] w-full flex-col gap-3 md:h-[28rem] md:flex-row">
            {GEAR_PACKAGES.map((pkg) => {
              const isSelected = activePackage === pkg.id
              return (
                <div
                  key={pkg.id}
                  onMouseEnter={() => setActivePackage(pkg.id)}
                  onClick={() => setActivePackage(pkg.id)}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActivePackage(pkg.id)
                    }
                  }}
                  className={`group relative flex cursor-pointer overflow-hidden rounded-3xl border border-slate-line transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus:ring-2 focus:ring-gold ${
                    isSelected ? 'flex-[3.5] border-gold/50' : 'flex-[1] hover:border-slate-line/80'
                  }`}
                >
                  <img
                    src={img(pkg.seed, 1200, 900)}
                    alt={pkg.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-45 grayscale contrast-125 transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end p-6 md:p-8">
                    <span className="font-mono text-xs uppercase tracking-wider text-gold">
                      {pkg.category}
                    </span>
                    <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-bone whitespace-nowrap sm:text-2xl">
                      {pkg.title}
                    </h3>
                    <p
                      className={`mt-2 font-mono text-xs text-ash leading-relaxed transition-all duration-300 sm:text-sm ${
                        isSelected ? 'max-h-16 opacity-100' : 'pointer-events-none max-h-0 opacity-0'
                      }`}
                    >
                      {pkg.spec}
                    </p>
                  </div>
                </div>
              )
            })}
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

          <div className="mt-16 flex flex-col gap-8 [perspective:1200px]">
            {GATES.map((gate) => (
              <article
                key={gate.no}
                data-gate-card
                className="sticky top-28 overflow-hidden rounded-3xl border border-slate-line bg-ink-2 shadow-2xl transition-[filter,transform,opacity] duration-300"
              >
                <div className="grid gap-0 sm:grid-cols-[1.25fr_1fr]">
                  <div className="p-8 sm:p-10">
                    <span className="inline-block rounded-full border border-gold/30 px-2.5 py-0.5 font-mono text-xs uppercase tracking-widest text-gold">
                      Gate {gate.no}
                    </span>
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
          <div className="grid gap-12 md:grid-cols-[1fr_1.15fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 font-mono text-xs uppercase tracking-widest text-gold">
                <span>Account Tiers</span>
              </div>
              <h2 className="mt-4 font-display text-[clamp(1.9rem,3.2vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]">
                Shoot often? Stop paying list.
              </h2>
              <p className="mt-5 max-w-md text-lg text-ash">
                Five tiers, from film students to production houses running back-to-back
                schedules. Rates, credit terms and priority holds scale with the tier.
              </p>

              {/* Active Tier Spotlight Card */}
              {(() => {
                const currentTier = TIERS.find((t) => t.name === activeTier) ?? (TIERS[2] as Tier)
                return (
                  <div className="mt-8 rounded-2xl border border-slate-line bg-ink-3/70 p-6 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs uppercase tracking-wider text-ash/70">Selected Tier</span>
                      <span className="inline-block rounded border border-gold/40 bg-gold/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-gold">
                        {currentTier.rate}
                      </span>
                    </div>
                    <div className="mt-3 font-display text-2xl font-bold tracking-tight text-bone">
                      {currentTier.name}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ash">
                      <span className="font-medium text-bone/90">Included benefit: </span>
                      {currentTier.perk}
                    </p>
                    <div className="mt-5">
                      <a
                        href="#contact"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-gold transition-colors hover:text-gold-deep"
                      >
                        Inquire for {currentTier.name} credentials
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </a>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="flex flex-col gap-3" role="tablist" aria-label="Membership Tiers">
              {TIERS.map((tier) => {
                const isSelected = tier.name === activeTier
                return (
                  <button
                    key={tier.name}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveTier(tier.name)}
                    className={`group relative flex min-h-[44px] w-full flex-col rounded-2xl border p-5 text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold ${
                      isSelected
                        ? 'border-gold/50 bg-ink-3/90 shadow-[0_0_24px_rgba(216,169,58,0.08)]'
                        : 'border-slate-line/70 bg-ink-2/40 hover:border-slate-line hover:bg-ink-3/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                            isSelected ? 'scale-110 bg-gold shadow-[0_0_8px_rgba(216,169,58,0.8)]' : 'bg-slate-line group-hover:bg-ash/50'
                          }`}
                        />
                        <span className="font-display text-xl font-semibold tracking-tight text-bone">
                          {tier.name}
                        </span>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 font-mono text-xs font-medium transition-colors duration-300 ${
                          isSelected
                            ? 'border-gold/50 bg-gold/10 text-gold'
                            : 'border-slate-line bg-ink/50 text-ash/80 group-hover:border-slate-line/80 group-hover:text-ash'
                        }`}
                      >
                        {tier.rate}
                      </span>
                    </div>
                    <div className="mt-2 pl-5.5 text-sm text-ash">
                      {tier.note}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Quotes carousel ────────────────────────────────────────── */}
      <section id="quotes" className="px-5 pb-32 md:pb-48">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-line/80 bg-ink-2/50 p-8 md:p-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-3">
                {QUOTES.map((q, i) => (
                  <button
                    key={q.seed}
                    type="button"
                    onClick={() => setActiveQuote(i)}
                    aria-label={`Show quote ${i + 1}`}
                    aria-pressed={i === activeQuote}
                    className={`h-14 w-14 overflow-hidden rounded-full border-2 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold ${
                      i === activeQuote
                        ? 'z-10 scale-110 border-gold shadow-[0_0_16px_rgba(216,169,58,0.3)]'
                        : 'border-ink-3 opacity-55 hover:opacity-90'
                    }`}
                  >
                    <img src={img(q.seed, 200, 200)} alt="" className="h-full w-full object-cover grayscale" />
                  </button>
                ))}
              </div>

              {/* Step indicator */}
              <div className="pl-2 font-mono text-xs text-ash/80">
                0{activeQuote + 1} <span className="text-ash/40">/</span> 0{QUOTES.length}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevQuote}
                aria-label="Previous quote"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-line bg-ink-3 text-bone transition-colors hover:border-gold/50 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={nextQuote}
                aria-label="Next quote"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-line bg-ink-3 text-bone transition-colors hover:border-gold/50 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div key={activeQuote} className="quote-enter mt-8">
            <figure>
              <blockquote className="font-display text-[clamp(1.25rem,2.3vw,1.95rem)] font-medium leading-[1.35] tracking-[-0.01em]">
                {QUOTES[activeQuote]?.quote}
              </blockquote>
              <figcaption className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ash">
                <span className="font-semibold text-bone">{QUOTES[activeQuote]?.who}</span>
                <span className="text-ash/40">·</span>
                <span>{QUOTES[activeQuote]?.role}</span>
              </figcaption>
            </figure>

            {/* Authentic production & gear metadata badges */}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-line/60 pt-6">
              <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-line bg-ink-3/70 px-2.5 py-1 font-mono text-xs text-ash">
                <span className="text-gold">Project:</span>
                <span>{QUOTES[activeQuote]?.production}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-line bg-ink-3/70 px-2.5 py-1 font-mono text-xs text-ash">
                <span className="text-gold">Gear:</span>
                <span>{QUOTES[activeQuote]?.gear}</span>
              </div>
            </div>
          </div>

          {/* Honest disclosure: see the QUOTES comment in this file. */}
          <p className="mt-10 rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm text-gold/90">
            Draft notice: these three quotes are placeholders, not real client
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
            Placeholder contact details: replace the phone number and address
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
              Babin Rentals Pvt. Ltd. · Boudha, Kathmandu, Nepal.
              <br />
              VAT 623587106
            </p>
          </div>

          <div className="flex gap-14">
            <div className="flex flex-col gap-3 text-sm text-ash">
              <a href="#kit" className="transition-colors hover:text-bone">Kit</a>
              <a href="#packages" className="transition-colors hover:text-bone">Packages</a>
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
