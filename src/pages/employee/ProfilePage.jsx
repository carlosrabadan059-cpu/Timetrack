import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Button, Input } from '../../components/ui';
import { User, Mail, Shield, Bell, Key } from 'lucide-react';
import './ProfilePage.css';

const ProfilePage = () => {
    const { profile } = useAuth();

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
                            {profile?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="profile-avatar-info">
                            <h3>{profile?.name || 'Usuario'}</h3>
                            <span className="profile-role-badge">
                                {profile?.role === 'admin' ? 'Administrador' : 'Empleado'}
                            </span>
                        </div>
                    </div>

                    <div className="profile-form">
                        <Input
                            label="Nombre Completo"
                            value={profile?.name || ''}
                            icon={User}
                            readOnly
                        />
                        <Input
                            label="Correo Electrónico"
                            value={profile?.email || 'usuario@timetrack.com'}
                            icon={Mail}
                            readOnly
                        />
                        <Input
                            label="ID de Empleado"
                            value={profile?.id || 'EMP-001'}
                            icon={Shield}
                            readOnly
                        />
                    </div>
                </Card>

                {/* Settings */}
                <div className="profile-settings-column">
                    <Card title="Seguridad" className="settings-card">
                        <div className="settings-item">
                            <div className="settings-icon">
                                <Key size={20} />
                            </div>
                            <div className="settings-info">
                                <h4>Contraseña</h4>
                                <p>Última actualización hace 3 meses</p>
                            </div>
                            <Button variant="outline" size="sm">Cambiar</Button>
                        </div>
                        <div className="settings-item">
                            <div className="settings-icon">
                                <Shield size={20} />
                            </div>
                            <div className="settings-info">
                                <h4>Autenticación en 2 pasos</h4>
                                <p>Desactivado</p>
                            </div>
                            <Button variant="outline" size="sm">Activar</Button>
                        </div>
                    </Card>

                    <Card title="Preferencias" className="settings-card">
                        <div className="settings-item">
                            <div className="settings-icon">
                                <Bell size={20} />
                            </div>
                            <div className="settings-info">
                                <h4>Notificaciones</h4>
                                <p>Recibir alertas por correo</p>
                            </div>
                            <div className="toggle-switch active"></div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
