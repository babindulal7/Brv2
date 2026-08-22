import { DomainEvents } from '../events/eventBus';
import type { SystemRole } from '../types/database';

/**
 * # The Action Dispatcher
 *
 * ## What was wrong with the previous version
 *
 * Every one of the 36 files under `src/actions/` was a stub: it `console.log`ed
 * `[DB TX] ...` and returned `{ success: true }`. The dispatcher then emitted
 * the domain events and logged `[AUDIT] ... completed`, and the calling screen
 * showed a success toast with a freshly minted `PAY-1234`.
 *
 * So the app told an operator that a payment had been recorded, gave them a
 * reference number for it, and wrote nothing anywhere. **A UI that reports
 * success for work it did not do is worse than one that is visibly unbuilt** --
 * the operator's picture of what the system knows silently stops matching
 * reality, and there is no error anywhere to find later.
 *
 * The permission block was the same shape of untruth:
 *
 * ```ts
 * // 1. Permission check
 * // In a real app, you would check ctx.role against config.permissions.
 * ```
 *
 * -- so `permissions: ['payment.create']` on every action was decoration, and
 * the default context was `{ userId: 'system', role: 'admin' }`: a role string
 * that is not even a member of the business-8 enum, silently granted to any
 * caller that passed no context.
 *
 * ## What this version does instead
 *
 * 1. **Fails closed on `implemented`.** It defaults to `false`, so an action is
 *    a stub until someone states otherwise in that action's own file. A stub
 *    throws `ActionNotImplementedError` *before* validate, execute, events or
 *    audit -- nothing downstream can mistake it for a completed write. No
 *    per-file edit was needed to make the stubs honest; the default did it.
 * 2. **Requires a real context.** No default identity. An implemented action
 *    called without `ctx` throws rather than acting as somebody.
 * 3. **Checks permissions through `lib/rbac`,** which already holds the real
 *    rules, rather than a matrix invented here. A permission with no known
 *    check is refused, not waved through -- the fail-closed direction.
 *
 * ## The capability matrix — closed 16 Aug 2026, except three
 *
 * `checkCapability` resolves **32 of the 35** strings it knows about: the seven
 * app-level rules (money, operations, payment ×2, invoice-void,
 * credit-override, settings), the four ruled on 15 Aug, and the 24 ruled on
 * 16 Aug. **Every capability declared anywhere under `src/actions/` now
 * resolves, except the three named below.**
 *
 * This was done *ahead of* the bodies rather than behind them. The 15 Aug four
 * were ruled after their actions shipped, and the gap denied them to every role
 * including Owner for three days — a permission error where the truth was a
 * missing switch case. Twenty-four more sat in exactly that state, each one
 * springing the moment someone wrote its body.
 *
 * The rule for answering them is the one that worked on 15 Aug and is now
 * ruled in PLAN.md §4.20: find the RLS policy on the table the action writes
 * and mirror it. A capability can then never be granted here and denied at the
 * row, or the reverse.
 *
 * ## What is deliberately still open
 *
 * `TODO(decision)`: `inspection.create`, `inspection.pass`, `inspection.fail`.
 * There is no table to mirror — nothing in the schema matches `inspect`, and
 * `operation_session_type` has no `Inspection` member. Any role set here would
 * be invented, which `CLAUDE.md` forbids. All three stay denied and say so by
 * name; all three actions are stubs, so the decision blocks nobody until one is
 * built. See PLAN.md §4.29.
 */

export type ActionContext = {
  userId: string;
  role: SystemRole;
  /** Law 6 / rbac's offline degradation: several approvals are refused offline. */
  isOnline?: boolean;
};

export type ActionConfig<Input, Output> = {
  name: string;
  permissions: string[];
  /**
   * `false` (the default) means the body does not persist anything yet. The
   * dispatcher refuses to run it. Set `true` **only** when `execute` actually
   * writes through `lib/dataAccess` and the write has been driven, not read.
   */
  implemented?: boolean;
  validate: (input: Input) => void | Promise<void>;
  execute: (input: Input, ctx: ActionContext) => Promise<{ result: Output; events: Array<{ type: string; payload: any }> }>;
};

/** Thrown when a screen calls an action whose body does not persist anything yet. */
export class ActionNotImplementedError extends Error {
  readonly action: string;
  constructor(action: string) {
    super(
      `"${action}" is not connected to the database yet, so nothing was saved. ` +
        `This is a build gap, not a permissions problem - report it rather than retrying.`,
    );
    this.name = 'ActionNotImplementedError';
    this.action = action;
  }
}

/** Thrown when the session's role may not perform the action. */
export class ActionPermissionError extends Error {
  readonly action: string;
  readonly capability: string;
  constructor(action: string, capability: string, role: string) {
    super(`Your role (${role}) cannot perform "${action}" - it requires ${capability}.`);
    this.name = 'ActionPermissionError';
    this.action = action;
    this.capability = capability;
  }
}

/**
 * Maps a capability string to the rule that already exists in `lib/rbac`.
 * Returns `undefined` for a capability with no defined rule, which the
 * dispatcher treats as a denial -- see the TODO(decision) in the header.
 */
async function checkCapability(capability: string, ctx: ActionContext): Promise<boolean | undefined> {
  const rbac = await import('../lib/rbac');
  const online = ctx.isOnline ?? true;

  switch (capability) {
    case 'payment.create':
    case 'payment.refund':
      return rbac.canRecordPayment(ctx.role, online);
    case 'invoice.void':
      return rbac.canVoidInvoice(ctx.role, online);
    case 'credit.override':
      return rbac.canOverrideCreditLimit(ctx.role, online);
    case 'settings.manage':
      return rbac.canManageSettings(ctx.role);
    case 'operations.perform':
      return rbac.canPerformOperations(ctx.role);
    case 'money.view':
      return rbac.canViewMoney(ctx.role);
    /*
     * ── Ruled 15 Aug 2026, closing PLAN.md §4.20 ────────────────────────────
     *
     * These four were declared by actions carrying REAL bodies and handled by
     * nothing here, so each fell through to `undefined` and was denied for every
     * role, Owner included. Fail-closed was the correct default and it held for
     * three days; it was never the correct answer.
     *
     * The answer was not invented. Each capability is now the role set of the
     * RLS policy on the table its action actually writes, read off the live
     * project on 15 Aug — so a capability still cannot be granted here and
     * denied at the row, which is what this file's rules exist to prevent. The
     * derivation for each sits in `lib/rbac`, next to the rule.
     *
     * ⚠ `inventory.create` was the fourth, and no document had it: §4.20 named
     * only the other three. It surfaced by checking every `permissions:` string
     * against this switch rather than by reading the register.
     */
    case 'rental.confirm':
      return rbac.canConfirmRental(ctx.role);
    case 'client.create':
      return rbac.canCreateClient(ctx.role);
    case 'client.block':
      return rbac.canBlockClient(ctx.role);
    case 'inventory.create':
      return rbac.canCreateBundle(ctx.role);
    /*
     * ── Ruled 16 Aug 2026 — the remaining 24, same method as the four above ──
     *
     * Role sets read from `pg_policies` on the live project, per capability,
     * from the table that capability's action writes. Derivation table:
     * `CAPABILITY_MAPPING_2026-08-16.md` §4; the rules themselves sit in
     * `lib/rbac` next to the policy each one cites.
     *
     * Done BEFORE any of these actions gets a body, deliberately. The four
     * above were ruled *after* their bodies shipped, and the gap denied them to
     * every role including Owner for three days. Twenty-four more of the same
     * trap were sitting unsprung.
     *
     * `inspection.create` / `.pass` / `.fail` are deliberately ABSENT. No table
     * matches `inspect` anywhere in the schema and `operation_session_type` is
     * `Packing | Handover | Return | Reset | Cleaning` — Inspection is not one
     * of them, so there is nothing to mirror and any role set would be
     * invented. They keep failing closed. See PLAN.md §4.29.
     */
    case 'rental.create':
    case 'rental.draft':
    case 'rental.cancel':
    case 'rental.extend':
    case 'client.update':
    case 'inventory.reserve':
    case 'document.create':
    case 'subrental.create':
      return rbac.canWriteBookingDesk(ctx.role);

    case 'rental.pickup':
    case 'rental.return':
    case 'inventory.pack':
    case 'inventory.ready':
    case 'inventory.audit':
    case 'inventory.transfer':
    case 'maintenance.create':
    case 'maintenance.complete':
    case 'evidence.review':
      return rbac.canWriteFloor(ctx.role);

    case 'client.merge':
      return rbac.canMergeClients(ctx.role);

    case 'case.resolve':
    case 'crew.assign':
      return rbac.canWriteSharedTriage(ctx.role);

    // Split off shared triage 23 Aug 2026 when 0064's restrictive policy went
    // live — the finance/admin five decide purchases; the mirror rule moved
    // this the same day the database did.
    case 'purchase.approve':
      return rbac.canApprovePurchase(ctx.role);
    default:
      return undefined;
  }
}

export function createAction<Input, Output>(config: ActionConfig<Input, Output>) {
  return async (input: Input, ctx?: ActionContext): Promise<Output> => {
    // 1. Fail closed on an unbuilt body -- before anything observable happens.
    if (config.implemented !== true) {
      throw new ActionNotImplementedError(config.name);
    }

    // 2. A real identity, or none at all. Never a default one.
    if (!ctx || !ctx.userId || !ctx.role) {
      throw new Error(
        `"${config.name}" was called without a session context. Pass the signed-in user's ` +
          `id and role - the dispatcher no longer substitutes a default identity.`,
      );
    }

    // 3. Permissions, through the rules that already exist.
    for (const capability of config.permissions) {
      const allowed = await checkCapability(capability, ctx);
      if (allowed !== true) {
        throw new ActionPermissionError(config.name, capability, ctx.role);
      }
    }

    // 4. Validation.
    await config.validate(input);

    // 5. Execute, then emit. Events follow the write; they never precede it.
    const { result, events } = await config.execute(input, ctx);
    for (const event of events) {
      await DomainEvents.emit(event.type, event.payload);
    }

    return result;
  };
}
