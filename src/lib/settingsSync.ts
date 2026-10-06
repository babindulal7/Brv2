import { newClientUuid, supabase } from './supabase'
import { captureError } from './monitoring'
import {
  SETTING_SPECS,
  SETTINGS_DEFAULTS,
  applyRemoteSettingPatch,
  applyRemoteSettings,
  getSetting,
  isDeviceLocalKey,
  writeSettings,
  type RemoteSettingRow,
  type SettingKey,
  type SettingValue,
  type SettingsRecord,
} from './settingsStore'

/**
 * Database side of the settings store (0158, G1). Kept apart from `settingsStore.ts` so the many modules
 * and tests that only READ a setting never import the Supabase client.
 *
 * RULING 2026-10-07: reads are best-effort — if the network is down the device keeps the last values it
 * had and its old local copy. Writes are NOT best-effort: a failed or refused `set_setting` throws, so the
 * screen never shows "saved" for a value no other device will see (P3).
 */
export async function hydrateSharedSettings(): Promise<void> {
  const { data, error } = await supabase.from('settings').select('key, value, scope, location_id')
  if (error) {
    captureError(error, { where: 'settingsSync.hydrate' })
    return
  }
  applyRemoteSettings((data ?? []) as unknown as RemoteSettingRow[])
}

async function setShared(key: SettingKey, value: SettingValue): Promise<void> {
  const { error } = await supabase.rpc('set_setting' as never, {
    p_client_uuid: newClientUuid(),
    p_key: key,
    p_value: value,
    p_scope: 'org',
    p_location_id: null,
  } as never)
  if (error) throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
}

/** Saves a patch: shared keys go to the database, device-local keys stay on this device. */
export async function saveSettings(patch: Partial<SettingsRecord>): Promise<void> {
  const shared: Partial<SettingsRecord> = {}
  const local: Partial<SettingsRecord> = {}
  for (const [k, v] of Object.entries(patch) as Array<[SettingKey, SettingValue]>) {
    ;(isDeviceLocalKey(k) ? local : shared)[k] = v
  }
  if (Object.keys(local).length) writeSettings(local)
  for (const [k, v] of Object.entries(shared) as Array<[SettingKey, SettingValue]>) {
    await setShared(k, v)
    applyRemoteSettingPatch({ [k]: v })
  }
}

/** "Reset to defaults": writes each differing shared value back to its default — history keeps the old one. */
export async function resetSharedSettings(): Promise<void> {
  const back: Partial<SettingsRecord> = {}
  for (const k of Object.keys(SETTING_SPECS) as SettingKey[]) {
    if (!isDeviceLocalKey(k) && getSetting(k) !== SETTINGS_DEFAULTS[k]) back[k] = SETTINGS_DEFAULTS[k]
  }
  await saveSettings(back)
}
