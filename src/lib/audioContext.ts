/**
 * The one non-standard global this app reads: Safari before 14.1 shipped
 * `AudioContext` under the `webkit` prefix. Three call sites (the scanner FAB,
 * the barcode modal, the POS sound engine) each reached for it through
 * `(window as any)`; this names the shape once instead (TODO_SWEEP A13).
 */
export function audioContextClass(): typeof AudioContext | undefined {
  /* `typeof window`, not `Window`: the standard constructor is a global, and
     only `Window & typeof globalThis` carries it. */
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return w.AudioContext ?? w.webkitAudioContext
}
