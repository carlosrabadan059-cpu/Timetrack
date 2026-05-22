import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../lib/api';
import { Card, Button, Input } from '../../components/ui';
import { User, Mail, Shield, Bell, Key, Sun, Moon, Monitor } from 'lucide-react';
import './ProfilePage.css';

const ProfilePage = () => {
    const { profile } = useAuth();
    const { theme, setTheme } = useTheme();

    const [name, setName] = useState(profile?.full_name || profile?.name || '');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [notifications, setNotifications] = useState(profile?.notifications_email ?? true);
    const [twoFa, setTwoFa] = useState(profile?.two_factor_enabled ?? false);

    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState(false);

    const originalName = profile?.full_name || profile?.name || '';

    const handleSaveName = async () => {
        setSaving(true);
        setSaveError('');
        setSaveSuccess(false);
        try {
            await api.patch('/api/me', { full_name: name.trim() });
            setSaveSuccess(true);
        } catch (e) {
            setSaveError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleNotificationsToggle = async () => {
        const next = !notifications;
        setNotifications(next);
        try {
            await api.post('/api/me/notifications', { enabled: next });
        } catch {
            setNotifications(!next);
        }
    };

    const handleTwoFaToggle = async () => {
        const next = !twoFa;
        setTwoFa(next);
        try {
            await api.post('/api/me/2fa/toggle', { enabled: next });
        } catch {
            setTwoFa(!next);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPwError('');
        setPwSuccess(false);
        if (newPw.length < 8) {
            setPwError('La nueva contraseña debe tener mínimo 8 caracteres');
            return;
        }
        setPwSaving(true);
        try {
            await api.post('/api/me/change-password', {
                current_password: currentPw,
                new_password: newPw,
            });
            setPwSuccess(true);
            setCurrentPw('');
            setNewPw('');
            setShowPasswordForm(false);
        } catch (e) {
            setPwError(e.message);
        } finally {
            setPwSaving(false);
        }
    };

    const roleLabel =
        profile?.role === 'admin' ? 'Administrador' :
        profile?.role === 'manager' ? 'Manager' : 'Empleado';

    return (
        <div className="profile-page">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Mi Perfil</h1>
                    <p className="page-subtitle">Gestiona tu información personal y preferencias</p>
                </div>
            </header>

            <div className="profile-grid">
                {/* Personal Info */}
                <Card title="Información Personal" className="profile-card">
                    <div className="profile-avatar-section">
                        <div className="profile-avatar-large">
                            {name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="profile-avatar-info">
                            <h3>{name || 'Usuario'}</h3>
                            <span className="profile-role-badge">{roleLabel}</span>
                        </div>
                    </div>

                    <div className="profile-form">
                        <Input
                            label="Nombre Completo"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setSaveSuccess(false); }}
                            icon={User}
                        />
                        <Input
                            label="Correo Electrónico"
                            value={profile?.email || ''}
                            icon={Mail}
                            readOnly
                        />
                        <Input
                            label="ID de Empleado"
                            value={profile?.employee_code || ''}
                            icon={Shield}
                            readOnly
                        />

                        {saveError && <p className="form-error">{saveError}</p>}
                        {saveSuccess && <p className="form-success">Guardado correctamente</p>}

                        <Button
                            variant="primary"
                            onClick={handleSaveName}
                            loading={saving}
                            disabled={!name.trim() || name.trim() === originalName}
                        >
                            Guardar cambios
                        </Button>
                    </div>
                </Card>

                {/* Settings */}
                <div className="profile-settings-column">
                    <Card title="Seguridad" className="settings-card">
                        <div className="settings-item">
                            <div className="settings-icon"><Key size={20} /></div>
                            <div className="settings-info">
                                <h4>Contraseña</h4>
                                <p>Cambia tu contraseña de acceso</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setShowPasswordForm(!showPasswordForm); setPwError(''); setPwSuccess(false); }}
                            >
                                {showPasswordForm ? 'Cancelar' : 'Cambiar'}
                            </Button>
                        </div>

                        {showPasswordForm && (
                            <form onSubmit={handleChangePassword} className="password-form">
                                <Input
                                    label="Contraseña actual"
                                    type="password"
                                    value={currentPw}
                                    onChange={(e) => setCurrentPw(e.target.value)}
                                    required
                                />
                                <Input
                                    label="Nueva contraseña"
                                    type="password"
                                    value={newPw}
                                    onChange={(e) => setNewPw(e.target.value)}
                                    required
                                />
                                {pwError && <p className="form-error">{pwError}</p>}
                                {pwSuccess && <p className="form-success">Contraseña actualizada</p>}
                                <Button type="submit" variant="primary" size="sm" loading={pwSaving}>
                                    Confirmar cambio
                                </Button>
                            </form>
                        )}

                        <div className="settings-item">
                            <div className="settings-icon"><Shield size={20} /></div>
                            <div className="settings-info">
                                <h4>Autenticación en 2 pasos</h4>
                                <p>{twoFa ? 'Activado' : 'Desactivado'}</p>
                            </div>
                            <div
                                className={`toggle-switch ${twoFa ? 'active' : ''}`}
                                onClick={handleTwoFaToggle}
                                role="switch"
                                aria-checked={twoFa}
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && handleTwoFaToggle()}
                            />
                        </div>
                    </Card>

                    <Card title="Preferencias" className="settings-card">
                        <div className="settings-item">
                            <div className="settings-icon"><Bell size={20} /></div>
                            <div className="settings-info">
                                <h4>Notificaciones</h4>
                                <p>Recibir alertas por correo</p>
                            </div>
                            <div
                                className={`toggle-switch ${notifications ? 'active' : ''}`}
                                onClick={handleNotificationsToggle}
                                role="switch"
                                aria-checked={notifications}
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && handleNotificationsToggle()}
                            />
                        </div>

                        <div className="settings-item">
                            <div className="settings-icon"><Monitor size={20} /></div>
                            <div className="settings-info">
                                <h4>Apariencia</h4>
                                <p>Elige el tema de la interfaz</p>
                            </div>
                            <div className="theme-selector">
                                <button
                                    className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                                    onClick={() => setTheme('light')}
                                    title="Claro"
                                ><Sun size={15} /></button>
                                <button
                                    className={`theme-btn ${theme === 'auto' ? 'active' : ''}`}
                                    onClick={() => setTheme('auto')}
                                    title="Auto"
                                ><Monitor size={15} /></button>
                                <button
                                    className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                                    onClick={() => setTheme('dark')}
                                    title="Oscuro"
                                ><Moon size={15} /></button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

        </div>
    );
};

export default ProfilePage;
