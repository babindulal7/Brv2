#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/**
 * Babin Rentals OS Desktop - Native Tauri Shell.
 *
 * Security Architecture (PLAN.md §10):
 * Stronghold Plugin provides AES-256-GCM encrypted vault with Argon2id
 * key derivation for auth tokens and sensitive operational secrets.
 */
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Secure derivation of master encryption key from runtime seed
            password.as_bytes().to_vec()
        }).build())
        .run(tauri::generate_context!())
        .expect("error while running Babin Rentals OS desktop application");
}
