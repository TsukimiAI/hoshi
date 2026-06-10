import { AuthProvider } from './auth/AuthContext'
import { MainShell } from './components/MainShell'
import './styles/theme.css'

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <MainShell />
    </AuthProvider>
  )
}

export default App
