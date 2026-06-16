import { AppPreferenceSection } from './AppPreferenceForm'
import { DEFAULT_APP_PREFERENCES } from './appPreferences'

export function ChatSettingsSection(): React.JSX.Element {
  return (
    <AppPreferenceSection
      title="对话"
      hint="控制工作台与桌宠聊天的默认行为。修改后立即生效。"
    >
      {({ preferences, updatePreferences }) => (
        <>
          <label className="settings-toggle-row">
            <span>
              <strong>默认开启联网</strong>
              <small>开启后，输入框中的联网按钮将始终打开且不可关闭</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.defaultWebSearch}
              onChange={(event) => {
                void updatePreferences({ defaultWebSearch: event.target.checked })
              }}
            />
          </label>

          <div className="settings-field">
            <label htmlFor="chat-send-shortcut">发送快捷键</label>
            <select
              id="chat-send-shortcut"
              value={preferences.sendShortcut}
              onChange={(event) => {
                void updatePreferences({
                  sendShortcut: event.target.value as typeof preferences.sendShortcut
                })
              }}
            >
              <option value="enter">Enter 发送，Shift+Enter 换行</option>
              <option value="ctrl-enter">Ctrl+Enter 发送，Enter 换行</option>
            </select>
          </div>

          <label className="settings-toggle-row">
            <span>
              <strong>自动滚动到底部</strong>
              <small>新消息出现时跟随滚动</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.autoScrollChat}
              onChange={(event) => {
                void updatePreferences({ autoScrollChat: event.target.checked })
              }}
            />
          </label>

          <div className="settings-field">
            <label htmlFor="chat-char-delay">字与字间隔（毫秒）</label>
            <input
              id="chat-char-delay"
              type="range"
              min={0}
              max={200}
              step={5}
              value={
                preferences.sentencePlaybackCharDelayMs ??
                DEFAULT_APP_PREFERENCES.sentencePlaybackCharDelayMs
              }
              onChange={(event) => {
                void updatePreferences({
                  sentencePlaybackCharDelayMs: Number(event.target.value)
                })
              }}
            />
            <span className="settings-field__value">
              {preferences.sentencePlaybackCharDelayMs ??
                DEFAULT_APP_PREFERENCES.sentencePlaybackCharDelayMs}{' '}
              ms
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="chat-gap-delay">句与句间隔（毫秒）</label>
            <input
              id="chat-gap-delay"
              type="range"
              min={0}
              max={2000}
              step={50}
              value={preferences.sentenceGapDelayMs ?? DEFAULT_APP_PREFERENCES.sentenceGapDelayMs}
              onChange={(event) => {
                void updatePreferences({
                  sentenceGapDelayMs: Number(event.target.value)
                })
              }}
            />
            <span className="settings-field__value">
              {preferences.sentenceGapDelayMs ?? DEFAULT_APP_PREFERENCES.sentenceGapDelayMs} ms
            </span>
          </div>
        </>
      )}
    </AppPreferenceSection>
  )
}
