import { AuthProvider } from './auth/AuthContext'
import { ChatMessagesProvider } from './chat/ChatMessagesContext'
import { ChatSessionProvider } from './chat/ChatSessionContext'
import { MainShell } from './components/MainShell'
import { MemoryProvider } from './memory/MemoryContext'
import { ProactivePetUiProvider } from './pet/ProactivePetUiProvider'
import { PetPreferencesProvider } from './pet/usePetPreferences'
import { AppPreferencesProvider } from './settings/useAppPreferences'
import { ProactivePreferencesProvider } from './settings/useProactivePreferences'
import { SettingsProvider } from './settings/SettingsContext'
import { ShellModeProvider } from './shell/ShellModeContext'
import './styles/theme.css'

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <ShellModeProvider>
        <AppPreferencesProvider>
          <PetPreferencesProvider>
            <ProactivePreferencesProvider>
              <SettingsProvider>
                <ChatSessionProvider>
                  <MemoryProvider>
                    <ChatMessagesProvider>
                      <ProactivePetUiProvider>
                        <MainShell />
                      </ProactivePetUiProvider>
                    </ChatMessagesProvider>
                  </MemoryProvider>
                </ChatSessionProvider>
              </SettingsProvider>
            </ProactivePreferencesProvider>
          </PetPreferencesProvider>
        </AppPreferencesProvider>
      </ShellModeProvider>
    </AuthProvider>
  )
}

export default App
