import { ProfileSettings } from './ProfileSettings'
import { SecuritySettings } from './SecuritySettings'
import { PetSettingsSection } from './PetSettingsSection'
import { ChatSettingsSection } from './ChatSettingsSection'
import { MemorySettingsSection } from './MemorySettingsSection'
import { KnowledgeSettingsSection } from './KnowledgeSettingsSection'
import { useSettings, type SettingsSection } from './SettingsContext'
import './Settings.css'

const NAV_ITEMS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'profile', label: '个人信息' },
  { id: 'security', label: '账号与安全' },
  { id: 'chat', label: '对话' },
  { id: 'memory', label: '记忆' },
  { id: 'knowledge', label: '知识库' },
  { id: 'pet', label: '桌宠' }
]

export function SettingsShell(): React.JSX.Element {
  const { section, setSection, closeSettings } = useSettings()

  return (
    <div className="settings-shell">
      <nav className="settings-shell__nav" aria-label="设置导航">
        <button
          type="button"
          className="settings-shell__back"
          onClick={closeSettings}
          aria-label="返回工作台"
        >
          ← 返回工作台
        </button>
        <p className="settings-shell__title">设置</p>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-shell__nav-btn ${section === item.id ? 'is-active' : ''}`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-shell__content">
        {section === 'profile' ? <ProfileSettings /> : null}
        {section === 'security' ? <SecuritySettings /> : null}
        {section === 'chat' ? <ChatSettingsSection /> : null}
        {section === 'memory' ? <MemorySettingsSection /> : null}
        {section === 'knowledge' ? <KnowledgeSettingsSection /> : null}
        {section === 'pet' ? <PetSettingsSection /> : null}
      </div>
    </div>
  )
}
