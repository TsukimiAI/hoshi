import { useSettings, type SettingsSection } from './SettingsContext'

export function useOpenSettingsSection(): (section: SettingsSection) => void {
  const { openSettings } = useSettings()
  return openSettings
}
