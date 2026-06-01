import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Clock, Lock, Eye, EyeOff } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import './LoginPage.css';

const ResetPasswordPage = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);

    const { updatePassword } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // Supabase emite PASSWORD_RECOVERY cuando el usuario llega desde el email de recuperación.
        // El token en el hash de la URL es procesado automáticamente por el cliente.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setReady(true);
            }
        });

        // Si la sesión ya está activa (p.ej. recarga de página tras el evento), permitir también
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setReady(true);
        });

        return () => subscription.unsubscribe();
    }, []);

    const passwordsMatch = password === confirmPassword;
    const passwordValid = password.length >= 8;
    const canSubmit = passwordValid && passwordsMatch && password.length > 0 && confirmPassword.length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;

        setError('');
        setLoading(true);

        const { error: updateError } = await updatePassword(password);

        setLoading(false);

        if (updateError) {
            setError(updateError);
            return;
        }

        await supabase.auth.signOut();
        navigate('/login', { state: { passwordReset: true } });
    };

    if (!ready) {
        return (
            <div className="login-page">
                <div className="login-container">
                    <div className="login-form-section">
                        <div className="login-form-wrapper">
                            <div className="login-logo">
                                <Clock size={40} />
                                <span>TimeTrack</span>
                            </div>
                            <div className="login-header">
                                <h1>Enlace inválido</h1>
                                <p>Este enlace de recuperación no es válido o ha expirado.</p>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
                                <Link to="/forgot-password" className="login-forgot">
                                    Solicitar un nuevo enlace
                                </Link>
                            </div>
                        </div>
                    </div>
                    <div className="login-hero-section">
                        <div className="login-hero-content">
                            <h2>Control Horario</h2>
                            <p>Gestiona tu tiempo de trabajo de forma sencilla y eficiente</p>
                        </div>
                        <div className="login-hero-pattern"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-form-section">
                    <div className="login-form-wrapper">
                        <div className="login-logo">
                            <Clock size={40} />
                            <span>TimeTrack</span>
                        </div>

                        <div className="login-header">
                            <h1>Nueva contraseña</h1>
                            <p>Introduce tu nueva contraseña dos veces para confirmarla</p>
                        </div>

                        <form onSubmit={handleSubmit} className="login-form">
                            {error && (
                                <div className="login-error">{error}</div>
                            )}

                            <div className="login-password-field">
                                <Input
                                    label="Nueva contraseña"
                                    type={showPassword ? 'text' : 'password'}
                                    icon={Lock}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    required
                                    autoComplete="new-password"
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

                            <div className="login-password-field">
                                <Input
                                    label="Confirmar contraseña"
                                    type={showConfirm ? 'text' : 'password'}
                                    icon={Lock}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite la contraseña"
                                    required
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    className="login-password-toggle"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                >
                                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {confirmPassword.length > 0 && !passwordsMatch && (
                                <div className="login-error">Las contraseñas no coinciden</div>
                            )}
                            {password.length > 0 && !passwordValid && (
                                <div className="login-error">La contraseña debe tener al menos 8 caracteres</div>
                            )}

                            <Button
                                type="submit"
                                variant="primary"
                                fullWidth
                                loading={loading}
                                disabled={!canSubmit}
                            >
                                Establecer nueva contraseña
                            </Button>
                        </form>
                    </div>
                </div>

                <div className="login-hero-section">
                    <div className="login-hero-content">
                        <h2>Control Horario</h2>
                        <p>Gestiona tu tiempo de trabajo de forma sencilla y eficiente</p>
                    </div>
                    <div className="login-hero-pattern"></div>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
