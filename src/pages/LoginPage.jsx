import { useState } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Mail, Lock, Eye, EyeOff, Check } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import './LoginPage.css';

/**
 * Login Page
 * Premium login interface with email/password auth
 */
const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { signIn, isAuthenticated, profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const passwordReset = location.state?.passwordReset;

    // Redirect if already authenticated and profile is loaded
    if (isAuthenticated && profile) {
        const role = profile.role;
        const redirectPath = role === 'superadmin' ? '/superadmin/empresas' : role === 'admin' || role === 'manager' ? '/admin' : '/dashboard';
        return <Navigate to={redirectPath} replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: authError } = await signIn(email, password);

        if (authError) {
            setError(authError);
            setLoading(false);
            return;
        }

        // Navigate will happen via the redirect above on re-render
    };

    return (
        <div className="login-page">
            <div className="login-container">
                {/* Left side - Form */}
                <div className="login-form-section">
                    <div className="login-form-wrapper">
                        <div className="login-logo">
                            <Clock size={40} />
                            <span>TimeTrack</span>
                        </div>

                        <div className="login-header">
                            <h1>Bienvenido</h1>
                            <p>Introduce tus credenciales para acceder</p>
                        </div>

                        <form onSubmit={handleSubmit} className="login-form">
                            {passwordReset && (
                                <div className="login-success">
                                    Contraseña actualizada correctamente. Puedes iniciar sesión.
                                </div>
                            )}
                            {error && (
                                <div className="login-error">
                                    {error}
                                </div>
                            )}

                            <Input
                                label="Email"
                                type="email"
                                icon={Mail}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tu@email.com"
                                required
                                autoComplete="email"
                            />

                            <div className="login-password-field">
                                <Input
                                    label="Contraseña"
                                    type={showPassword ? 'text' : 'password'}
                                    icon={Lock}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="login-password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            <div className="login-remember">
                                <label className="login-checkbox">
                                    <input type="checkbox" />
                                    <span>Recordarme</span>
                                </label>
                                <Link to="/forgot-password" className="login-forgot">¿Olvidaste tu contraseña?</Link>
                            </div>

                            <Button
                                type="submit"
                                variant="primary"
                                fullWidth
                                loading={loading}
                            >
                                Iniciar Sesión
                            </Button>
                        </form>

                        <div className="login-demo-credentials">
                            <p>Credenciales de prueba:</p>
                            <code>empleado@timetrack.com / 123456</code>
                            <code>admin@timetrack.com / 123456</code>
                        </div>
                    </div>
                </div>

                {/* Right side - Hero */}
                <div className="login-hero-section">
                    <div className="login-hero-content">
                        <h2>Control Horario</h2>
                        <p>Gestiona tu tiempo de trabajo de forma sencilla y eficiente</p>

                        <div className="login-hero-features">
                            <div className="login-hero-feature">
                                <div className="login-hero-feature-icon"><Check size={14} strokeWidth={3} /></div>
                                <span>Fichaje desde cualquier dispositivo</span>
                            </div>
                            <div className="login-hero-feature">
                                <div className="login-hero-feature-icon"><Check size={14} strokeWidth={3} /></div>
                                <span>Control de ubicación automático</span>
                            </div>
                            <div className="login-hero-feature">
                                <div className="login-hero-feature-icon"><Check size={14} strokeWidth={3} /></div>
                                <span>Informes detallados y exportables</span>
                            </div>
                        </div>
                    </div>

                    <div className="login-hero-pattern"></div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
