# Capacitor Android Architecture & Feasibility Review

**Document Status:** Live Architecture Review  
**Reference:** `PLAN.md §10` (Phase 10 — Shells)  
**Date:** 2026-09-12  

---

## 1. Executive Summary

Babin Rentals OS is engineered primarily as an offline-first PWA with an IndexedDB outbox and service worker precaching. Wrapping the application inside a native Android shell using Capacitor 6+ provides deeper hardware integration (barcode scanner camera controls, biometric screen unlock, hardware-backed token security).

This document evaluates the technical feasibility, security boundaries, and operational tradeoffs for the Android shell.

---

## 2. Security Architecture: Keystore & Secure Token Storage

### 2.1 The Vulnerability: Unencrypted `localStorage` in Native WebViews
In standard Android WebViews, `window.localStorage` persists as an unencrypted SQLite/LevelDB database under:
```
/data/data/com.babinrentals.os/app_webview/Local Storage/leveldb/
```
On rooted devices, via adb backup, or through physical forensic extraction, refresh tokens and session secrets stored in plaintext can be exfiltrated. Furthermore, Rentman and competitors have suffered token leakage via unencrypted local storage dumps.

### 2.2 The Solution: Hardware-Backed Android Keystore
Under `src/lib/secureStorage.ts`, Babin Rentals OS implements `CapacitorKeystoreAdapter`:
1. **Master Key Generation:** Uses Android's `MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM)` backed by the hardware Secure Element (SE) / StrongBox Keymaster.
2. **Encrypted Storage:** Delegates to `EncryptedSharedPreferences` (`androidx.security:security-crypto:1.1.0-alpha06`), encrypting both keys (deterministic AES-SIV) and values (authenticated AES-256-GCM).
3. **Fail-Closed Policy:** In native shells, if the native plugin bridge is initializing or unlinked, the adapter strictly refuses unencrypted `localStorage`, utilizing an in-memory secure session store instead.

---

## 3. Pre-Flight Forensics: Sourcemap Pinning

### 3.1 Risk Context
During the 30 Aug 2026 forensics audit, Rentman's production Android bundle was discovered shipping unminified sourcemaps containing `sourcesContent`, allowing reverse-engineering of their internal route tree and validation logic.

### 3.2 Babin Rentals OS Enforcement
In `vite.config.ts`:
```ts
build: {
  sourcemap: false, // MANDATORY: Never emit source maps in release bundles
}
```
`capacitor.config.ts` points `webDir` directly to `dist`. When Capacitor synchronizes assets via `npx cap sync android`, only compiled, minified chunks (`dist/assets/*.js`) are copied into `android/app/src/main/assets/public/`. No `*.js.map` files exist in the build output.

---

## 4. Web-Layer Update Strategy: Live Updates vs Store Review

### 4.1 The Conflict
In the PWA, `vite-plugin-pwa` with `autoUpdate` delivers bug fixes and database adaptations immediately without user friction or app store gatekeeping. Inside a Capacitor native shell, the WebView loads local bundled assets from `android/app/src/main/assets/public/`. Standard service worker update channels do not update bundled assets.

### 4.2 Architecture Options
1. **Option A: Appflow / Capgo Live Updates (Recommended for Production)**
   - Delivers signed zip packages of the web dist directory over HTTPS.
   - Includes a cryptographic SHA-256 signature and a rollback guard: if the new bundle crashes during evaluation, the native shell reverts to the previous known-good bundle.
2. **Option B: Pure Store Updates (AAB via Play Store)**
   - Every JS patch requires a new version code and Google Play review (takes 2-48 hours).
   - High friction for urgent floor bug fixes.

---

## 5. Feasibility Verdict & Requirements

| Item | Status | Requirement |
|---|---|---|
| Native Scaffolding | Ready | `capacitor.config.ts` and `android/` scaffolded with cleartext disabled. |
| Secure Storage Adapter | Ready | `src/lib/secureStorage.ts` wired to `supabase.ts`. |
| Local Build Environment | Blocked | Requires Android Studio / Android SDK (API 34) and Java 17 (not installed on host). |
| Play Store Submission | Blocked `[⊘]` | Requires Google Play Console developer account ($25), signing keystore, and privacy policies. |