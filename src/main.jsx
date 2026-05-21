import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { CorrectionsProvider } from './contexts/CorrectionsContext.jsx'
import './index.css'

class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }
    static getDerivedStateFromError(error) {
        return { error }
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: '2rem', fontFamily: 'monospace', background: '#fff', color: '#111', minHeight: '100vh' }}>
                    <h2 style={{ color: '#c00' }}>Error al cargar la aplicación</h2>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.85rem', marginTop: '1rem', background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
                        {this.state.error.message}
                        {'\n\n'}
                        {this.state.error.stack}
                    </pre>
                    <button
                        onClick={() => { localStorage.clear(); window.location.reload(); }}
                        style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
                    >
                        Limpiar caché y reintentar
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <AuthProvider>
                    <CorrectionsProvider>
                        <App />
                    </CorrectionsProvider>
                </AuthProvider>
            </BrowserRouter>
        </ErrorBoundary>
    </StrictMode>,
)
