import { rupees, formatMoney, type Paisa } from '../lib/money'
import { kathmanduCivil } from '../lib/bs'
import { getSetting } from '../lib/settingsStore'
import type { StatusKey } from '../lib/status'

export type ClientType = 'Organisation' | 'Individual' | 'Unassigned'

export type OrganisationType =
  | 'Production House'
  | 'Rental House'
  | 'College / Institution'
  | 'Corporate / Agency'
  | 'Government / NGO'
  | 'Broadcaster'
  | 'Other'

export type Profession =
  | 'Cinematographer'
  | 'Director'
  | 'Assistant Camera'
  | 'Gaffer'
  | 'Editor'
  | 'Photographer'
  | 'Producer'
  | 'Sound'
  | 'Other'

export type Segment =
  | 'Wedding / Event'
  | 'Corporate'
  | 'Documentary'
  | 'Music Video'
  | 'Commercial'
  | 'Feature'
  | 'YouTube / Creator'
  | 'Education'
  | 'Other'

export type MembershipTier =
  | 'Academy'
  | 'Creator'
  | 'Cinematographer'
  | 'Production Alliance'
  | 'Elite'

export type KycStatus = 'Verified' | 'Pending Review' | 'Rejected' | 'Not Submitted'

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = [
  'Academy',
  'Creator',
  'Cinematographer',
  'Production Alliance',
  'Elite',
]

/**
 * @deprecated Appearance does not belong in `src/data`. **Ruled 26 Aug 2026.**
 *
 * A membership tier is a **domain fact** — an attribute of a client, like a PAN
 * or a phone number. Typing it as `StatusKey` makes it look like an operational
 * state and invites every call site to paint it with a status hue, which is the
 * entity/state confusion DESIGN_DIRECTION_SPEC_v4.1 §2 forbids: each of the
 * seven hues carries exactly one meaning, so `Elite: 'out'` below tells a floor
 * reading orange that the gear is out with a client, and `Creator: 'in'` claims
 * green's "home & settled". Nothing about a tier is either of those things.
 *
 * The decision has moved to the presentation layer. `modules/clients/Membership.tsx`
 * now owns `TIER_ACCENT`, which paints tiers from the **categorical** ramp
 * (`--cat-1..5`) as icon ink rather than from the status set, and `data/membership.ts`
 * no longer carries a `badgeKey` at all — `Plan` is pure domain data.
 *
 * This constant survives only because four call sites outside that change's scope
 * still read it. It is the migration list, and it is **closed** — no new consumer:
 *
 *   - `data/clientIntel.ts:166`  — tier fact chip
 *   - `data/clientIntel.ts:195`  — client avatar tint
 *   - `modules/clients/Clients.tsx:482, 562`
 *   - `modules/clients/ClientsDirectory.tsx:1371, 1392, 1542, 1599`
 *   - `modules/clients/ClientDetail.tsx:718`  — reads it only to test for `'danger'`
 *
 * Until those move, the Clients directory and the Membership tab paint the same
 * tier differently. That divergence is the cost of the partial migration and is
 * tracked here rather than hidden.
 *
 * TODO(migration) — retire this export: point the five files above at the
 * presentation-layer mapping (promoting `TIER_ACCENT` out of `Membership.tsx`
 * into a shared UI module at that point), then delete it. `ClientDetail.tsx:718`
 * needs a separate decision first: it uses this map as a stand-in for "is this
 * tier a problem?", which no tier ever is — that branch is dead today because no
 * tier maps to `'danger'`.
 */
export const TIER_TONE: Record<MembershipTier, StatusKey> = {
  Academy: 'neutral',
  Creator: 'in',
  Cinematographer: 'primary',
  'Production Alliance': 'progress',
  Elite: 'out',
}

export interface ClientRecord {
  /**
   * The client CODE — `C-34` — not a uuid. Every screen keys on this and the
   * directory renders it, so it stays as-is.
   *
   * ⚠ It is NOT what a write wants. `clients.id` is a uuid and every FK points
   * at that, which is why `dbId` exists below.
   */
  id: string
  /**
   * `clients.id` — the real uuid, for actions that write.
   *
   * **Optional because seed rows have none.** `data/clients.ts`'s own array is
   * demo data with codes for ids, and a screen holding one of those cannot
   * create a booking — `createRental.validate` refuses a `C-` code by name
   * rather than letting it fail an FK three layers down. Populated only by
   * `queries/clients.ts:toClientRecord`, i.e. only by rows that came from the
   * database. A caller that needs to write MUST check it and refuse when absent,
   * rather than falling back to `id`.
   */
  dbId?: string
  name: string
  company?: string
  clientType: ClientType
  organisationType?: OrganisationType
  profession?: Profession[]
  segment?: Segment[]
  membership: MembershipTier
  phone: string
  email: string
  pan?: string
  isVip?: boolean
  isVerified?: boolean
  isBlocked?: boolean
  blockReason?: string
  currentRentalsCount: number
  activeBookings: string[]
  outstandingPaisa: Paisa
  depositHeldPaisa: Paisa
  creditLimitPaisa: Paisa
  creditUsedPaisa: Paisa
  lastRentalAtAd?: string | null
  lastRentalAd: string // '18 Jul 2026'
  lastRentalBs: string // '2083/04/03'
  address: string
  /** Optional address breakdown, captured by the Add Client page. `address` above stays the single line the rest of the app already reads. */
  city?: string
  district?: string
  postalCode?: string
  country?: string
  businessRegistrationNo?: string
  contactPerson: {
    name: string
    designation: string
    phone: string
  }
  kycStatus: KycStatus
  kycDocsCount: number
  totalRentalsCount: number
  totalSpentPaisa: Paisa
  /** AD, ISO date. Law: store AD, render BS via lib/bs.ts — never store BS. */
  clientSinceAd?: string
  source?: string
  referredBy?: string
  paymentTerms?: string
  preferredContactMethods?: string[]
  notes?: string
  /**
   * Law 3 applied to clients: a merge is a named terminal action, not a
   * delete. A merged-away record stays in `CLIENTS_DATA` — every screen that
   * lists clients should treat a record with this set as closed, the same
   * way `isBlocked` is already treated as a state to filter or flag, never a
   * reason to remove the row.
   */
  mergedIntoId?: string
  mergedAt?: string

  /* ---- Hover Intel System v2.1 (9 Aug 2026) additions ----------------
   * All optional and unbackfilled on the 36 existing records deliberately:
   * this mock layer stands in for Phase 2's real client query, and
   * `clientIntel.ts` renders "—" / omits a group rather than treat a
   * missing value as zero. Only 3 records (0001, 0004, 0005) carry real
   * values, enough to demonstrate every group in the spec. */

  /** Present in `clients` table (`tags text[]`) but missing from this mock type until now. */
  tags?: string[]
  /** §1 "multiple addresses: billing + delivery/site". Falls back to the single `address` line above as one Billing entry when absent. */
  addresses?: Array<{ kind: 'Billing' | 'Delivery'; label: string; address: string }>
  /**
   * §1 Commercial group. No per-category deposit-% table exists yet
   * (Open ⭐ #1 in HIS v2.1 §"Open"), so `depositOverridePercent` stays
   * genuinely absent rather than a guessed number — do not seed it.
   */
  standingDiscountPercent?: number
  discountSource?: 'Type Rule' | 'Membership' | 'Named Client'
  /**
   * ⚠ **Not the source of truth for On Stop.** Rulings §11.2 (13 Aug 2026) made
   * On Stop a *derived* state — see `evaluateCreditStop` below, which is the
   * only place the question is answered. This field is the older manual
   * annotation from HIS v2.1 §1 Credit control (Current RMS's On-Stop model),
   * kept because Law 3 deletes nothing and because it carries a **who** and a
   * **when** that no derivation can produce.
   *
   * It is deliberately **not** an input to the predicate: feeding it back in
   * would restore exactly the stale flag the ruling removed — one that keeps
   * saying "on stop" after the client has paid. `lib/queries/clients.ts` never
   * sets it, so it exists on seed records only.
   */
  onStop?: { reason: string; setBy: string; setAd: string }
  /** §1 Reliability [NEW] — absent everywhere in the schema and this mock layer until now. Counts only; no ₨-recovered figure is modelled yet. */
  reliability?: { lateReturns: number; totalReturns: number; damageCases: number; missingCases: number; avgDaysLateOverall: number }
}

export const CLIENTS_DATA: ClientRecord[] = [
  {
    id: 'C-1',
    name: 'Kathmandu Cinema Works',
    company: 'KCW Studios Pvt. Ltd.',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Production Alliance',
    phone: '+977 980-1234567',
    email: 'production@kcwstudios.com.np',
    pan: '601928473',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 2,
    activeBookings: ['B-715', 'B-718'],
    outstandingPaisa: rupees(124506),
    depositHeldPaisa: rupees(50000),
    creditLimitPaisa: rupees(500000),
    creditUsedPaisa: rupees(124506),
    lastRentalAd: '18 Jul 2026',
    lastRentalBs: '2083/04/03',
    address: 'Baluwatar, Kathmandu, Ward 4',
    contactPerson: {
      name: 'Aarav Shrestha',
      designation: 'Line Producer',
      phone: '+977 980-1234568',
    },
    kycStatus: 'Verified',
    kycDocsCount: 4,
    totalRentalsCount: 38,
    totalSpentPaisa: rupees(4850000),
    tags: ['Feature Film', 'Repeat Client', 'Priority Support'],
    addresses: [
      { kind: 'Billing', label: 'Registered office', address: 'Baluwatar, Kathmandu, Ward 4' },
      { kind: 'Delivery', label: 'Production office', address: 'Studio 3, Gairidhara, Kathmandu' },
    ],
    standingDiscountPercent: 8,
    discountSource: 'Named Client',
    reliability: { lateReturns: 1, totalReturns: 38, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.1 },
  },
  {
    id: 'C-2',
    name: 'Kathmandu University',
    company: 'Department of Media & Film Studies',
    clientType: 'Organisation',
    organisationType: 'College / Institution',
    membership: 'Academy',
    phone: '+977 11-415100',
    email: 'media.dept@ku.edu.np',
    pan: '300019283',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-720'],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(25000),
    creditLimitPaisa: rupees(200000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '15 Jul 2026',
    lastRentalBs: '2083/03/31',
    address: 'Dhulikhel, Kavrepalanchok',
    contactPerson: {
      name: 'Dr. Bishnu Pokharel',
      designation: 'Department Head',
      phone: '+977 984-1392847',
    },
    kycStatus: 'Verified',
    kycDocsCount: 3,
    totalRentalsCount: 14,
    totalSpentPaisa: rupees(920000),
  },
  {
    id: 'C-3',
    name: 'Bikram Rai',
    clientType: 'Individual',
    profession: ['Cinematographer'],
    membership: 'Cinematographer',
    phone: '+977 984-1827364',
    email: 'bikram.dop@gmail.com',
    pan: '109283746',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-722'],
    outstandingPaisa: rupees(35000),
    depositHeldPaisa: rupees(40000),
    creditLimitPaisa: rupees(150000),
    creditUsedPaisa: rupees(35000),
    lastRentalAd: '14 Jul 2026',
    lastRentalBs: '2083/03/30',
    address: 'Jhamsikhel, Lalitpur',
    contactPerson: {
      name: 'Bikram Rai',
      designation: 'Director of Photography',
      phone: '+977 984-1827364',
    },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 22,
    totalSpentPaisa: rupees(1640000),
    reliability: { lateReturns: 0, totalReturns: 22, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0 },
  },
  {
    id: 'C-4',
    name: 'Himalayan Mountain Media',
    company: 'Himalayan Media Group',
    clientType: 'Organisation',
    organisationType: 'Broadcaster',
    membership: 'Elite',
    phone: '+977 1-4412983',
    email: 'ops@himalayanmedia.tv',
    pan: '600192847',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 3,
    activeBookings: ['B-710', 'B-712', 'B-714'],
    outstandingPaisa: rupees(215000),
    depositHeldPaisa: rupees(100000),
    creditLimitPaisa: rupees(1000000),
    creditUsedPaisa: rupees(215000),
    lastRentalAd: '17 Jul 2026',
    lastRentalBs: '2083/04/02',
    address: 'Naxal, Kathmandu',
    contactPerson: {
      name: 'Sunita Gurung',
      designation: 'Technical Director',
      phone: '+977 985-1029384',
    },
    kycStatus: 'Verified',
    kycDocsCount: 5,
    totalRentalsCount: 52,
    totalSpentPaisa: rupees(7400000),
    tags: ['Broadcast', 'Live Events', 'Gold Tier'],
    addresses: [
      { kind: 'Billing', label: 'Head office', address: 'Naxal, Kathmandu' },
      { kind: 'Delivery', label: 'Studio / OB van bay', address: 'Gairigaun, Kathmandu' },
    ],
    standingDiscountPercent: 12,
    discountSource: 'Membership',
    reliability: { lateReturns: 4, totalReturns: 52, damageCases: 1, missingCases: 0, avgDaysLateOverall: 0.6 },
  },
  {
    id: 'C-5',
    name: 'Shine Pictures Nepal',
    company: 'Shine Entertainment LLC',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Creator',
    phone: '+977 981-8765432',
    email: 'accounts@shinepictures.com',
    pan: '603948571',
    isVip: false,
    isVerified: false,
    isBlocked: true,
    blockReason: 'Outstanding overdue > 60 days without dispute',
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(98500),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(98500),
    lastRentalAd: '02 May 2026',
    lastRentalBs: '2083/01/20',
    address: 'Putalisadak, Kathmandu',
    contactPerson: {
      name: 'Roshan Thapa',
      designation: 'Managing Partner',
      phone: '+977 981-8765432',
    },
    kycStatus: 'Pending Review',
    kycDocsCount: 1,
    totalRentalsCount: 6,
    totalSpentPaisa: rupees(380000),
    tags: ['Payment Risk'],
    onStop: { reason: 'Outstanding overdue > 60 days without dispute', setBy: 'Rita Manandhar', setAd: '05 Jul 2026' },
    reliability: { lateReturns: 3, totalReturns: 6, damageCases: 1, missingCases: 1, avgDaysLateOverall: 4.2 },
  },
  {
    id: 'C-6',
    name: 'Nepal Tourism Board',
    clientType: 'Organisation',
    organisationType: 'Government / NGO',
    membership: 'Production Alliance',
    phone: '+977 1-4256909',
    email: 'promotions@welcomenepal.com',
    pan: '301928475',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(100000),
    creditLimitPaisa: rupees(800000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '28 Jun 2026',
    lastRentalBs: '2083/03/14',
    address: 'Bhrikutimandap, Kathmandu',
    contactPerson: {
      name: 'Manish Adhikari',
      designation: 'Media Relations Officer',
      phone: '+977 985-1102938',
    },
    kycStatus: 'Verified',
    kycDocsCount: 4,
    totalRentalsCount: 19,
    totalSpentPaisa: rupees(2950000),
    reliability: { lateReturns: 1, totalReturns: 19, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.1 },
  },
  {
    id: 'C-7',
    name: 'Sushil Lama Visuals',
    clientType: 'Individual',
    profession: ['Cinematographer'],
    membership: 'Creator',
    phone: '+977 984-9988776',
    email: 'sushil.lama@outlook.com',
    pan: '108273645',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-725'],
    outstandingPaisa: rupees(18000),
    depositHeldPaisa: rupees(30000),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(18000),
    lastRentalAd: '16 Jul 2026',
    lastRentalBs: '2083/04/01',
    address: 'Boudha, Kathmandu',
    contactPerson: {
      name: 'Sushil Lama',
      designation: 'Videographer',
      phone: '+977 984-9988776',
    },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 9,
    totalSpentPaisa: rupees(540000),
    reliability: { lateReturns: 0, totalReturns: 9, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0 },
  },
  {
    id: 'C-8',
    name: 'Apex College Media Club',
    company: 'Apex College',
    clientType: 'Organisation',
    organisationType: 'College / Institution',
    membership: 'Academy',
    phone: '+977 1-4478440',
    email: 'apexmediaclub@apexcollege.edu.np',
    pan: '302847561',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(15000),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '08 Jul 2026',
    lastRentalBs: '2083/03/24',
    address: 'Mid Baneshwor, Kathmandu',
    contactPerson: {
      name: 'Prashant Sharma',
      designation: 'Club President',
      phone: '+977 986-0192837',
    },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 8,
    totalSpentPaisa: rupees(310000),
  },
  {
    id: 'C-9',
    name: 'ICIMOD Communications',
    company: 'International Centre for Integrated Mountain Development',
    clientType: 'Organisation',
    organisationType: 'Government / NGO',
    membership: 'Production Alliance',
    phone: '+977 1-5275222',
    email: 'media@icimod.org',
    pan: '500192837',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-728'],
    outstandingPaisa: rupees(75000),
    depositHeldPaisa: rupees(80000),
    creditLimitPaisa: rupees(600000),
    creditUsedPaisa: rupees(75000),
    lastRentalAd: '12 Jul 2026',
    lastRentalBs: '2083/03/28',
    address: 'Khumaltar, Lalitpur',
    contactPerson: {
      name: 'Priya Ranjan',
      designation: 'Communications Lead',
      phone: '+977 980-2837465',
    },
    kycStatus: 'Verified',
    kycDocsCount: 4,
    totalRentalsCount: 16,
    totalSpentPaisa: rupees(2180000),
  },
  {
    id: 'C-10',
    name: 'Red Dot Films',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Elite',
    phone: '+977 985-1192837',
    email: 'info@reddotfilms.com.np',
    pan: '601827364',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 2,
    activeBookings: ['B-730', 'B-731'],
    outstandingPaisa: rupees(142000),
    depositHeldPaisa: rupees(60000),
    creditLimitPaisa: rupees(800000),
    creditUsedPaisa: rupees(142000),
    lastRentalAd: '17 Jul 2026',
    lastRentalBs: '2083/04/02',
    address: 'Sanepa, Lalitpur',
    contactPerson: {
      name: 'Nabin Basnet',
      designation: 'Executive Producer',
      phone: '+977 985-1192837',
    },
    kycStatus: 'Verified',
    kycDocsCount: 5,
    totalRentalsCount: 44,
    totalSpentPaisa: rupees(6120000),
    reliability: { lateReturns: 1, totalReturns: 44, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.1 },
  },
  {
    id: 'C-11',
    name: 'Aashish Karmacharya',
    clientType: 'Individual',
    membership: 'Creator',
    phone: '+977 984-3019283',
    email: 'aashish.k@gmail.com',
    pan: '109384756',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(50000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '20 Jun 2026',
    lastRentalBs: '2083/03/06',
    address: 'Thamel, Kathmandu',
    contactPerson: {
      name: 'Aashish Karmacharya',
      designation: 'Photographer',
      phone: '+977 984-3019283',
    },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 5,
    totalSpentPaisa: rupees(185000),
  },
  {
    id: 'C-12',
    name: 'Vortex Visuals Group',
    company: 'Vortex Productions',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Cinematographer',
    phone: '+977 980-8765123',
    email: 'vortex@gmail.com',
    pan: '609827364',
    isVip: false,
    isVerified: false,
    isBlocked: true,
    blockReason: 'Unresolved gear damage incident CASE-2026-0038',
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(134000),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(150000),
    creditUsedPaisa: rupees(134000),
    lastRentalAd: '10 Jun 2026',
    lastRentalBs: '2083/02/27',
    address: 'Chabahil, Kathmandu',
    contactPerson: {
      name: 'Dipen Silwal',
      designation: 'Owner',
      phone: '+977 980-8765123',
    },
    kycStatus: 'Rejected',
    kycDocsCount: 2,
    totalRentalsCount: 7,
    totalSpentPaisa: rupees(450000),
    reliability: { lateReturns: 2, totalReturns: 7, damageCases: 1, missingCases: 0, avgDaysLateOverall: 2.1 },
  },
  /*
    The render's directory carries 284 clients over 12 pages. The seed below
    takes the count to 26 so that "Showing 1 to 25 of 26" and the page control
    are describing something real — a hardcoded 284 over twelve dead page
    buttons would be a picture of a list, not a list.
  */
  {
    id: 'C-13',
    name: 'Everest Frames',
    company: 'Everest Frames Pvt. Ltd.',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Cinematographer',
    phone: '+977 985-2938475',
    email: 'hello@everestframes.com.np',
    pan: '602837465',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-733'],
    outstandingPaisa: rupees(26000),
    depositHeldPaisa: rupees(45000),
    creditLimitPaisa: rupees(150000),
    creditUsedPaisa: rupees(26000),
    lastRentalAd: '16 Jul 2026',
    lastRentalBs: '2083/04/01',
    address: 'Maharajgunj, Kathmandu',
    contactPerson: { name: 'Anisha Tamang', designation: 'Producer', phone: '+977 985-2938475' },
    kycStatus: 'Verified',
    kycDocsCount: 3,
    totalRentalsCount: 12,
    totalSpentPaisa: rupees(870000),
    reliability: { lateReturns: 0, totalReturns: 12, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0 },
  },
  {
    id: 'C-14',
    name: 'Pokhara Lakeside Studios',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Creator',
    phone: '+977 61-465120',
    email: 'studio@lakeside.com.np',
    pan: '604738291',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(20000),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '01 Jul 2026',
    lastRentalBs: '2083/03/17',
    address: 'Lakeside, Pokhara Ward 6',
    contactPerson: { name: 'Rabin Poudel', designation: 'Owner', phone: '+977 61-465120' },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 11,
    totalSpentPaisa: rupees(640000),
  },
  {
    id: 'C-15',
    name: 'Sagarmatha Television',
    company: 'Sagarmatha Broadcasting',
    clientType: 'Organisation',
    organisationType: 'Broadcaster',
    membership: 'Production Alliance',
    phone: '+977 1-4102938',
    email: 'newsroom@sagarmathatv.com',
    pan: '600283746',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 2,
    activeBookings: ['B-736', 'B-737'],
    outstandingPaisa: rupees(88000),
    depositHeldPaisa: rupees(120000),
    creditLimitPaisa: rupees(700000),
    creditUsedPaisa: rupees(88000),
    lastRentalAd: '19 Jul 2026',
    lastRentalBs: '2083/04/04',
    address: 'Tinkune, Kathmandu',
    contactPerson: { name: 'Kritika Joshi', designation: 'Bureau Chief', phone: '+977 985-4738291' },
    kycStatus: 'Verified',
    kycDocsCount: 5,
    totalRentalsCount: 33,
    totalSpentPaisa: rupees(4120000),
    reliability: { lateReturns: 1, totalReturns: 33, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.1 },
  },
  {
    id: 'C-16',
    name: 'Bhaktapur Heritage Trust',
    clientType: 'Organisation',
    organisationType: 'Government / NGO',
    membership: 'Academy',
    phone: '+977 1-6610283',
    email: 'archive@bhtrust.org.np',
    pan: '502837461',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(10000),
    creditLimitPaisa: rupees(50000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '22 Jun 2026',
    lastRentalBs: '2083/03/08',
    address: 'Durbar Square, Bhaktapur',
    contactPerson: { name: 'Nirajan Suwal', designation: 'Archivist', phone: '+977 984-2019384' },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 6,
    totalSpentPaisa: rupees(210000),
  },
  {
    id: 'C-17',
    name: 'Manisha Bajracharya',
    clientType: 'Individual',
    profession: ['Cinematographer'],
    membership: 'Creator',
    phone: '+977 986-1029384',
    email: 'manisha.dop@gmail.com',
    pan: '107364829',
    isVip: false,
    isVerified: false,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-739'],
    outstandingPaisa: rupees(12500),
    depositHeldPaisa: rupees(25000),
    creditLimitPaisa: rupees(75000),
    creditUsedPaisa: rupees(12500),
    lastRentalAd: '18 Jul 2026',
    lastRentalBs: '2083/04/03',
    address: 'Patan Dhoka, Lalitpur',
    contactPerson: { name: 'Manisha Bajracharya', designation: 'Camera Operator', phone: '+977 986-1029384' },
    kycStatus: 'Pending Review',
    kycDocsCount: 1,
    totalRentalsCount: 4,
    totalSpentPaisa: rupees(160000),
  },
  {
    id: 'C-18',
    name: 'Annapurna Post Media',
    company: 'Annapurna Media Network',
    clientType: 'Organisation',
    organisationType: 'Broadcaster',
    membership: 'Elite',
    phone: '+977 1-5970283',
    email: 'production@annapurnamedia.com',
    pan: '601029384',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 2,
    activeBookings: ['B-741', 'B-742'],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(150000),
    creditLimitPaisa: rupees(1000000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '19 Jul 2026',
    lastRentalBs: '2083/04/04',
    address: 'Tinkune, Kathmandu',
    contactPerson: { name: 'Deepak Rajbhandari', designation: 'Head of Production', phone: '+977 985-0192837' },
    kycStatus: 'Verified',
    kycDocsCount: 5,
    totalRentalsCount: 61,
    totalSpentPaisa: rupees(8940000),
    reliability: { lateReturns: 1, totalReturns: 61, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.1 },
  },
  {
    id: 'C-19',
    name: 'Lumbini Development Trust',
    clientType: 'Organisation',
    organisationType: 'Government / NGO',
    membership: 'Production Alliance',
    phone: '+977 71-580123',
    email: 'media@lumbinitrust.gov.np',
    pan: '300283746',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(64000),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(400000),
    creditUsedPaisa: rupees(64000),
    lastRentalAd: '05 Jul 2026',
    lastRentalBs: '2083/03/21',
    address: 'Lumbini, Rupandehi',
    contactPerson: { name: 'Sabina Chaudhary', designation: 'Publicity Officer', phone: '+977 984-8271639' },
    kycStatus: 'Verified',
    kycDocsCount: 3,
    totalRentalsCount: 10,
    totalSpentPaisa: rupees(1180000),
  },
  {
    id: 'C-20',
    name: 'Chitwan Wildlife Films',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Cinematographer',
    phone: '+977 56-520394',
    email: 'shoot@chitwanwildlife.com',
    pan: '605647382',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-744'],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(60000),
    creditLimitPaisa: rupees(200000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '17 Jul 2026',
    lastRentalBs: '2083/04/02',
    address: 'Sauraha, Chitwan',
    contactPerson: { name: 'Pramod Mahato', designation: 'Field Producer', phone: '+977 984-6574839' },
    kycStatus: 'Verified',
    kycDocsCount: 3,
    totalRentalsCount: 17,
    totalSpentPaisa: rupees(1420000),
    reliability: { lateReturns: 0, totalReturns: 17, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0 },
  },
  {
    id: 'C-21',
    name: 'Namaste Weddings',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Creator',
    phone: '+977 980-5647382',
    email: 'book@namasteweddings.np',
    pan: '606574839',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-746'],
    outstandingPaisa: rupees(9500),
    depositHeldPaisa: rupees(20000),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(9500),
    lastRentalAd: '18 Jul 2026',
    lastRentalBs: '2083/04/03',
    address: 'Kumaripati, Lalitpur',
    contactPerson: { name: 'Sujata Maharjan', designation: 'Studio Manager', phone: '+977 980-5647382' },
    kycStatus: 'Verified',
    kycDocsCount: 2,
    totalRentalsCount: 24,
    totalSpentPaisa: rupees(980000),
    reliability: { lateReturns: 1, totalReturns: 24, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.2 },
  },
  {
    id: 'C-22',
    name: 'Nepal Film Institute',
    company: 'NFI Academy',
    clientType: 'Organisation',
    organisationType: 'College / Institution',
    membership: 'Academy',
    phone: '+977 1-4433021',
    email: 'labs@nfi.edu.np',
    pan: '304738291',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 2,
    activeBookings: ['B-748', 'B-749'],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(30000),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '19 Jul 2026',
    lastRentalBs: '2083/04/04',
    address: 'Kalanki, Kathmandu',
    contactPerson: { name: 'Ram Prasad Neupane', designation: 'Lab Coordinator', phone: '+977 985-4738291' },
    kycStatus: 'Verified',
    kycDocsCount: 3,
    totalRentalsCount: 29,
    totalSpentPaisa: rupees(1340000),
    reliability: { lateReturns: 0, totalReturns: 29, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0 },
  },
  {
    id: 'C-23',
    name: 'Trishuli Adventure Media',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Creator',
    phone: '+977 982-1938475',
    email: 'raft@trishulimedia.com',
    isVip: false,
    isVerified: false,
    isBlocked: true,
    blockReason: 'Water-damage claim CASE-2026-0044 unsettled',
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(72000),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(100000),
    creditUsedPaisa: rupees(72000),
    lastRentalAd: '28 May 2026',
    lastRentalBs: '2083/02/14',
    address: 'Mugling, Chitwan',
    contactPerson: { name: 'Kiran Gurung', designation: 'Owner', phone: '+977 982-1938475' },
    kycStatus: 'Rejected',
    kycDocsCount: 1,
    totalRentalsCount: 3,
    totalSpentPaisa: rupees(190000),
    reliability: { lateReturns: 1, totalReturns: 3, damageCases: 1, missingCases: 0, avgDaysLateOverall: 4.0 },
  },
  {
    id: 'C-24',
    name: 'Mustang Documentary Unit',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Cinematographer',
    phone: '+977 984-5738291',
    email: 'unit@mustangdocs.com',
    pan: '607382910',
    isVip: true,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-751'],
    outstandingPaisa: rupees(41000),
    depositHeldPaisa: rupees(80000),
    creditLimitPaisa: rupees(250000),
    creditUsedPaisa: rupees(41000),
    lastRentalAd: '15 Jul 2026',
    lastRentalBs: '2083/03/31',
    address: 'Jomsom, Mustang',
    contactPerson: { name: 'Tenzin Gurung', designation: 'Unit Director', phone: '+977 984-5738291' },
    kycStatus: 'Verified',
    kycDocsCount: 4,
    totalRentalsCount: 21,
    totalSpentPaisa: rupees(2760000),
    reliability: { lateReturns: 1, totalReturns: 21, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0.3 },
  },
  {
    id: 'C-25',
    name: 'Janakpur Culture Channel',
    clientType: 'Organisation',
    organisationType: 'Broadcaster',
    membership: 'Creator',
    phone: '+977 41-590283',
    email: 'desk@janakpurchannel.np',
    pan: '608291736',
    isVip: false,
    isVerified: false,
    isBlocked: false,
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(50000),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '—',
    lastRentalBs: '—',
    address: 'Janakpurdham, Dhanusha',
    contactPerson: { name: 'Anil Yadav', designation: 'Programme Head', phone: '+977 41-590283' },
    kycStatus: 'Not Submitted',
    kycDocsCount: 0,
    totalRentalsCount: 0,
    totalSpentPaisa: rupees(0),
  },
  {
    id: 'C-26',
    name: 'Gandaki Sports Media',
    clientType: 'Organisation',
    organisationType: 'Production House',
    membership: 'Production Alliance',
    phone: '+977 61-538291',
    email: 'ops@gandakisports.com',
    pan: '609182736',
    isVip: false,
    isVerified: true,
    isBlocked: false,
    currentRentalsCount: 1,
    activeBookings: ['B-753'],
    outstandingPaisa: rupees(33000),
    depositHeldPaisa: rupees(70000),
    creditLimitPaisa: rupees(300000),
    creditUsedPaisa: rupees(33000),
    lastRentalAd: '19 Jul 2026',
    lastRentalBs: '2083/04/04',
    address: 'Prithvi Chowk, Pokhara',
    contactPerson: { name: 'Bibek Thapa', designation: 'Operations Lead', phone: '+977 61-538291' },
    kycStatus: 'Verified',
    kycDocsCount: 4,
    totalRentalsCount: 26,
    totalSpentPaisa: rupees(3180000),
    reliability: { lateReturns: 0, totalReturns: 26, damageCases: 0, missingCases: 0, avgDaysLateOverall: 0 },
  },
]

/* ── derived counters ──────────────────────────────────────────────────── */

/**
 * The KPI strip and the quick-filter chips both count the **same** list, so
 * they are computed from it once rather than typed twice. A hardcoded "284"
 * beside a table of 26 rows is a number the screen cannot defend.
 */
/**
 * Booking number → client id. `CLIENTS_DATA`, `data/operations.ts`'s `Job`
 * and `data/cases.ts`'s `Case` were authored independently and (like
 * `data/rentals.ts`/`data/documents.ts`, see `ClientDetail.tsx`) carry
 * disjoint client *names* for the same booking — so a Job/Case's own
 * `client`/`counterpartyName` string is not a reliable way to find the real
 * client record. The one thing genuinely shared is the booking number
 * itself: every `ClientRecord.activeBookings` entry is a real `B-...`
 * number, so resolving through that instead of through name-matching finds
 * the correct client whenever the two seed sets happen to reference the same
 * booking, and returns `undefined` — never a guessed or partial match —
 * when they don't.
 */
export function findClientIdByBooking(bookingNo: string | undefined, clients: ClientRecord[] = CLIENTS_DATA): string | undefined {
  if (!bookingNo) return undefined
  return clients.find((c) => c.activeBookings.includes(bookingNo))?.id
}

export function clientMetrics(rows: ClientRecord[]) {
  return {
    total: rows.length,
    onRent: rows.filter((c) => c.currentRentalsCount > 0).length,
    paymentDue: rows.filter((c) => c.outstandingPaisa > 0).length,
    blocked: rows.filter((c) => c.isBlocked).length,
    vip: rows.filter((c) => c.isVip).length,
    typeOrg: rows.filter((c) => c.clientType === 'Organisation').length,
    typeInd: rows.filter((c) => c.clientType === 'Individual').length,
    typeUnassigned: rows.filter((c) => c.clientType === 'Unassigned').length,
    outstandingPaisa: rows.reduce((sum, c) => (sum + c.outstandingPaisa) as Paisa, rupees(0)),
    depositHeldPaisa: rows.reduce((sum, c) => (sum + c.depositHeldPaisa) as Paisa, rupees(0)),
  }
}

/* ── On Stop — RULING §11.2, 13 Aug 2026 ───────────────────────────────── */

/**
 * # On Stop is DERIVED, and this is the one place it is derived.
 *
 * Spec 08 draws an `(On Stop)` chip twice. `client_flag_type` is
 * `VIP | Blocked | Upgrade Candidate` and there is no fourth member — Rulings
 * §11.2 settles it: **a client is On Stop when either**
 *
 *   1. their outstanding balance exceeds their credit limit, **or**
 *   2. they hold an invoice more than *N* days past its due date,
 *
 * where *N* is read from Settings ▸ Financial (`overdueStopDays`, default 30)
 * and never written into a module.
 *
 * ## Why one exported function and not three predicates
 *
 * The directory chip, the client record's credit box and any KPI all call
 * `evaluateCreditStop`. Two screens computing "on stop" their own way is the
 * same failure `clientIntel.ts` demonstrates today: its `isOnStop` at line 29
 * is `client.isBlocked || client.onStop`, which conflates a block with a credit
 * state and answers a different question from this one. **That file is not this
 * pass's to edit; the divergence is reported, not silently forked.**
 *
 * ## Blocked and On Stop intersect, they are not siblings of Active
 *
 * `0005_clients.sql`: *"Deactivated is terminal… Blocked is never written here
 * — it is a flag on `client_flags`"* and *"Flags coexist with the client's
 * state."* A client is routinely Active **and** on stop. Nothing in this module
 * folds the two together, and `ClientsDirectory` renders them as two
 * independent overlay toggles for that reason.
 *
 * ## A limb that cannot be evaluated is not a limb that passed
 *
 * Every field this reads can be genuinely absent, and each absence is reported
 * rather than defaulted:
 *
 *  · `lib/queries/clients.ts:toClientRecord` maps the directory view's **withheld**
 *    money (`null`, for a money-blind session) to `0`. So a zero outstanding
 *    read by a Warehouse session is not a zero — it is "not shown to you".
 *    `creditStopFactsOf` therefore reports both money facts as `null` for a
 *    money-blind session instead of pretending the client owes nothing.
 *  · The same mapping turns an absent `approved_credit_limit` into `0`. A limit
 *    of zero would put every client with a rupee outstanding over their limit,
 *    so a non-positive limit is read as **no limit recorded** and the limb
 *    reports itself unavailable.
 *  · `ClientRecord` carries no invoice due dates at all, so limb 2 is
 *    unavailable on a bare directory row and only becomes answerable where the
 *    invoices query has actually run (the client record's Payments data).
 *
 * When no limb could run, `indeterminate` is true and the caller must say the
 * check did not run. It must not render "clear".
 */
export type CreditStopLimb = 'credit-limit' | 'overdue-invoice'

export interface CreditStopFacts {
  /** Outstanding on issued invoices, or `null` when this session/record cannot supply it. */
  outstandingPaisa: Paisa | null
  /** Approved credit limit, or `null` when none is recorded or it is withheld. */
  creditLimitPaisa: Paisa | null
  /**
   * Whole days past due on the client's most overdue **unpaid, issued** invoice
   * — `0` when they hold none, and `null` when no invoice data was read.
   * `0` and `null` are different answers and are never collapsed.
   */
  daysPastDueOnOldestUnpaidInvoice: number | null
}

export interface CreditStopLimbVerdict {
  limb: CreditStopLimb
  label: string
  /** `true` fired · `false` clear · `null` the check could not run. */
  fired: boolean | null
  /**
   * Why it fired, or why it could not run.
   *
   * **Law 6** — this string never carries a rupee figure, so it is safe to put
   * in front of a money-blind role. The figures live in `detail`, which callers
   * render only behind `useCanViewMoney()`.
   */
  reason: string
  /** The same statement with the amounts in it. `null` unless money is visible. */
  detail: string | null
}

export interface CreditStopVerdict {
  onStop: boolean
  /** No limb could be evaluated. Say so — never render this as "clear". */
  indeterminate: boolean
  limbs: CreditStopLimbVerdict[]
  /** Figure-free reasons for the limbs that fired, in order. Empty when clear. */
  reasons: string[]
  /** With-figures reasons for the limbs that fired. Empty for a money-blind session. */
  details: string[]
  /** Why each limb that could not run did not run. */
  unavailable: string[]
}

export interface CreditStopOptions {
  /** From Settings ▸ Financial. Never a literal — see `readOverdueStopDays`. */
  overdueStopDays: number
  /** `useCanViewMoney()`. Decides whether `detail` is populated at all (Law 6). */
  canViewMoney: boolean
}

const LIMB_LABEL: Record<CreditStopLimb, string> = {
  'credit-limit': 'Over credit limit',
  'overdue-invoice': 'Invoice overdue',
}

export function evaluateCreditStop(facts: CreditStopFacts, opts: CreditStopOptions): CreditStopVerdict {
  const limbs: CreditStopLimbVerdict[] = []

  /* ── limb 1 — outstanding over the approved credit limit ─────────────── */
  const outstanding = facts.outstandingPaisa
  const limit = facts.creditLimitPaisa
  if (outstanding === null || limit === null) {
    limbs.push({
      limb: 'credit-limit',
      label: LIMB_LABEL['credit-limit'],
      fired: null,
      reason:
        'The credit-limit check did not run — the outstanding balance and the approved limit are not both readable on this record.',
      detail: null,
    })
  } else if (limit <= 0) {
    limbs.push({
      limb: 'credit-limit',
      label: LIMB_LABEL['credit-limit'],
      fired: null,
      reason:
        'The credit-limit check did not run — no approved credit limit is recorded for this client, and a limit of zero cannot be told apart from a limit that was never set.',
      detail: null,
    })
  } else {
    const over = outstanding > limit
    limbs.push({
      limb: 'credit-limit',
      label: LIMB_LABEL['credit-limit'],
      fired: over,
      reason: over
        ? 'Outstanding is over the approved credit limit.'
        : 'Outstanding is within the approved credit limit.',
      detail: opts.canViewMoney
        ? `Outstanding ${formatMoney(outstanding)} against an approved limit of ${formatMoney(limit)}.`
        : null,
    })
  }

  /* ── limb 2 — an invoice past due by more than N days ────────────────── */
  const days = facts.daysPastDueOnOldestUnpaidInvoice
  if (days === null) {
    limbs.push({
      limb: 'overdue-invoice',
      label: LIMB_LABEL['overdue-invoice'],
      fired: null,
      reason:
        'The overdue-invoice check did not run — no invoice due dates were read for this client, so how late they are is unknown.',
      detail: null,
    })
  } else {
    const late = days > opts.overdueStopDays
    limbs.push({
      limb: 'overdue-invoice',
      label: LIMB_LABEL['overdue-invoice'],
      fired: late,
      /* Days are not a rupee figure, so this stays whole for every role. */
      reason: late
        ? `An invoice is ${days} days past its due date — the limit set in Settings ▸ Financial is ${opts.overdueStopDays} days.`
        : days > 0
          ? `The oldest unpaid invoice is ${days} days past due, inside the ${opts.overdueStopDays}-day limit.`
          : 'No unpaid invoice is past its due date.',
      detail: null,
    })
  }

  const fired = limbs.filter((l) => l.fired === true)
  const unknown = limbs.filter((l) => l.fired === null)

  return {
    onStop: fired.length > 0,
    indeterminate: fired.length === 0 && unknown.length === limbs.length,
    limbs,
    reasons: fired.map((l) => l.reason),
    details: fired.map((l) => l.detail).filter((d): d is string => d !== null),
    unavailable: unknown.map((l) => l.reason),
  }
}

/**
 * The facts a `ClientRecord` can honestly supply.
 *
 * `daysPastDueOnOldestUnpaidInvoice` is passed in because the record does not
 * carry it — only a surface that has actually run the invoices query can answer
 * it, and one that has not must pass `null` rather than `0`.
 */
export function creditStopFactsOf(
  client: ClientRecord,
  opts: { canViewMoney: boolean; daysPastDueOnOldestUnpaidInvoice?: number | null },
): CreditStopFacts {
  const money = opts.canViewMoney
  return {
    outstandingPaisa: money ? client.outstandingPaisa : null,
    /*
     * A zero limit is passed THROUGH rather than folded into `null` here, so
     * that `evaluateCreditStop` can tell an operator *"no approved credit limit
     * is recorded for this client"* instead of the vaguer "not readable". Both
     * end in the same verdict — the limb cannot run — but only one of them says
     * what to go and fix. Folding it here made the specific message
     * unreachable, which the mock corpus (`lib/mock/corpus.ts:149`, every
     * `approved_credit_limit: null`) surfaced immediately.
     */
    creditLimitPaisa: money ? client.creditLimitPaisa : null,
    daysPastDueOnOldestUnpaidInvoice: opts.daysPastDueOnOldestUnpaidInvoice ?? null,
  }
}

/**
 * Whole days between an invoice's `due_date` and today, in the Kathmandu civil
 * day — the same truncation `queries/bookings.ts` uses, so the day this counts
 * from is the day a screen would label.
 *
 * `null` for an unparseable date: an invoice whose due date cannot be read is
 * not an invoice that is on time. Never negative — an invoice due next week is
 * `0` days past due, not −7.
 */
export function daysPastDue(dueDateAd: string, now: Date = new Date()): number | null {
  const due = Date.parse(`${dueDateAd}T00:00:00Z`)
  if (Number.isNaN(due)) return null
  return Math.max(0, Math.round((kathmanduCivil(now) - due) / 86_400_000))
}

/**
 * *N*, from Settings ▸ Financial. The single reader of `overdueStopDays`.
 *
 * A module may not write `30`; it calls this. `getSetting` re-reads storage per
 * call and falls back to the registry default when the stored value stopped
 * validating, so a hand-edited `localStorage` cannot put a nonsense threshold
 * in front of an operator.
 */
export function readOverdueStopDays(): number {
  return Number(getSetting('overdueStopDays'))
}

/* ── left filter rail (render `Clients - Directory A`) ─────────────────── */

export interface ClientFilterGroup {
  label: string
  icon: 'queues' | 'card' | 'users' | 'home' | 'crew' | 'calendar' | 'flag' | 'tool' | 'box'
  /** Money-shaped groups vanish for Warehouse rather than rendering empty. */
  money?: boolean
}

export const CLIENT_FILTER_GROUPS: ClientFilterGroup[] = [
  { label: 'Status', icon: 'queues' },
  { label: 'Membership Level', icon: 'card' },
  { label: 'Client Type', icon: 'users' },
  { label: 'Location', icon: 'home' },
  { label: 'Assigned Staff', icon: 'crew' },
  { label: 'Outstanding Amount', icon: 'card', money: true },
  { label: 'Deposit Held', icon: 'box', money: true },
  { label: 'Date', icon: 'calendar' },
  { label: 'Tags', icon: 'flag' },
  { label: 'More Filters', icon: 'tool' },
]

export function clientFilterGroupsFor(canSeeMoney: boolean): ClientFilterGroup[] {
  return canSeeMoney ? CLIENT_FILTER_GROUPS : CLIENT_FILTER_GROUPS.filter((g) => !g.money)
}

export const CLIENT_ROWS_PER_PAGE = [10, 25, 50] as const

/* ── Add Client page reference data ───────────────────────────────────── */

export const NEPAL_DISTRICTS: readonly string[] = [
  'Kathmandu',
  'Lalitpur',
  'Bhaktapur',
  'Kavrepalanchok',
  'Chitwan',
  'Makwanpur',
  'Kaski',
  'Rupandehi',
  'Morang',
  'Sunsari',
  'Jhapa',
  'Dhanusha',
  'Mustang',
  'Rasuwa',
  'Sindhupalchok',
  'Nuwakot',
  'Dolakha',
  'Gorkha',
  'Tanahun',
  'Syangja',
  'Baglung',
  'Dang',
  'Banke',
  'Bardiya',
  'Kailali',
  'Kanchanpur',
]

export const CLIENT_SOURCES: readonly string[] = [
  'Walk-in',
  'Phone',
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Website',
  'Google',
  'Referral',
  'Existing client',
  'College',
  'Production company',
  'Staff referral',
  'Other',
]

export const PAYMENT_TERMS_OPTIONS: readonly string[] = [
  'Due on Pickup',
  'Due on Return',
  'Net 7',
  'Net 15',
  'Net 30',
  'Prepaid',
  'Custom',
]

export const PREFERRED_CONTACT_METHODS: readonly string[] = ['Phone', 'Email', 'WhatsApp']

/* ── duplicate detection (Duplicate/Merge Center) ───────────────────────── */

export type DuplicateMatchReason = 'phone' | 'email' | 'pan' | 'name'

export interface DuplicateGroup {
  key: string
  reasons: DuplicateMatchReason[]
  clients: ClientRecord[]
}

/** Shared with `lib/clientImport.ts` — one normalizer, so a phone never matches under
 *  duplicate detection but misses under import matching, or the reverse. */
export function normalizedPhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchReasons(a: ClientRecord, b: ClientRecord): DuplicateMatchReason[] {
  const reasons: DuplicateMatchReason[] = []
  const phoneA = normalizedPhone(a.phone)
  const phoneB = normalizedPhone(b.phone)
  if (phoneA.length >= 7 && phoneA === phoneB) reasons.push('phone')
  const emailA = a.email.trim().toLowerCase()
  const emailB = b.email.trim().toLowerCase()
  if (emailA && emailA === emailB) reasons.push('email')
  if (a.pan && a.pan === b.pan) reasons.push('pan')
  const nameA = normalizedName(a.name)
  const nameB = normalizedName(b.name)
  if (nameA && nameA === nameB) reasons.push('name')
  return reasons
}

/**
 * Pairs clients that look like the same real-world entity entered twice —
 * exact match on phone (last 10 digits), email, PAN, or normalized name.
 * Deliberately no fuzzy/edit-distance matching: that needs a product
 * decision about the false-positive rate this business will tolerate
 * (TODO(decision), PLAN.md §4), not a threshold invented here.
 *
 * Clients are unioned by *any* shared field into one group, so two records
 * matching on both phone and email surface once with both reasons listed,
 * never as two separate cards. Records already merged away (`mergedIntoId`
 * set) are excluded — a closed record cannot be a duplicate candidate again.
 */
export function findDuplicateGroups(clients: ClientRecord[]): DuplicateGroup[] {
  const live = clients.filter((c) => !c.mergedIntoId)
  const parent = live.map((_, i) => i)
  const find = (i: number): number => {
    const p = parent[i]!
    if (p === i) return i
    const root = find(p)
    parent[i] = root
    return root
  }
  const union = (i: number, j: number) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[ri] = rj
  }

  const pairReasons = new Map<string, DuplicateMatchReason[]>()
  live.forEach((a, i) => {
    live.forEach((b, j) => {
      if (j <= i) return
      const reasons = matchReasons(a, b)
      if (reasons.length > 0) {
        union(i, j)
        pairReasons.set(`${i}:${j}`, reasons)
      }
    })
  })

  const clusters = new Map<number, number[]>()
  live.forEach((_, i) => {
    const root = find(i)
    const list = clusters.get(root)
    if (list) list.push(i)
    else clusters.set(root, [i])
  })

  const groups: DuplicateGroup[] = []
  clusters.forEach((indices) => {
    if (indices.length < 2) return
    const reasonSet = new Set<DuplicateMatchReason>()
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a]!
        const j = indices[b]!
        const key = i < j ? `${i}:${j}` : `${j}:${i}`
        pairReasons.get(key)?.forEach((r) => reasonSet.add(r))
      }
    }
    const groupClients = indices.map((i) => live[i]!)
    groups.push({
      key: groupClients.map((c) => c.id).sort().join('+'),
      reasons: Array.from(reasonSet),
      clients: groupClients,
    })
  })

  return groups.sort((a, b) => b.clients.length - a.clients.length)
}
