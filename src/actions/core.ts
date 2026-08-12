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
 * ## What is deliberately still open
 *
 * `TODO(decision)`: the full capability-string -> role matrix. `lib/rbac` covers
 * money, operations, payment, discount, invoice-void, credit-override and
 * settings; the rest of the strings in `permissions:` arrays across
 * `src/actions/` have no defined rule anywhere in the repo. Writing one here
 * would be inventing a product decision, which `CLAUDE.md` forbids. Until it is
 * ruled, an unknown capability is denied and says so by name.
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
     * ⚠ Three capability strings are declared by actions and NOT handled here:
     * `client.block` (`clients/blockClient.ts:195`), `client.create`
     * (`clients/createClient.ts:274`) and `rental.confirm`
     * (`rentals/confirmRental.ts:252`). All three were flipped to
     * `implemented: true` in the 12 Aug rebuild, so their bodies are real — but
     * an unhandled capability falls through to `undefined` below, which the
     * dispatcher treats as a denial for EVERY role, Owner included. Fail-closed
     * is the right default and is deliberately left in place.
     *
     * TODO(decision) — PLAN.md §4: which roles hold each of the three. A guess
     * here would silently grant a write nobody ruled, which is worse than the
     * current "denied" (CLAUDE.md: never invent a product decision to unblock
     * yourself). `ClientDetail.tsx` states the same gap to the operator.
     */
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
