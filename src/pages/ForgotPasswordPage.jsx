import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import './LoginPage.css';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const { resetPassword } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: resetError } = await resetPassword(email);

        setLoading(false);

        if (resetError) {
            setError(resetError);
            return;
        }

        setSent(true);
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-form-section">
                    <div className="login-form-wrapper">
                        <div className="login-logo">
                            <Clock size={40} />
                            <span>TimeTrack</span>
                        </div>

                        {sent ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                                    <CheckCircle size={48} color="var(--color-success, #16a34a)" />
                                </div>
                                <div className="login-header" style={{ marginBottom: 'var(--space-4)' }}>
                                    <h1>Revisa tu correo</h1>
                                    <p>
                                        Hemos enviado un enlace de recuperación a <strong>{email}</strong>.
                                        Haz clic en el enlace para establecer tu nueva contraseña.
                                    </p>
                                </div>
                                <Link to="/login" className="login-forgot" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                    <ArrowLeft size={14} /> Volver al inicio de sesión
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="login-header">
                                    <h1>Recuperar contraseña</h1>
                                    <p>Introduce tu email y te enviaremos un enlace para restablecer tu contraseña</p>
                                </div>

                                <form onSubmit={handleSubmit} className="login-form">
                                    {error && (
                                        <div className="login-error">{error}</div>
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

                                    <Button
                                        type="submit"
                                        variant="primary"
                                        fullWidth
                                        loading={loading}
                                    >
                                        Enviar enlace de recuperación
                                    </Button>
                                </form>

                                <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
                                    <Link to="/login" className="login-forgot" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                        <ArrowLeft size={14} /> Volver al inicio de sesión
                                    </Link>
                                </div>
                            </>
                        )}
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

export default ForgotPasswordPage;
