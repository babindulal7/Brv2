import { rupees, type Paisa } from '../lib/money'
import type { ClientType, MembershipTier } from './clients'

/**
 * **Communication Center — Unified Inbox Engine**
 * Conforming strictly to Communication Center Spec v3.1 & Foundation Spec v1.3.
 */

export type Channel = 'WhatsApp' | 'Email' | 'SMS' | 'In-App'

export const CHANNELS: readonly Channel[] = ['WhatsApp', 'Email', 'SMS', 'In-App']

export type ConversationState = 'Open' | 'Snoozed' | 'Closed' | 'Archived' | 'Spam'

export type PriorityLevel = 'Standard' | 'Booking in progress' | 'Overdue or damage case'

export type ConsentStatus = 'Opted in' | 'Not asked' | 'Opted out'

export interface ChannelConsent {
  transactional: boolean
  marketing: ConsentStatus
  optOutDate?: string
  optOutChannel?: Channel
}

export interface MessageAttachment {
  id: string
  name: string
  size: string
  type: 'image' | 'pdf' | 'document'
  url?: string
}

export interface MessageItem {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  channel: Channel
  author: {
    name: string
    role?: string
    isStaff: boolean
    isAiDrafted?: boolean
  }
  content: string
  sentAtAd: string // ISO string in UTC
  sentAtBs: string // BS formatted date
  status: 'Sent' | 'Delivered' | 'Read' | 'Failed' | 'Draft'
  failureReason?: string
  attachments?: MessageAttachment[]
  linkedBookingId?: string
  linkedQuoteId?: string
  isInternalNote?: boolean
}

export interface ConversationThread {
  id: string
  clientId?: string
  clientName: string
  clientPhone: string
  clientEmail: string
  clientType?: ClientType
  membership?: MembershipTier
  channel: Channel
  state: ConversationState
  priority: PriorityLevel
  assignedTo: string
  unread: boolean
  lastMessage: string
  lastMessageAtAd: string
  lastMessageAtBs: string
  slaDeadlineAd?: string
  slaBreached: boolean
  linkedBookingId?: string
  linkedCaseId?: string
  consent: Record<Channel, ChannelConsent>
  financials: {
    totalBookings: number
    activeBookings: number
    lifetimeSpendPaisa: Paisa
    outstandingRentalPaisa: Paisa
    depositHeldPaisa: Paisa
  }
  messages: MessageItem[]
}

export interface QuickTemplate {
  id: string
  title: string
  channel: Channel | 'All'
  category: 'Booking' | 'Payment' | 'Operations' | 'Support'
  autoSendAllowed: boolean
  requiresHumanDraft: boolean
  body: string
}

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'TPL-01',
    title: 'Booking Pickup Confirmation',
    channel: 'All',
    category: 'Booking',
    autoSendAllowed: true,
    requiresHumanDraft: false,
    body: 'Namaste {{client_name}}, your booking {{booking_no}} is packed and ready for pickup at our Boudha warehouse. Staff: {{staff_name}}.',
  },
  {
    id: 'TPL-02',
    title: 'Return Schedule & Checklist',
    channel: 'All',
    category: 'Operations',
    autoSendAllowed: false,
    requiresHumanDraft: true,
    body: 'Namaste {{client_name}}, your rental period for {{booking_no}} concludes today by 6:00 PM. Please ensure all lenses, batteries, and cables are included for return inspection.',
  },
  {
    id: 'TPL-03',
    title: 'Outstanding Payment Notice (Draft Only)',
    channel: 'All',
    category: 'Payment',
    autoSendAllowed: false,
    requiresHumanDraft: true,
    body: 'Dear {{client_name}}, gentle reminder that tax invoice for {{booking_no}} has an outstanding rental balance of Rs {{outstanding_amount}}. Please settle via eSewa, Fonepay or Bank Transfer.',
  },
  {
    id: 'TPL-04',
    title: 'Damage Inspection Note (Draft Only)',
    channel: 'WhatsApp',
    category: 'Operations',
    autoSendAllowed: false,
    requiresHumanDraft: true,
    body: 'Dear {{client_name}}, during the return inspection of {{booking_no}}, item {{item_name}} was flagged for inspection. Please review the attached return report.',
  },
]

export const SEED_CONVERSATIONS: ConversationThread[] = [
  {
    id: 'CONV-2026-001',
    clientId: 'CL-2026-0012',
    clientName: 'Mandala Film Productions',
    clientPhone: '+977 9851 029384',
    clientEmail: 'production@mandalafilms.np',
    clientType: 'Production Company',
    membership: 'Production Alliance',
    channel: 'WhatsApp',
    state: 'Open',
    priority: 'Booking in progress',
    assignedTo: 'Bikash Thapa',
    unread: true,
    lastMessage: 'Can we add 2x Sony FX6 v-mount batteries to tomorrow’s shoot dispatch?',
    lastMessageAtAd: '2026-08-06T14:30:00Z',
    lastMessageAtBs: '22 Shrawan 2083 BS',
    slaDeadlineAd: '2026-08-06T15:00:00Z',
    slaBreached: false,
    linkedBookingId: 'BK-2026-0715',
    consent: {
      WhatsApp: { transactional: true, marketing: 'Opted in' },
      Email: { transactional: true, marketing: 'Opted in' },
      SMS: { transactional: true, marketing: 'Opted in' },
      'In-App': { transactional: true, marketing: 'Opted in' },
    },
    financials: {
      totalBookings: 14,
      activeBookings: 1,
      lifetimeSpendPaisa: rupees(1450000),
      outstandingRentalPaisa: rupees(45000),
      depositHeldPaisa: rupees(50000),
    },
    messages: [
      {
        id: 'MSG-001',
        conversationId: 'CONV-2026-001',
        direction: 'outbound',
        channel: 'WhatsApp',
        author: { name: 'Bikash Thapa', role: 'Operations Lead', isStaff: true },
        content: 'Namaste Karma! Your booking BK-2026-0715 has been packed and scheduled for handover at 8:00 AM tomorrow.',
        sentAtAd: '2026-08-06T11:00:00Z',
        sentAtBs: '22 Shrawan 2083 BS, 4:45 PM',
        status: 'Read',
        linkedBookingId: 'BK-2026-0715',
      },
      {
        id: 'MSG-002',
        conversationId: 'CONV-2026-001',
        direction: 'inbound',
        channel: 'WhatsApp',
        author: { name: 'Karma Gurung', isStaff: false },
        content: 'Can we add 2x Sony FX6 v-mount batteries to tomorrow’s shoot dispatch?',
        sentAtAd: '2026-08-06T14:30:00Z',
        sentAtBs: '22 Shrawan 2083 BS, 8:15 PM',
        status: 'Delivered',
      },
    ],
  },
  {
    id: 'CONV-2026-002',
    clientId: 'CL-2026-0028',
    clientName: 'Suman Shrestha',
    clientPhone: '+977 9841 876543',
    clientEmail: 'suman.cinematography@gmail.com',
    clientType: 'Freelancer',
    membership: 'Cinematographer',
    channel: 'Email',
    state: 'Open',
    priority: 'Standard',
    assignedTo: 'Aayush Shrestha',
    unread: true,
    lastMessage: 'Sending the bank transfer voucher for the booking confirmation deposit.',
    lastMessageAtAd: '2026-08-06T12:15:00Z',
    lastMessageAtBs: '22 Shrawan 2083 BS',
    slaDeadlineAd: '2026-08-06T16:15:00Z',
    slaBreached: false,
    linkedBookingId: 'BK-2026-0720',
    consent: {
      WhatsApp: { transactional: true, marketing: 'Not asked' },
      Email: { transactional: true, marketing: 'Opted in' },
      SMS: { transactional: true, marketing: 'Not asked' },
      'In-App': { transactional: true, marketing: 'Opted in' },
    },
    financials: {
      totalBookings: 6,
      activeBookings: 1,
      lifetimeSpendPaisa: rupees(380000),
      outstandingRentalPaisa: rupees(0),
      depositHeldPaisa: rupees(35000),
    },
    messages: [
      {
        id: 'MSG-003',
        conversationId: 'CONV-2026-002',
        direction: 'inbound',
        channel: 'Email',
        author: { name: 'Suman Shrestha', isStaff: false },
        content: 'Hi Team, sending the bank transfer voucher for the booking confirmation deposit for BK-2026-0720.',
        sentAtAd: '2026-08-06T12:15:00Z',
        sentAtBs: '22 Shrawan 2083 BS, 6:00 PM',
        status: 'Delivered',
        attachments: [
          { id: 'ATT-01', name: 'Nabil_Bank_Voucher_Rs35000.pdf', size: '240 KB', type: 'pdf' },
        ],
        linkedBookingId: 'BK-2026-0720',
      },
    ],
  },
  {
    id: 'CONV-2026-003',
    clientId: 'CL-2026-0045',
    clientName: 'Kantipur TV Network',
    clientPhone: '+977 01 4482910',
    clientEmail: 'broadcast.logistics@kantipurtv.com',
    clientType: 'Broadcaster',
    membership: 'Elite',
    channel: 'SMS',
    state: 'Open',
    priority: 'Overdue or damage case',
    assignedTo: 'Bikash Thapa',
    unread: false,
    lastMessage: 'Awaiting return inspection confirmation for 4x Wireless Mic Kits.',
    lastMessageAtAd: '2026-08-06T09:00:00Z',
    lastMessageAtBs: '22 Shrawan 2083 BS',
    slaDeadlineAd: '2026-08-06T09:30:00Z',
    slaBreached: true,
    linkedBookingId: 'BK-2026-0710',
    consent: {
      WhatsApp: { transactional: true, marketing: 'Opted in' },
      Email: { transactional: true, marketing: 'Opted in' },
      SMS: { transactional: true, marketing: 'Opted in' },
      'In-App': { transactional: true, marketing: 'Opted in' },
    },
    financials: {
      totalBookings: 32,
      activeBookings: 2,
      lifetimeSpendPaisa: rupees(4850000),
      outstandingRentalPaisa: rupees(120000),
      depositHeldPaisa: rupees(100000),
    },
    messages: [
      {
        id: 'MSG-004',
        conversationId: 'CONV-2026-003',
        direction: 'inbound',
        channel: 'SMS',
        author: { name: 'Logistics Desk', isStaff: false },
        content: 'Driver has dropped off 4x Sennheiser G4 kits at warehouse floor.',
        sentAtAd: '2026-08-06T09:00:00Z',
        sentAtBs: '22 Shrawan 2083 BS, 2:45 PM',
        status: 'Delivered',
        linkedBookingId: 'BK-2026-0710',
      },
    ],
  },
  {
    id: 'CONV-2026-004',
    clientName: '+977 9851 234 569',
    clientPhone: '+977 9851 234 569',
    clientEmail: 'unlinked@unknown.np',
    channel: 'WhatsApp',
    state: 'Open',
    priority: 'Standard',
    assignedTo: 'Unassigned',
    unread: true,
    lastMessage: 'Hello, is RED Komodo 6K available for 3 days starting Friday?',
    lastMessageAtAd: '2026-08-06T13:40:00Z',
    lastMessageAtBs: '22 Shrawan 2083 BS',
    slaDeadlineAd: '2026-08-06T15:40:00Z',
    slaBreached: false,
    consent: {
      WhatsApp: { transactional: true, marketing: 'Not asked' },
      Email: { transactional: true, marketing: 'Not asked' },
      SMS: { transactional: true, marketing: 'Not asked' },
      'In-App': { transactional: true, marketing: 'Not asked' },
    },
    financials: {
      totalBookings: 0,
      activeBookings: 0,
      lifetimeSpendPaisa: rupees(0),
      outstandingRentalPaisa: rupees(0),
      depositHeldPaisa: rupees(0),
    },
    messages: [
      {
        id: 'MSG-005',
        conversationId: 'CONV-2026-004',
        direction: 'inbound',
        channel: 'WhatsApp',
        author: { name: 'Unidentified Client', isStaff: false },
        content: 'Hello, is RED Komodo 6K available for 3 days starting Friday for a music video?',
        sentAtAd: '2026-08-06T13:40:00Z',
        sentAtBs: '22 Shrawan 2083 BS, 7:25 PM',
        status: 'Delivered',
      },
    ],
  },
]

export function computeInboxMetrics(conversations: ConversationThread[]) {
  const open = conversations.filter((c) => c.state === 'Open')
  const unread = conversations.filter((c) => c.unread)
  const awaitingReply = conversations.filter((c) => {
    const last = c.messages[c.messages.length - 1]
    return last?.direction === 'inbound'
  })
  const slaBreaches = conversations.filter((c) => c.slaBreached)
  const totalMessagesToday = conversations.reduce((acc, c) => acc + c.messages.length, 0)

  return {
    openCount: open.length,
    unreadCount: unread.length,
    awaitingCount: awaitingReply.length,
    medianFirstResponse: '18 mins',
    slaBreachCount: slaBreaches.length,
    messagesToday: totalMessagesToday,
  }
}
