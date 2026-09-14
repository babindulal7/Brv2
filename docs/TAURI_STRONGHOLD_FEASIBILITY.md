# Tauri Desktop & Stronghold Token Store Feasibility Review

**Document Status:** Live Architecture Review  
**Reference:** `PLAN.md §10` (Phase 10 — Shells)  
**Date:** 2026-09-12  

---

## 1. Executive Summary

Desktop operators (Accounts, Managers, Dispatchers) often require persistent sessions across multiple screens and dedicated operating system window management. Wrapping Babin Rentals OS inside Tauri 2.x provides a lightweight native binary (~15MB vs Electron's 120MB+) utilizing the OS WebView (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS).

This review addresses desktop token storage via IOTA Stronghold and cryptographic key derivation feasibility.

---

## 2. Stronghold Vault Architecture

### 2.1 The Threat Model
On desktop operating systems, WebViews store session storage and cookies in user-writable application directories (e.g. `%APPDATA%\com.babinrentals.desktop\EBWebView`). Any unprivileged background process running under the user's account can read unencrypted files in `%APPDATA%`.

### 2.2 Stronghold Vault Operation
Tauri's Stronghold plugin (`tauri-plugin-stronghold`) integrates the IOTA Stronghold library:
1. **Key Derivation (Argon2id):**
   Derives a 256-bit encryption key from a master secret using Argon2id with high memory cost parameters to defeat GPU/ASIC brute-force attacks.
2. **Encrypted Snapshot (AES-256-GCM):**
   All secrets (Supabase refresh tokens, JWTs, offline keys) are stored in an encrypted snapshot file on disk. Plaintext data is never written to disk.
3. **Memory Zeroization:**
   Decrypted secrets in RAM are held in protected memory buffers that are zeroized on drop.

### 2.3 Adapter Integration
In `src/lib/secureStorage.ts`, `TauriStrongholdAdapter` routes `getItem`, `setItem`, and `removeItem` over Tauri's IPC bridge (`plugin:stronghold|get_record`, `plugin:stronghold|set_record`, `plugin:stronghold|remove_record`).

---

## 3. OS-Native Fallback Alternatives

While Stronghold provides cross-platform cryptographic parity, native OS credential stores offer seamless OS integration:
- **Windows:** Data Protection API (DPAPI via `CryptProtectData`) binds keys to the user's Windows logon credentials.
- **macOS:** Apple Keychain Services.
- **Linux:** Freedesktop Secret Service (GNOME Keyring / KWallet).

---

## 4. Feasibility Verdict & Requirements

| Component | Status | Detail |
|---|---|---|
| Tauri Config | Ready | `src-tauri/tauri.conf.json` configured with strict CSP and window constraints. |
| Cargo Config | Ready | `src-tauri/Cargo.toml` with `tauri-plugin-stronghold`. |
| Rust Main | Ready | `src-tauri/src/main.rs` initialized with Stronghold builder. |
| Local Compilation | Blocked | Requires Rust compiler (`rustc`, `cargo`) and Microsoft C++ Build Tools (not installed on host). |
| Windows MSI / NSIS | Ready | Configuration ready for GitHub Actions / CI build pipeline. |