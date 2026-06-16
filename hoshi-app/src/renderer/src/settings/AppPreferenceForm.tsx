import { useAppPreferences } from './useAppPreferences'
import type { AppPreferences, SendShortcutMode } from './appPreferences'

interface AppPreferenceSectionProps {
  title: string
  hint: string
  children: (ctx: {
    preferences: AppPreferences
    updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>
  }) => React.ReactNode
}

export function AppPreferenceSection({
  title,
  hint,
  children
}: AppPreferenceSectionProps): React.JSX.Element {
  const { preferences, updatePreferences, ready } = useAppPreferences()

  if (!ready) {
    return <p className="settings-message is-info">加载偏好…</p>
  }

  return (
    <section className="settings-card">
      <h2>{title}</h2>
      <p className="settings-card__hint">{hint}</p>
      <div className="settings-form settings-form--wide">
        {children({ preferences, updatePreferences })}
      </div>
    </section>
  )
}

/** @deprecated Use AppPreferenceSection */
export const AppPreferenceForm = AppPreferenceSection

export function SendShortcutField({
  value,
  onChange
}: {
  value: SendShortcutMode
  onChange: (value: SendShortcutMode) => void
}): React.JSX.Element {
  return (
    <div className="settings-field">
      <label htmlFor="send-shortcut">发送快捷键</label>
      <select
        id="send-shortcut"
        value={value}
        onChange={(event) => onChange(event.target.value as SendShortcutMode)}
      >
        <option value="enter">Enter 发送，Shift+Enter 换行</option>
        <option value="ctrl-enter">Ctrl+Enter 发送，Enter 换行</option>
      </select>
    </div>
  )
}
