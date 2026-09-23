# Orphaned OperationsShell variant — archived 2026-09-23 (session B)

This subtree is a superseded draft of the Operations modal shell
(`operations/shell/OperationsShell.tsx` + its `steps/` HandOver/Packing/
Return/Reset step components). It was never imported: `git grep` showed zero
importers outside this directory at archive time, while the live path is
`src/modules/operations/OperationsShell.tsx` → `rentals/ReturnWorkspace.tsx`
(and siblings), routed at `/rentals/:bookingNo/return` (`App.tsx:239`).

Its day was the question UX32 §18 raised (two Return implementations, "determine
the canonical one before any §18 work"). Answer: **ReturnWorkspace is canonical**;
this variant is the duplicate. Archived under Law 3 (nothing is deleted — restore
is a move back to `src/modules` plus a route). Excluded from the program by
`tsconfig` (`exclude: ["src/archive"]`).
