import { useState, useEffect, useCallback } from 'react';
import { Plus, Building2, Globe, Smartphone, Wifi, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { Card, Button, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import './SuperAdminCompaniesPage.css';

const TABS = ['General', 'Modos de fichaje', 'Primer admin'];

const defaultClockingModes = {
    web: true,
    mobile: true,
    twoN: { enabled: false, type: null, ac_base_url: '', ac_api_token: '', device_webhook_secret: null },
};

const defaultForm = {
    name: '',
    cif: '',
    address: '',
    email: '',
    clocking_modes: defaultClockingModes,
    admin: { full_name: '', email: '', password: '' },
};

function ClockingModeBadges({ modes }) {
    if (!modes) return null;
    return (
        <div className="company-modes">
            {modes.web && (
                <span className="mode-badge mode-web" title="Fichaje Web">
                    <Globe size={12} /> Web
                </span>
            )}
            {modes.mobile && (
                <span className="mode-badge mode-mobile" title="Fichaje Móvil">
                    <Smartphone size={12} /> Móvil
                </span>
            )}
            {modes.twoN?.enabled && (
                <span className="mode-badge mode-2n" title={`2N ${modes.twoN.type === 'ac' ? 'Access Commander' : 'Dispositivo'}`}>
                    <Wifi size={12} /> {modes.twoN.type === 'ac' ? '2N AC' : '2N Dispositivo'}
                </span>
            )}
        </div>
    );
}

const SuperAdminCompaniesPage = () => {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [form, setForm] = useState(defaultForm);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const loadCompanies = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/superadmin/companies');
            setCompanies(res.data ?? []);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadCompanies(); }, [loadCompanies]);

    const openCreate = () => {
        setForm(defaultForm);
        setFormError('');
        setActiveTab(0);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setFormError('');
    };

    const setModes = (updater) => {
        setForm(f => ({
            ...f,
            clocking_modes: typeof updater === 'function' ? updater(f.clocking_modes) : updater,
        }));
    };

    const setTwoN = (patch) => {
        setModes(m => ({ ...m, twoN: { ...m.twoN, ...patch } }));
    };

    const validateTab = () => {
        if (activeTab === 0) {
            if (!form.name.trim()) return 'El nombre de la empresa es obligatorio';
        }
        if (activeTab === 1) {
            const { twoN } = form.clocking_modes;
            if (twoN.enabled && !twoN.type) return 'Selecciona el tipo de integración 2N';
            if (twoN.enabled && twoN.type === 'ac') {
                if (!twoN.ac_base_url.trim()) return 'La URL del Access Commander es obligatoria';
                if (!twoN.ac_api_token.trim()) return 'El API Token es obligatorio';
            }
        }
        if (activeTab === 2) {
            if (!form.admin.full_name.trim()) return 'El nombre del administrador es obligatorio';
            if (!form.admin.email.trim()) return 'El email es obligatorio';
            if (form.admin.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
        }
        return null;
    };

    const handleNext = () => {
        const err = validateTab();
        if (err) { setFormError(err); return; }
        setFormError('');
        setActiveTab(t => t + 1);
    };

    const handleSubmit = async () => {
        const err = validateTab();
        if (err) { setFormError(err); return; }
        setFormError('');
        setFormLoading(true);
        try {
            await api.post('/api/superadmin/companies', {
                name: form.name.trim(),
                cif: form.cif.trim() || undefined,
                address: form.address.trim() || undefined,
                email: form.email.trim() || undefined,
                clocking_modes: form.clocking_modes,
                admin: form.admin,
            });
            closeModal();
            loadCompanies();
        } catch (err) {
            setFormError(err.message ?? 'Error al crear la empresa');
        } finally {
            setFormLoading(false);
        }
    };

    const renderTab = () => {
        switch (activeTab) {
            case 0:
                return (
                    <div className="form-grid">
                        <div className="form-group full">
                            <label>Nombre de la empresa *</label>
                            <input
                                className="form-input"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Acme Corp"
                            />
                        </div>
                        <div className="form-group">
                            <label>CIF / NIF</label>
                            <input
                                className="form-input"
                                value={form.cif}
                                onChange={e => setForm(f => ({ ...f, cif: e.target.value }))}
                                placeholder="B12345678"
                            />
                        </div>
                        <div className="form-group">
                            <label>Email de contacto</label>
                            <input
                                className="form-input"
                                type="email"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="info@empresa.com"
                            />
                        </div>
                        <div className="form-group full">
                            <label>Dirección</label>
                            <input
                                className="form-input"
                                value={form.address}
                                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                                placeholder="Calle Mayor 1, Madrid"
                            />
                        </div>
                    </div>
                );

            case 1:
                return (
                    <div className="modes-form">
                        <div className="mode-toggle-row">
                            <div className="mode-toggle-info">
                                <Globe size={18} />
                                <div>
                                    <div className="mode-toggle-title">Fichaje Web</div>
                                    <div className="mode-toggle-desc">Botón en la app web del navegador</div>
                                </div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={form.clocking_modes.web}
                                    onChange={e => setModes(m => ({ ...m, web: e.target.checked }))}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>

                        <div className="mode-toggle-row">
                            <div className="mode-toggle-info">
                                <Smartphone size={18} />
                                <div>
                                    <div className="mode-toggle-title">Fichaje Móvil</div>
                                    <div className="mode-toggle-desc">App móvil (iOS / Android) con GPS opcional</div>
                                </div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={form.clocking_modes.mobile}
                                    onChange={e => setModes(m => ({ ...m, mobile: e.target.checked }))}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>

                        <div className="mode-toggle-row">
                            <div className="mode-toggle-info">
                                <Wifi size={18} />
                                <div>
                                    <div className="mode-toggle-title">Lectores 2N</div>
                                    <div className="mode-toggle-desc">Integración con dispositivos físicos 2N</div>
                                </div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={form.clocking_modes.twoN.enabled}
                                    onChange={e => setTwoN({ enabled: e.target.checked, type: e.target.checked ? form.clocking_modes.twoN.type : null })}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>

                        {form.clocking_modes.twoN.enabled && (
                            <div className="twoN-config">
                                <div className="form-group">
                                    <label>Tipo de integración 2N</label>
                                    <div className="radio-group">
                                        <label className="radio-option">
                                            <input
                                                type="radio"
                                                name="twoN-type"
                                                value="ac"
                                                checked={form.clocking_modes.twoN.type === 'ac'}
                                                onChange={() => setTwoN({ type: 'ac' })}
                                            />
                                            <span>2N Access Commander</span>
                                            <span className="radio-desc">Conecta vía REST API + SignalR al AC</span>
                                        </label>
                                        <label className="radio-option">
                                            <input
                                                type="radio"
                                                name="twoN-type"
                                                value="device"
                                                checked={form.clocking_modes.twoN.type === 'device'}
                                                onChange={() => setTwoN({ type: 'device' })}
                                            />
                                            <span>Dispositivo Directo</span>
                                            <span className="radio-desc">El lector 2N llama directamente al webhook</span>
                                        </label>
                                    </div>
                                </div>

                                {form.clocking_modes.twoN.type === 'ac' && (
                                    <>
                                        <div className="form-group">
                                            <label>URL del Access Commander *</label>
                                            <input
                                                className="form-input"
                                                value={form.clocking_modes.twoN.ac_base_url}
                                                onChange={e => setTwoN({ ac_base_url: e.target.value })}
                                                placeholder="https://192.168.1.1"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>API Token *</label>
                                            <div className="input-with-action">
                                                <input
                                                    className="form-input"
                                                    type={showToken ? 'text' : 'password'}
                                                    value={form.clocking_modes.twoN.ac_api_token}
                                                    onChange={e => setTwoN({ ac_api_token: e.target.value })}
                                                    placeholder="Bearer token de 2N AC"
                                                />
                                                <button
                                                    type="button"
                                                    className="input-action-btn"
                                                    onClick={() => setShowToken(v => !v)}
                                                >
                                                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {form.clocking_modes.twoN.type === 'device' && (
                                    <div className="device-info-box">
                                        <p>El secreto del webhook se generará automáticamente al crear la empresa.</p>
                                        <p>La URL del webhook será visible en la configuración de la empresa tras crearla.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );

            case 2:
                return (
                    <div className="form-grid">
                        <div className="form-group full">
                            <label>Nombre completo del administrador *</label>
                            <input
                                className="form-input"
                                value={form.admin.full_name}
                                onChange={e => setForm(f => ({ ...f, admin: { ...f.admin, full_name: e.target.value } }))}
                                placeholder="María García"
                            />
                        </div>
                        <div className="form-group">
                            <label>Email *</label>
                            <input
                                className="form-input"
                                type="email"
                                value={form.admin.email}
                                onChange={e => setForm(f => ({ ...f, admin: { ...f.admin, email: e.target.value } }))}
                                placeholder="admin@empresa.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Contraseña temporal *</label>
                            <div className="input-with-action">
                                <input
                                    className="form-input"
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.admin.password}
                                    onChange={e => setForm(f => ({ ...f, admin: { ...f.admin, password: e.target.value } }))}
                                    placeholder="Mínimo 8 caracteres"
                                />
                                <button
                                    type="button"
                                    className="input-action-btn"
                                    onClick={() => setShowPassword(v => !v)}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <p className="form-hint full">
                            El administrador recibirá acceso con estas credenciales y podrá cambiar la contraseña desde su perfil.
                        </p>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="superadmin-companies-page">
            <div className="page-header">
                <div>
                    <h1>Empresas</h1>
                    <p className="page-subtitle">Gestión de tenants y configuración de modos de fichaje</p>
                </div>
                <Button variant="primary" onClick={openCreate}>
                    <Plus size={16} /> Nueva empresa
                </Button>
            </div>

            {loading ? (
                <div className="loading-state">Cargando empresas...</div>
            ) : companies.length === 0 ? (
                <Card className="empty-state">
                    <Building2 size={48} className="empty-icon" />
                    <p>No hay empresas creadas todavía</p>
                    <Button variant="primary" onClick={openCreate}>Crear primera empresa</Button>
                </Card>
            ) : (
                <div className="companies-grid">
                    {companies.map(company => (
                        <Card key={company.id} className="company-card">
                            <div className="company-card-header">
                                <div className="company-avatar">
                                    {company.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="company-info">
                                    <h3 className="company-name">{company.name}</h3>
                                    {company.email && <p className="company-email">{company.email}</p>}
                                </div>
                                <ChevronRight size={18} className="company-arrow" />
                            </div>
                            <ClockingModeBadges modes={company.settings?.clocking_modes} />
                            <div className="company-meta">
                                <span>Creada {new Date(company.created_at).toLocaleDateString('es-ES')}</span>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title="Nueva empresa"
                size="lg"
            >
                <div className="wizard-tabs">
                    {TABS.map((tab, i) => (
                        <div
                            key={tab}
                            className={`wizard-tab ${i === activeTab ? 'active' : ''} ${i < activeTab ? 'done' : ''}`}
                        >
                            <span className="wizard-tab-num">{i < activeTab ? '✓' : i + 1}</span>
                            <span>{tab}</span>
                        </div>
                    ))}
                </div>

                <div className="wizard-body">
                    {renderTab()}
                </div>

                {formError && <p className="form-error">{formError}</p>}

                <div className="modal-footer">
                    {activeTab > 0 && (
                        <Button variant="ghost" onClick={() => { setFormError(''); setActiveTab(t => t - 1); }}>
                            Atrás
                        </Button>
                    )}
                    <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
                    {activeTab < TABS.length - 1 ? (
                        <Button variant="primary" onClick={handleNext}>
                            Siguiente
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={handleSubmit} disabled={formLoading}>
                            {formLoading ? 'Creando...' : 'Crear empresa'}
                        </Button>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default SuperAdminCompaniesPage;
