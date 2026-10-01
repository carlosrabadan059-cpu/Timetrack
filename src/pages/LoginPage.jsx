import { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Mail, Lock, Eye, EyeOff, Check, ShieldCheck } from 'lucide-react';
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

    const [mfaCode, setMfaCode] = useState('');
    const [accountDisabled] = useState(() => {
        try {
            const flag = sessionStorage.getItem('tt_account_disabled') === '1';
            sessionStorage.removeItem('tt_account_disabled');
            return flag;
        } catch { return false; }
    });
    const { signIn, signOut, verifyMfa, mfaPending, isAuthenticated, profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const passwordReset = location.state?.passwordReset;

    // Timeout de seguridad: si tras 8s de login exitoso no hay perfil, mostrar error
    const [profileTimeout, setProfileTimeout] = useState(false);
    useEffect(() => {
        if (!loading || !isAuthenticated) return;
        const t = setTimeout(() => setProfileTimeout(true), 8000);
        return () => clearTimeout(t);
    }, [loading, isAuthenticated]);

    useEffect(() => {
        if (mfaPending) setLoading(false);
    }, [mfaPending]);

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

    const handleMfaSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const { error: mfaError } = await verifyMfa(mfaCode.trim());
        if (mfaError) {
            setError(mfaError);
            setLoading(false);
        }
    };

    const handleMfaCancel = async () => {
        await signOut();
        setMfaCode('');
        setError('');
        setLoading(false);
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

                        {mfaPending ? (
                        <form onSubmit={handleMfaSubmit} className="login-form">
                            {error && <div className="login-error">{error}</div>}
                            <p>Introduce el código de 6 dígitos de tu app de autenticación.</p>
                            <Input
                                label="Código de verificación"
                                icon={ShieldCheck}
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="123456"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                autoFocus
                            />
                            <Button type="submit" variant="primary" fullWidth loading={loading} disabled={mfaCode.length !== 6}>
                                Verificar
                            </Button>
                            <Button type="button" variant="outline" fullWidth onClick={handleMfaCancel}>
                                Cancelar
                            </Button>
                        </form>
                        ) : (
                        <form onSubmit={handleSubmit} className="login-form">
                            {accountDisabled && !error && (
                                <div className="login-error">
                                    Tu cuenta está dada de baja. Contacta con tu empresa.
                                </div>
                            )}
                            {passwordReset && (
                                <div className="login-success">
                                    Contraseña actualizada correctamente. Puedes iniciar sesión.
                                </div>
                            )}
                            {(error || profileTimeout) && (
                                <div className="login-error">
                                    {profileTimeout && !error
                                        ? 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
                                        : error}
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
                                loading={loading && !profileTimeout}
                            >
                                Iniciar Sesión
                            </Button>
                        </form>
                        )}

                        <p className="login-legal">
                            <Link to="/privacidad">Política de privacidad</Link>
                        </p>
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
