import { useState } from 'react'
import { usePetPreferences } from '../pet/usePetPreferences'
import { useShellMode } from '../shell/ShellModeContext'
import { ProactiveSettingsSection } from './ProactiveSettingsSection'

export function PetSettingsSection(): React.JSX.Element {
  const { preferences, updatePreferences, ready } = usePetPreferences()
  const { enterPetMode } = useShellMode()
  const [resetting, setResetting] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const handleResetPosition = async (): Promise<void> => {
    setResetting(true)
    setInfo(null)
    try {
      await window.hoshi.window.resetPetBounds()
      setInfo('桌宠位置已重置')
    } catch (err) {
      setInfo(err instanceof Error ? err.message : '重置位置失败')
    } finally {
      setResetting(false)
    }
  }

  if (!ready) {
    return <p className="settings-message is-info">加载桌宠偏好…</p>
  }

  return (
    <>
      <ProactiveSettingsSection />

      <section className="settings-card">
      <h2>桌宠偏好</h2>
      <p className="settings-card__hint">调整桌宠气泡停留、滚出动画和窗口置顶等行为。修改后立即生效。</p>

      <div className="settings-form settings-form--wide">
        <div className="settings-field">
          <label htmlFor="pet-bubble-dwell">回复结束后停留（毫秒）</label>
          <input
            id="pet-bubble-dwell"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={preferences.bubbleDwellMs}
            onChange={(event) => {
              void updatePreferences({ bubbleDwellMs: Number(event.target.value) })
            }}
          />
          <span className="settings-field__value">{preferences.bubbleDwellMs} ms</span>
        </div>

        <div className="settings-field">
          <label htmlFor="pet-bubble-exit">气泡滚出动画（毫秒）</label>
          <input
            id="pet-bubble-exit"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={preferences.bubbleExitMs}
            onChange={(event) => {
              void updatePreferences({ bubbleExitMs: Number(event.target.value) })
            }}
          />
          <span className="settings-field__value">{preferences.bubbleExitMs} ms</span>
        </div>

        <div className="settings-field">
          <label htmlFor="pet-greeting-dwell">问候气泡停留（毫秒）</label>
          <input
            id="pet-greeting-dwell"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={preferences.greetingDwellMs}
            onChange={(event) => {
              void updatePreferences({ greetingDwellMs: Number(event.target.value) })
            }}
          />
          <span className="settings-field__value">{preferences.greetingDwellMs} ms</span>
        </div>

        <div className="settings-field">
          <label htmlFor="pet-max-bubbles">最多显示回复气泡数</label>
          <input
            id="pet-max-bubbles"
            type="range"
            min={1}
            max={8}
            step={1}
            value={preferences.maxReplyBubbles}
            onChange={(event) => {
              void updatePreferences({ maxReplyBubbles: Number(event.target.value) })
            }}
          />
          <span className="settings-field__value">{preferences.maxReplyBubbles} 条</span>
        </div>

        <div className="settings-field">
          <label htmlFor="pet-drag-threshold">拖动触发距离（像素）</label>
          <input
            id="pet-drag-threshold"
            type="range"
            min={2}
            max={20}
            step={1}
            value={preferences.dragThresholdPx}
            onChange={(event) => {
              void updatePreferences({ dragThresholdPx: Number(event.target.value) })
            }}
          />
          <span className="settings-field__value">{preferences.dragThresholdPx} px</span>
        </div>

        <label className="settings-toggle-row">
          <span>
            <strong>窗口置顶</strong>
            <small>桌宠始终保持在最前</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.alwaysOnTop}
            onChange={(event) => {
              void updatePreferences({ alwaysOnTop: event.target.checked })
            }}
          />
        </label>

        <label className="settings-toggle-row">
          <span>
            <strong>点击问候</strong>
            <small>单击桌宠时弹出问候气泡</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.greetingOnClick}
            onChange={(event) => {
              void updatePreferences({ greetingOnClick: event.target.checked })
            }}
          />
        </label>

        <div className="settings-field">
          <label htmlFor="pet-panel-open-gesture">展开界面交互方式</label>
          <select
            id="pet-panel-open-gesture"
            value={preferences.panelOpenGesture}
            onChange={(event) => {
              void updatePreferences({
                panelOpenGesture: event.target.value as typeof preferences.panelOpenGesture
              })
            }}
          >
            <option value="context-menu">右键</option>
            <option value="double-click">双击</option>
          </select>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-btn"
            disabled={resetting}
            onClick={() => void handleResetPosition()}
          >
            {resetting ? '重置中…' : '重置桌宠位置'}
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={() => void enterPetMode()}
          >
            返回桌宠模式
          </button>
        </div>

        {info ? <p className="settings-message is-info">{info}</p> : null}
      </div>
    </section>
    </>
  )
}
