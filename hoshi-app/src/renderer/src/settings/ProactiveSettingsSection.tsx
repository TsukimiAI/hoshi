import { useProactivePreferences } from './useProactivePreferences'

export function ProactiveSettingsSection(): React.JSX.Element {
  const { preferences, updatePreferences, ready, error } = useProactivePreferences()

  if (!ready) {
    return <p className="settings-message is-info">加载主动对话设置…</p>
  }

  if (!preferences) {
    return <p className="settings-message is-error">{error ?? '无法加载主动对话设置'}</p>
  }

  return (
    <section className="settings-card">
      <h2>主动对话</h2>
      <p className="settings-card__hint">
        主动对话：星奈会在合适时机主动找你——可能是提问、分享小事，或轻柔提醒。追加对话：你发消息后，星奈回复完还可能再自然多说几句。两者可分别开关，时机由星奈判断。
      </p>

      <div className="settings-form settings-form--wide">
        <label className="settings-toggle-row">
          <span>
            <strong>开启主动对话</strong>
            <small>关闭后星奈不会主动提问、分享或提醒你</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.enabled}
            onChange={(event) => {
              void updatePreferences({ enabled: event.target.checked })
            }}
          />
        </label>

        <label className="settings-toggle-row">
          <span>
            <strong>允许追加对话</strong>
            <small>你发消息后，星奈回复完可能再连续多说几句</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.followUpEnabled}
            onChange={(event) => {
              void updatePreferences({ followUpEnabled: event.target.checked })
            }}
          />
        </label>

        {error ? <p className="settings-message is-error">{error}</p> : null}
      </div>
    </section>
  )
}
