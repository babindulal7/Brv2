/**
 * Capacitor Configuration for Babin Rentals OS.
 *
 * Security Requirements (PLAN.md §10):
 *   - cleartext: false (no cleartext HTTP traffic allowed; all API traffic must be HTTPS/TLS).
 *   - allowMixedContent: false (strictly block HTTP resources on HTTPS WebView).
 *   - webContentsDebuggingEnabled: false in production.
 *   - androidScheme: 'https' (standard secure origin for local assets).
 *   - sourcemap: false (enforced in vite.config.ts; Capacitor templates must not override).
 */

export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    url?: string;
    cleartext?: boolean;
    androidScheme?: string;
    allowNavigation?: string[];
  };
  android?: {
    allowMixedContent?: boolean;
    captureInput?: boolean;
    webContentsDebuggingEnabled?: boolean;
    appendUserAgent?: string;
    backgroundColor?: string;
  };
}

const config: CapacitorConfig = {
  appId: 'com.babinrentals.os',
  appName: 'Babin Rentals OS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0A0D14',
  },
};

export default config;