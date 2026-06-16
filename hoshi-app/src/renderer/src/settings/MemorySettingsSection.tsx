import { useMemory } from '../memory/MemoryContext'
import { useSettings } from './SettingsContext'
import { AppPreferenceSection } from './AppPreferenceForm'

export function MemorySettingsSection(): React.JSX.Element {
  const { setWorkspaceTab } = useMemory()
  const { closeSettings } = useSettings()

  const openMemoryPanel = (): void => {
    closeSettings()
    setWorkspaceTab('memory')
  }

  return (
    <>
      <AppPreferenceSection
        title="记忆"
        hint="控制星奈记住新内容时的提醒方式。修改后立即生效。"
      >
        {({ preferences, updatePreferences }) => (
          <>
            <label className="settings-toggle-row">
              <span>
                <strong>记忆提醒气泡</strong>
                <small>星奈形成或晋升记忆时弹出提示</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.memoryToastEnabled}
                onChange={(event) => {
                  void updatePreferences({ memoryToastEnabled: event.target.checked })
                }}
              />
            </label>

            <div className="settings-field">
              <label htmlFor="memory-toast-dwell">提醒停留（毫秒）</label>
              <input
                id="memory-toast-dwell"
                type="range"
                min={1000}
                max={8000}
                step={500}
                value={preferences.memoryToastDwellMs}
                disabled={!preferences.memoryToastEnabled}
                onChange={(event) => {
                  void updatePreferences({
                    memoryToastDwellMs: Number(event.target.value)
                  })
                }}
              />
              <span className="settings-field__value">{preferences.memoryToastDwellMs} ms</span>
            </div>
          </>
        )}
      </AppPreferenceSection>

      <section className="settings-card">
        <h2>记忆管理</h2>
        <p className="settings-card__hint">查看、编辑或删除星奈记住的点点滴滴。</p>
        <button type="button" className="settings-btn settings-btn--primary" onClick={openMemoryPanel}>
          打开记忆面板
        </button>
      </section>
    </>
  )
}
