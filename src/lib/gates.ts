/**
 * # Gate Registry & Error Parser — Foundation Specification & Stage 2
 *
 * All gate checks enforced by PostgreSQL in Stage 1 raise exceptions formatted as:
 *   raise exception 'GATE:<gate.id>|<human message>' using errcode = 'P0001';
 *
 * Law 1: Pages never implement business logic.
 * Law 12: Errors inline and persistent. Toasts carry successes only.
 * Law 17: The word "customer" appears nowhere in the UI. They are clients.
 *
 * This module parses gate error messages and maps them to clear, bilingual (EN / NE)
 * explanations and actionable resolutions.
 */

import type { Language } from './i18n'

export type GateCategory =
  | 'pack'
  | 'handover'
  | 'return'
  | 'cancel'
  | 'reopen'
  | 'close'
  | 'invoice'
  | 'payment'
  | 'unit_status'
  | 'users'
  | 'price'
  | 'conflict'
  | 'case'
  | 'maintenance'
  | 'purchase'
  | 'expense'
  | 'client'
  | 'admin'

export interface GateDefinition {
  id: string
  category: GateCategory
  title: { en: string; ne: string }
  message: { en: string; ne: string }
  howToResolve: { en: string; ne: string }
  whoMayOverride: string
}

export const GATE_REGISTRY: Record<string, GateDefinition> = {
  // ── S1-1: Stage Gates ──────────────────────────────────────────────────────
  'gate.pack.session_missing': {
    id: 'gate.pack.session_missing',
    category: 'pack',
    title: {
      en: 'Packing Session Required',
      ne: 'प्याकिङ सत्र आवश्यक छ',
    },
    message: {
      en: 'Cannot move booking to Packed without an active or completed packing session.',
      ne: 'सक्रिय वा सम्पन्न प्याकिङ सत्र बिना बुकिङलाई प्याक गरिएको अवस्थामा लैजान सकिँदैन।',
    },
    howToResolve: {
      en: 'Start a packing session from the warehouse queue and record equipment packing movements.',
      ne: 'गोदाम सूचीबाट प्याकिङ सत्र सुरु गर्नुहोस् र उपकरण प्याकिङ प्रविष्टि गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.pack.units_unassigned': {
    id: 'gate.pack.units_unassigned',
    category: 'pack',
    title: {
      en: 'Serialised Units Unassigned',
      ne: 'सिरियल एकाइहरू तोकिएका छैनन्',
    },
    message: {
      en: 'Every serialised product line must have physical units assigned matching the required quantity.',
      ne: 'प्रत्येक सिरियल उत्पादन लाइनमा आवश्यक परिमाण अनुसार भौतिक एकाइहरू तोकिएको हुनुपर्छ।',
    },
    howToResolve: {
      en: 'Assign specific asset tags or serial numbers to each booking line before advancing.',
      ne: 'अगाडि बढ्नुअघि प्रत्येक बुकिङ लाइनमा निर्दिष्ट सम्पत्ति ट्याग वा सिरियल नम्बरहरू तोक्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.pack.units_unpacked': {
    id: 'gate.pack.units_unpacked',
    category: 'pack',
    title: {
      en: 'Units Not Packed in Session',
      ne: 'एकाइहरू सत्रमा प्याक गरिएका छैनन्',
    },
    message: {
      en: 'All assigned units must be scanned or marked as packed in the current packing session.',
      ne: 'सबै तोकिएका एकाइहरू हालको प्याकिङ सत्रमा स्क्यान गरिएको वा प्याक गरिएको भनी चिन्ह लगाइनुपर्छ।',
    },
    howToResolve: {
      en: 'Scan each assigned unit barcode or confirm movement in the packing workspace.',
      ne: 'प्रत्येक तोकिएको एकाइको बारकोड स्क्यान गर्नुहोस् वा प्याकिङ कार्यक्षेत्रमा पुष्टि गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.handover.session_missing': {
    id: 'gate.handover.session_missing',
    category: 'handover',
    title: {
      en: 'Handover Session Required',
      ne: 'हस्तान्तरण सत्र आवश्यक छ',
    },
    message: {
      en: 'Cannot move booking to On Rent without an active or completed handover session.',
      ne: 'सक्रिय वा सम्पन्न हस्तान्तरण सत्र बिना बुकिङलाई भाडामा (On Rent) सार्न सकिँदैन।',
    },
    howToResolve: {
      en: 'Open the handover workspace, verify equipment with client, and complete pickup.',
      ne: 'हस्तान्तरण कार्यक्षेत्र खोल्नुहोस्, ग्राहकसँग उपकरण प्रमाणीकरण गर्नुहोस्, र पिकअप पूरा गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.handover.units_unhanded': {
    id: 'gate.handover.units_unhanded',
    category: 'handover',
    title: {
      en: 'Units Missing Handover Line',
      ne: 'हस्तान्तरण लाइन नभएका एकाइहरू',
    },
    message: {
      en: 'Every packed unit must have a corresponding handover line recording its disposition.',
      ne: 'प्रत्येक प्याक गरिएको एकाइको अवस्था रेकर्ड गर्ने हस्तान्तरण लाइन हुनुपर्छ।',
    },
    howToResolve: {
      en: 'Record handover lines for all units. If a unit is left behind, record it with not-taken outcome.',
      ne: 'सबै एकाइहरूका लागि हस्तान्तरण लाइनहरू रेकर्ड गर्नुहोस्। यदि कुनै एकाइ छाडिएको छ भने नलगेको विवरण प्रविष्ट गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.handover.agreement_unsigned': {
    id: 'gate.handover.agreement_unsigned',
    category: 'handover',
    title: {
      en: 'Rental Agreement Unsigned',
      ne: 'भाडा सम्झौता हस्ताक्षर गरिएको छैन',
    },
    message: {
      en: 'Cannot release equipment without a signed rental agreement on file for this handover session.',
      ne: 'यस हस्तान्तरण सत्रको लागि हस्ताक्षर गरिएको भाडा सम्झौता बिना उपकरण उपलब्ध गराउन सकिँदैन।',
    },
    howToResolve: {
      en: 'Capture receiver signature on the tablet or upload the physical signed agreement.',
      ne: 'ट्याब्लेटमा प्राप्तकर्ताको हस्ताक्षर लिनुहोस् वा भौतिक हस्ताक्षर गरिएको सम्झौता अपलोड गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.handover.payment_outstanding': {
    id: 'gate.handover.payment_outstanding',
    category: 'handover',
    title: {
      en: 'Payment Outstanding Warning',
      ne: 'बाँकी भुक्तानी चेतावनी',
    },
    message: {
      en: 'Booking has an outstanding advance payment or invoice balance.',
      ne: 'बुकिङमा अग्रिम भुक्तानी वा इनभ्वाइस ब्यालेन्स बाँकी छ।',
    },
    howToResolve: {
      en: 'Collect payment or proceed with authorized staff acknowledgment (soft gate).',
      ne: 'भुक्तानी संकलन गर्नुहोस् वा अधिकृत कर्मचारीको स्वीकृति लिएर अगाडि बढ्नुहोस्।',
    },
    whoMayOverride: 'Any staff (soft warning)',
  },

  'gate.return.session_missing': {
    id: 'gate.return.session_missing',
    category: 'return',
    title: {
      en: 'Return Session Required',
      ne: 'फिर्ता सत्र आवश्यक छ',
    },
    message: {
      en: 'Cannot mark booking as Returned without an active or completed return intake session.',
      ne: 'सक्रिय वा सम्पन्न फिर्ता सत्र बिना बुकिङलाई फिर्ता भएको (Returned) चिन्ह लगाउन सकिँदैन।',
    },
    howToResolve: {
      en: 'Open the return workspace and start equipment intake inspection.',
      ne: 'फिर्ता कार्यक्षेत्र खोल्नुहोस् र उपकरण जाँच सुरु गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.return.units_unaccounted': {
    id: 'gate.return.units_unaccounted',
    category: 'return',
    title: {
      en: 'Unaccounted Units at Return',
      ne: 'फिर्ता गर्दा हिसाब नभएका एकाइहरू',
    },
    message: {
      en: 'Every unit handed over must be accounted for as Returned, Damaged, or Missing.',
      ne: 'हस्तान्तरण गरिएको प्रत्येक एकाइलाई फिर्ता, क्षतिग्रस्त वा हराएको रूपमा हिसाब गरिनुपर्छ।',
    },
    howToResolve: {
      en: 'Scan returned items. For missing items, record the missing reason to automatically open a case.',
      ne: 'फिर्ता गरिएका सामानहरू स्क्यान गर्नुहोस्। हराएका सामानहरूको लागि कारण प्रविष्ट गर्नुहोस् जसले स्वतः केस खोल्नेछ।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.cancel.stage_too_late': {
    id: 'gate.cancel.stage_too_late',
    category: 'cancel',
    title: {
      en: 'Cancellation Authorization Required',
      ne: 'रद्द गर्न अधिकार आवश्यक छ',
    },
    message: {
      en: 'Bookings in Packed stage or beyond require Manager authorization to cancel.',
      ne: 'प्याक गरिएको वा त्यसपछिको चरणमा पुगेका बुकिङहरू रद्द गर्न प्रबन्धक (Manager) को स्वीकृति चाहिन्छ।',
    },
    howToResolve: {
      en: 'Have a Manager or Admin approve the cancellation with an audited reason.',
      ne: 'अडिट गरिएको कारणसहित प्रबन्धक वा प्रशासकबाट रद्द गर्न स्वीकृति गराउनुहोस्।',
    },
    whoMayOverride: 'Manager or above',
  },

  'gate.cancel.reason_missing': {
    id: 'gate.cancel.reason_missing',
    category: 'cancel',
    title: {
      en: 'Cancellation Reason Required',
      ne: 'रद्द गर्ने कारण आवश्यक छ',
    },
    message: {
      en: 'A valid cancellation reason of at least 10 characters is mandatory.',
      ne: 'कम्तिमा १० अक्षरको मान्य रद्द गर्ने कारण अनिवार्य छ।',
    },
    howToResolve: {
      en: 'Provide a clear, detailed explanation for the cancellation.',
      ne: 'रद्द गर्नुको स्पष्ट र विस्तृत कारण उल्लेख गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.reopen.role': {
    id: 'gate.reopen.role',
    category: 'reopen',
    title: {
      en: 'Reopen Authorization Required',
      ne: 'पुनः खोल्ने अधिकार आवश्यक छ',
    },
    message: {
      en: 'Only a Manager, Admin, or Owner may reopen a Closed booking.',
      ne: 'प्रबन्धक, प्रशासक, वा मालिकले मात्र बन्द गरिएको बुकिङ पुनः खोल्न सक्नुहुन्छ।',
    },
    howToResolve: {
      en: 'Request authorization from management and supply an audit reason (≥10 characters).',
      ne: 'व्यवस्थापनबाट अधिकार अनुरोध गर्नुहोस् र अडिट कारण (≥१० अक्षर) उपलब्ध गराउनुहोस्।',
    },
    whoMayOverride: 'Manager or above',
  },

  // ── S1-2: Close Gates ──────────────────────────────────────────────────────
  'gate.close.no_invoice': {
    id: 'gate.close.no_invoice',
    category: 'close',
    title: {
      en: 'Invoice Required to Close',
      ne: 'बन्द गर्न इनभ्वाइस आवश्यक छ',
    },
    message: {
      en: 'Cannot close a rental booking without at least one non-void invoice.',
      ne: 'कम्तिमा एउटा मान्य इनभ्वाइस बिना भाडा बुकिङ बन्द गर्न सकिँदैन।',
    },
    howToResolve: {
      en: 'Create and issue an invoice for the booking before closing.',
      ne: 'बुकिङ बन्द गर्नुअघि इनभ्वाइस तयार गरी जारी गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.close.invoice_unsettled': {
    id: 'gate.close.invoice_unsettled',
    category: 'close',
    title: {
      en: 'Unsettled Invoices Pending',
      ne: 'बाँकी बक्यौता इनभ्वाइसहरू',
    },
    message: {
      en: 'Cannot close booking while invoices have an outstanding balance greater than zero.',
      ne: 'इनभ्वाइसको बाँकी रकम शून्य भन्दा बढी हुँदा बुकिङ बन्द गर्न सकिँदैन।',
    },
    howToResolve: {
      en: 'Record final payments or issue an authorized credit note to settle outstanding balances.',
      ne: 'बाँकी रकम फर्स्यौट गर्न अन्तिम भुक्तानी दर्ता गर्नुहोस् वा अधिकृत क्रेडिट नोट जारी गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.close.deposit_unresolved': {
    id: 'gate.close.deposit_unresolved',
    category: 'close',
    title: {
      en: 'Unresolved Security Deposit',
      ne: 'फर्स्यौट नभएको धरौटी रकम',
    },
    message: {
      en: 'Cannot close booking with active held security deposits that have not been refunded or forfeited.',
      ne: 'फिर्ता वा जफत नगरिएको सक्रिय धरौटी रकम बाँकी रहँदा बुकिङ बन्द गर्न सकिँदैन।',
    },
    howToResolve: {
      en: 'Confirm deposit refund or record damage forfeiture in the finance section.',
      ne: 'वित्त खण्डमा धरौटी फिर्ता पुष्टि गर्नुहोस् वा क्षति बापत रकम कट्टा रेकर्ड गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.close.open_case': {
    id: 'gate.close.open_case',
    category: 'close',
    title: {
      en: 'Open Incident Cases Pending',
      ne: 'खुला घटना केसहरू बाँकी छन्',
    },
    message: {
      en: 'Cannot close booking while related damage or missing equipment cases remain unresolved.',
      ne: 'सम्बन्धित क्षति वा हराएको उपकरण केसहरू समाधान नभएसम्म बुकिङ बन्द गर्न सकिँदैन।',
    },
    howToResolve: {
      en: 'Resolve, bill, or close all open cases linked to this booking.',
      ne: 'यस बुकिङसँग सम्बन्धित सबै खुला केसहरू समाधान, बिलिङ, वा बन्द गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.close.reservation_live': {
    id: 'gate.close.reservation_live',
    category: 'close',
    title: {
      en: 'Live Inventory Reservations Remaining',
      ne: 'सक्रिय मौज्दात रिजर्भेसन बाँकी छ',
    },
    message: {
      en: 'Internal consistency check failed: inventory reservations must be released upon return.',
      ne: 'आन्तरिक एकरूपता जाँच असफल: फिर्ता भएपछि मौज्दात रिजर्भेसनहरू रिलिज हुनुपर्छ।',
    },
    howToResolve: {
      en: 'Ensure all equipment return lines are completed to release equipment reservations.',
      ne: 'उपकरण रिजर्भेसन रिलिज गर्न सबै उपकरण फिर्ता लाइनहरू सम्पन्न भएको सुनिश्चित गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  // ── S1-3: Invoice Void Discipline ──────────────────────────────────────────
  'gate.invoice.void_reason': {
    id: 'gate.invoice.void_reason',
    category: 'invoice',
    title: {
      en: 'Void Reason Required',
      ne: 'बदर गर्ने कारण आवश्यक छ',
    },
    message: {
      en: 'Voiding an invoice requires a mandatory reason of at least 10 characters.',
      ne: 'इनभ्वाइस बदर गर्न कम्तिमा १० अक्षरको अनिवार्य कारण आवश्यक छ।',
    },
    howToResolve: {
      en: 'Enter a detailed, audited justification for voiding the invoice.',
      ne: 'इनभ्वाइस बदर गर्न विस्तृत अडिट कारण प्रविष्ट गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.invoice.void_role': {
    id: 'gate.invoice.void_role',
    category: 'invoice',
    title: {
      en: 'Void Authorization Denied',
      ne: 'बदर गर्ने अधिकार अस्वीकृत',
    },
    message: {
      en: 'Only Accounts, Manager, Admin, or Owner may void invoices.',
      ne: 'लेखापाल, प्रबन्धक, प्रशासक वा मालिकले मात्र इनभ्वाइस बदर गर्न सक्नुहुन्छ।',
    },
    howToResolve: {
      en: 'Request an authorized Accounts or Management team member to void the invoice.',
      ne: 'इनभ्वाइस बदर गर्न अधिकृत लेखा वा व्यवस्थापन सदस्यलाई अनुरोध गर्नुहोस्।',
    },
    whoMayOverride: 'Accounts or Manager and above',
  },

  'gate.invoice.void_paid': {
    id: 'gate.invoice.void_paid',
    category: 'invoice',
    title: {
      en: 'Credit Note Required for Paid Invoice',
      ne: 'भुक्तानी भएको इनभ्वाइसको लागि क्रेडिट नोट आवश्यक',
    },
    message: {
      en: 'Cannot void an invoice with recorded payments without first issuing a credit note.',
      ne: 'भुक्तानी भइसकेको इनभ्वाइसलाई पहिले क्रेडिट नोट जारी नगरी बदर गर्न सकिँदैन।',
    },
    howToResolve: {
      en: 'Issue a credit note for the paid amount before voiding the invoice.',
      ne: 'इनभ्वाइस बदर गर्नु अघि भुक्तानी भएको रकमको लागि क्रेडिट नोट जारी गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.invoice.void_immutable': {
    id: 'gate.invoice.void_immutable',
    category: 'invoice',
    title: {
      en: 'Voided Invoice Is Immutable',
      ne: 'बदर गरिएको इनभ्वाइस अपरिवर्तनीय छ',
    },
    message: {
      en: 'A voided invoice cannot be edited, unvoided, or deleted (Law 3 & Law 4).',
      ne: 'बदर गरिएको इनभ्वाइस सम्पादन गर्न, पुनः सक्रिय गर्न वा मेटाउन सकिँदैन।',
    },
    howToResolve: {
      en: 'Create a new invoice if replacement billing is required.',
      ne: 'यदि नयाँ बिलिङ आवश्यक छ भने नयाँ इनभ्वाइस सिर्जना गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  // ── S1-4: Payment Ceiling ──────────────────────────────────────────────────
  'gate.payment.over_invoice': {
    id: 'gate.payment.over_invoice',
    category: 'payment',
    title: {
      en: 'Payment Exceeds Outstanding Amount',
      ne: 'भुक्तानी बाँकी रकम भन्दा बढी छ',
    },
    message: {
      en: 'Payment amount exceeds the invoice outstanding balance. Overpayment is not accepted.',
      ne: 'भुक्तानी रकम इनभ्वाइसको बाँकी रकम भन्दा बढी छ। बढी भुक्तानी स्वीकार गरिँदैन।',
    },
    howToResolve: {
      en: 'Adjust the payment amount to match or be less than the remaining balance.',
      ne: 'भुक्तानी रकमलाई बाँकी रकम बराबर वा सोभन्दा कम हुने गरी मिलाउनुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.payment.over_booking': {
    id: 'gate.payment.over_booking',
    category: 'payment',
    title: {
      en: 'Advance Payment Exceeds Booking Total',
      ne: 'अग्रिम भुक्तानी बुकिङ जम्मा रकम भन्दा बढी छ',
    },
    message: {
      en: 'Unlinked advance payment would take total payments above the estimated booking total.',
      ne: 'अग्रिम भुक्तानीले कुल भुक्तानीलाई बुकिङको अनुमानित जम्मा रकम भन्दा बढी पुर्‍याउनेछ।',
    },
    howToResolve: {
      en: 'Verify the booking lines and pricing, or adjust the advance payment amount.',
      ne: 'बुकिङ लाइन र मूल्य प्रमाणीकरण गर्नुहोस्, वा अग्रिम भुक्तानी रकम मिलाउनुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.payment.booking_client_mismatch': {
    id: 'gate.payment.booking_client_mismatch',
    category: 'payment',
    title: {
      en: 'Client Mismatch on Payment',
      ne: 'भुक्तानीमा ग्राहक अमिल्दो',
    },
    message: {
      en: 'Payment client ID does not match the client assigned to the booking.',
      ne: 'भुक्तानी ग्राहक आईडी बुकिङमा तोकिएको ग्राहकसँग मेल खाँदैन।',
    },
    howToResolve: {
      en: 'Ensure the payment references the same client as the booking.',
      ne: 'भुक्तानीले बुकिङको समान ग्राहकलाई जनाएको सुनिश्चित गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  // ── S1-5: Unit Status Engine ───────────────────────────────────────────────
  'gate.unit_status.direct_write': {
    id: 'gate.unit_status.direct_write',
    category: 'unit_status',
    title: {
      en: 'Direct Unit Status Edit Forbidden',
      ne: 'एकाइ स्थिति सिधा सम्पादन निषेध गरिएको छ',
    },
    message: {
      en: 'Unit status is strictly owned and derived by the database engine (Law 1).',
      ne: 'एकाइ स्थिति डेटाबेस इन्जिनद्वारा मात्र गणना र व्यवस्थापन गरिन्छ।',
    },
    howToResolve: {
      en: 'Perform operational actions (packing, handover, return, maintenance) to update unit state.',
      ne: 'एकाइको स्थिति अद्यावधिक गर्न परिचालन कार्यहरू (प्याकिङ, हस्तान्तरण, फिर्ता, मर्मत) सम्पन्न गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  // ── S1-6: Users Visibility & Role Ceiling ──────────────────────────────────
  'gate.users.role_ceiling': {
    id: 'gate.users.role_ceiling',
    category: 'users',
    title: {
      en: 'Role Assignment Ceiling Exceeded',
      ne: 'भूमिका तोक्ने अधिकार सीमा नाघ्यो',
    },
    message: {
      en: 'Only the Owner may assign Owner or Admin roles; callers cannot elevate above their ceiling.',
      ne: 'मालिक (Owner) ले मात्र मालिक वा प्रशासक भूमिका तोक्न सक्नुहुन्छ; प्रयोगकर्ताले आफ्नो स्तरभन्दा माथि बढाउन सक्दैनन्।',
    },
    howToResolve: {
      en: 'Request the system Owner to grant elevated administrator privileges.',
      ne: 'उच्च प्रशासक अधिकार प्राप्त गर्न प्रणाली मालिकलाई अनुरोध गर्नुहोस्।',
    },
    whoMayOverride: 'Owner only',
  },

  'gate.users.immutable': {
    id: 'gate.users.immutable',
    category: 'users',
    title: {
      en: 'User Deletion Forbidden',
      ne: 'प्रयोगकर्ता मेटाउन निषेध गरिएको छ',
    },
    message: {
      en: 'Staff records cannot be deleted. Use is_active = false to deactivate staff (Law 3).',
      ne: 'कर्मचारी रेकर्ड मेटाउन सकिँदैन। कर्मचारी निष्कृय गर्न is_active = false प्रयोग गर्नुहोस्।',
    },
    howToResolve: {
      en: 'Deactivate the staff member instead of deleting their record.',
      ne: 'रेकर्ड मेटाउनुको सट्टा कर्मचारी सदस्यलाई निष्कृय गर्नुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  // ── S1-7: Server-Side Pricing & Money-Blind ────────────────────────────────
  'gate.price.money_blind_override': {
    id: 'gate.price.money_blind_override',
    category: 'price',
    title: {
      en: 'Rate Override Forbidden for Role',
      ne: 'यस भूमिकाको लागि दर परिवर्तन निषेध गरिएको छ',
    },
    message: {
      en: 'Money-blind roles (Warehouse, Driver, Technician) cannot override rates.',
      ne: 'पैसा नहेर्ने भूमिकाहरू (गोदाम, चालक, प्राविधिक) ले दर परिवर्तन गर्न सक्दैनन्।',
    },
    howToResolve: {
      en: 'Let the server apply default catalog rates, or have front-desk staff create the booking.',
      ne: 'सर्भरलाई पूर्वनिर्धारित क्याटलग दरहरू लागू गर्न दिनुहोस्, वा फ्रन्ट-डेस्क कर्मचारीबाट बुकिङ सिर्जना गराउनुहोस्।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.booking_lines.money_blind_insert': {
    id: 'gate.booking_lines.money_blind_insert',
    category: 'price',
    title: {
      en: 'Direct Price Insertion Blocked',
      ne: 'सिधा मूल्य प्रविष्टि रोकियो',
    },
    message: {
      en: 'Direct booking line inserts with pricing by money-blind roles are rejected (Law 6).',
      ne: 'पैसा नहेर्ने भूमिकाहरूबाट मूल्यसहित सिधा बुकिङ लाइन प्रविष्टि अस्वीकार गरिन्छ।',
    },
    howToResolve: {
      en: 'Use the official create_booking procedure which computes prices securely on the server.',
      ne: 'आधिकारिक create_booking प्रक्रिया प्रयोग गर्नुहोस् जसले सर्भरमा सुरक्षित रूपमा मूल्य गणना गर्दछ।',
    },
    whoMayOverride: 'Nobody',
  },

  'gate.discount.money_blind': {
    id: 'gate.discount.money_blind',
    category: 'price',
    title: {
      en: 'Discounts Forbidden for Money-Blind Role',
      ne: 'पैसा नहेर्ने भूमिकाको लागि छुट निषेध गरिएको छ',
    },
    message: {
      en: 'Money-blind staff roles cannot view or write discount structures (Law 6).',
      ne: 'पैसा नहेर्ने कर्मचारी भूमिकाहरूले छुट संरचना हेर्न वा लेख्न सक्दैनन्।',
    },
    howToResolve: {
      en: 'Discounts must be negotiated and recorded by Coordinator, Manager, or Accounts.',
      ne: 'छुटको व्यवस्था संयोजक, प्रबन्धक वा लेखापालद्वारा तय गरी रेकर्ड गरिनुपर्छ।',
    },
    whoMayOverride: 'Nobody',
  },
}

export interface ParsedGateError {
  isGate: boolean
  gateId: string | null
  rawMessage: string
  cleanMessage: string
  definition?: GateDefinition | undefined
}

/**
 * Parses any error into structured gate details if it originates from a database gate check.
 * Handles Postgres error strings, Error objects, and PostgREST error payloads.
 */
export function parseGateError(error: unknown): ParsedGateError {
  let rawMessage = ''
  if (typeof error === 'string') {
    rawMessage = error
  } else if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>
    rawMessage = String(errObj.message || errObj.details || errObj.hint || error)
  }

  // Look for GATE:<gate.id>|<human message>
  const match = rawMessage.match(/GATE:([a-z_0-9.]+)(?:\|([^'\n\r]+))?/i)
  if (match) {
    const gateId = match[1] ?? ''
    const cleanMessage = (match[2] || '').trim() || rawMessage
    const definition = gateId ? GATE_REGISTRY[gateId] : undefined
    return {
      isGate: true,
      gateId: gateId || null,
      rawMessage,
      cleanMessage,
      definition,
    }
  }

  // Also catch legacy 'Gate Check Failure: <message>' if any
  const legacyMatch = rawMessage.match(/Gate Check Failure:\s*([^'\n\r]+)/i)
  if (legacyMatch) {
    return {
      isGate: true,
      gateId: null,
      rawMessage,
      cleanMessage: (legacyMatch[1] ?? '').trim(),
    }
  }

  return {
    isGate: false,
    gateId: null,
    rawMessage,
    cleanMessage: rawMessage,
  }
}

/**
 * Formats an error into a user-facing, localized explanation with resolution guidance.
 */
export function formatGateError(error: unknown, lang: Language = 'en'): string {
  const parsed = parseGateError(error)
  if (!parsed.isGate) {
    return parsed.cleanMessage || (lang === 'ne' ? 'अज्ञात त्रुटि भयो' : 'An unexpected error occurred')
  }

  if (parsed.definition) {
    const title = parsed.definition.title[lang] || parsed.definition.title.en
    const msg = parsed.definition.message[lang] || parsed.definition.message.en
    const resolve = parsed.definition.howToResolve[lang] || parsed.definition.howToResolve.en
    return `${title}: ${msg} — ${resolve}`
  }

  if (parsed.gateId === null && parsed.rawMessage.toLowerCase().includes('gate check failure:')) {
    return parsed.rawMessage
  }

  return parsed.cleanMessage
}

/**
 * Returns the GateDefinition for a gate ID, or null if unknown.
 */
export function getGateDefinition(gateId: string): GateDefinition | null {
  return GATE_REGISTRY[gateId] ?? null
}
