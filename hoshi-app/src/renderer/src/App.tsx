import { AuthProvider } from './auth/AuthContext'
import { ChatMessagesProvider } from './chat/ChatMessagesContext'
import { ChatSessionProvider } from './chat/ChatSessionContext'
import { MainShell } from './components/MainShell'
import './styles/theme.css'

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <ChatSessionProvider>
        <ChatMessagesProvider>
          <MainShell />
        </ChatMessagesProvider>
      </ChatSessionProvider>
    </AuthProvider>
  )
}

export default App
