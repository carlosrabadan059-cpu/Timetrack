import { useState } from 'react';
import {
    Building2,
    MapPin,
    Clock,
    Calendar,
    Save,
    Trash,
    Plus,
    CheckCircle,
    Store
} from 'lucide-react';
import { Card, Button, Input } from '../../components/ui';
import { MOCK_SETTINGS } from '../../lib/mockData';
import './AdminSettingsPage.css';

const AdminSettingsPage = () => {
    const [activeTab, setActiveTab] = useState('general');
    const [isSaving, setIsSaving] = useState(false);

    // Mock State for Settings - Initialized from MOCK_SETTINGS
    const [settings, setSettings] = useState({
        company: {
            name: MOCK_SETTINGS.company_name || 'TimeTrack Corp',
            cif: 'B-12345678',
            address: MOCK_SETTINGS.company_location?.address || 'Calle Principal 123, Madrid',
            email: 'admin@timetrack.corp'
        },
        branches: [
            { id: 1, name: 'Sede Central', address: 'Madrid' },
            { id: 2, name: 'Delegación Norte', address: 'Bilbao' }
        ],
        rules: {
            geoFenceRadius: MOCK_SETTINGS.allowed_radius || 100,
            courtesyMinutes: 15,
            latitude: MOCK_SETTINGS.company_location?.lat || 40.4168,
            longitude: MOCK_SETTINGS.company_location?.lng || -3.7038
        },
        work_schedule: MOCK_SETTINGS.work_schedule || {
            start: '09:00',
            end: '18:00',
            days: [1, 2, 3, 4, 5]
        },
        holidays: [
            { id: 1, date: '2026-01-01', name: 'Año Nuevo', scope: 'global' },
            { id: 2, date: '2026-05-01', name: 'Día del Trabajo', scope: 'global' },
            { id: 3, date: '2026-12-25', name: 'Navidad', scope: 'global' }
        ]
    });

    // Forms State
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '', scope: 'global' });
    const [newBranch, setNewBranch] = useState({ name: '', address: '' });

    // Handlers
    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            alert('Configuración guardada correctamente');
        }, 800);
    };

    const handleCompanyChange = (field, value) => {
        setSettings(prev => ({
            ...prev,
            company: { ...prev.company, [field]: value }
        }));
    };

    const handleRuleChange = (field, value) => {
        setSettings(prev => ({
            ...prev,
            rules: { ...prev.rules, [field]: parseFloat(value) || value }
        }));
    };

    const addBranch = () => {
        if (!newBranch.name) return;
        setSettings(prev => ({
            ...prev,
            branches: [...prev.branches, { id: Date.now(), ...newBranch }]
        }));
        setNewBranch({ name: '', address: '' });
    };

    const deleteBranch = (id) => {
        setSettings(prev => ({
            ...prev,
            branches: prev.branches.filter(b => b.id !== id)
        }));
    };

    const addHoliday = () => {
        if (!newHoliday.date || !newHoliday.name) return;
        setSettings(prev => ({
            ...prev,
            holidays: [
                ...prev.holidays,
                { id: Date.now(), ...newHoliday }
            ].sort((a, b) => new Date(a.date) - new Date(b.date))
        }));
        setNewHoliday({ date: '', name: '', scope: 'global' });
    };

    const deleteHoliday = (id) => {
        setSettings(prev => ({
            ...prev,
            holidays: prev.holidays.filter(h => h.id !== id)
        }));
    };

    const getBranchName = (id) => {
        const branch = settings.branches.find(b => b.id.toString() === id.toString());
        return branch ? branch.name : 'Desconocida';
    };

    return (
        <div className="admin-settings-page">
            <header className="page-header">
                <div>
                    <h1>Configuración</h1>
                    <p className="text-muted">Administra los parámetros globales y sucursales</p>
                </div>
                <Button onClick={handleSave} disabled={isSaving} icon={isSaving ? undefined : Save}>
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
            </header>

            {/* Tabs */}
            <div className="settings-tabs">
                <button
                    className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveTab('general')}
                >
                    <Building2 size={16} className="inline mr-2" /> General
                </button>
                <button
                    className={`tab-button ${activeTab === 'branches' ? 'active' : ''}`}
                    onClick={() => setActiveTab('branches')}
                >
                    <Store size={16} className="inline mr-2" /> Sucursales
                </button>
                <button
                    className={`tab-button ${activeTab === 'rules' ? 'active' : ''}`}
                    onClick={() => setActiveTab('rules')}
                >
                    <MapPin size={16} className="inline mr-2" /> Control Horario
                </button>
                <button
                    className={`tab-button ${activeTab === 'calendar' ? 'active' : ''}`}
                    onClick={() => setActiveTab('calendar')}
                >
                    <Calendar size={16} className="inline mr-2" /> Calendario
                </button>
            </div>

            {/* Content */}
            <div className="settings-content">

                {/* GENERAL TAB */}
                {activeTab === 'general' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2 className="section-title">Perfil de Empresa</h2>
                            <p className="section-description">Información fiscal y de contacto de la organización.</p>
                        </div>
                        <Card>
                            <div className="settings-grid">
                                <div className="settings-group">
                                    <label className="settings-label">Nombre de la Empresa</label>
                                    <Input
                                        value={settings.company.name}
                                        onChange={(e) => handleCompanyChange('name', e.target.value)}
                                    />
                                </div>
                                <div className="settings-group">
                                    <label className="settings-label">CIF / NIF</label>
                                    <Input
                                        value={settings.company.cif}
                                        onChange={(e) => handleCompanyChange('cif', e.target.value)}
                                    />
                                </div>
                                <div className="settings-group">
                                    <label className="settings-label">Dirección Fiscal</label>
                                    <Input
                                        value={settings.company.address}
                                        onChange={(e) => handleCompanyChange('address', e.target.value)}
                                    />
                                </div>
                                <div className="settings-group">
                                    <label className="settings-label">Email de Contacto</label>
                                    <Input
                                        type="email"
                                        value={settings.company.email}
                                        onChange={(e) => handleCompanyChange('email', e.target.value)}
                                    />
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* BRANCHES TAB */}
                {activeTab === 'branches' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2 className="section-title">Gestión de Sucursales</h2>
                            <p className="section-description">Define las sedes de la empresa para asignar empleados y festivos locales.</p>
                        </div>
                        <Card className="max-w-2xl">
                            <div className="add-holiday-form">
                                <Input
                                    placeholder="Nombre Sucursal (Ej: Madrid Norte)"
                                    className="flex-1"
                                    value={newBranch.name}
                                    onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                                />
                                <Input
                                    placeholder="Ubicación"
                                    className="flex-1"
                                    value={newBranch.address}
                                    onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                                />
                                <Button onClick={addBranch} disabled={!newBranch.name}>
                                    <Plus size={18} />
                                </Button>
                            </div>

                            <div className="holiday-list mt-4">
                                {settings.branches.map(branch => (
                                    <div key={branch.id} className="holiday-item">
                                        <div className="flex flex-col">
                                            <span className="font-medium">{branch.name}</span>
                                            <span className="text-xs text-muted">{branch.address}</span>
                                        </div>
                                        <button
                                            className="text-text-muted hover:text-danger p-1 transition-colors"
                                            onClick={() => deleteBranch(branch.id)}
                                            title="Eliminar sucursal"
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* RULES TAB */}
                {activeTab === 'rules' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2 className="section-title">Reglas de Fichaje</h2>
                            <p className="section-description">Configura la geolocalización y tolerancias de tiempo.</p>
                        </div>
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card title="Geolocalización Global">
                                <div className="settings-group">
                                    <label className="settings-label">Radio Permitido (metros)</label>
                                    <Input
                                        type="number"
                                        value={settings.rules.geoFenceRadius}
                                        onChange={(e) => handleRuleChange('geoFenceRadius', e.target.value)}
                                    />
                                    <p className="settings-help">Distancia máxima desde el centro de trabajo.</p>
                                </div>
                                <div className="mt-4">
                                    <label className="settings-label mb-2">Ubicación Central (Default)</label>
                                    <div className="location-preview">
                                        <div className="flex flex-col items-center gap-2 z-10">
                                            <MapPin size={32} className="map-marker" />
                                            <span className="text-xs font-mono">
                                                {settings.rules.latitude.toFixed(4)}, {settings.rules.longitude.toFixed(4)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <Card title="Tolerancia y Pausas">
                                <div className="settings-group">
                                    <label className="settings-label">Cortesía de Entrada (minutos)</label>
                                    <div className="flex items-center gap-2">
                                        <Clock size={16} className="text-muted" />
                                        <Input
                                            type="number"
                                            value={settings.rules.courtesyMinutes}
                                            onChange={(e) => handleRuleChange('courtesyMinutes', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </Card>

                            <Card title="Horario Laboral General">
                                <div className="settings-group">
                                    <label className="settings-label">Hora de Inicio</label>
                                    <Input
                                        type="time"
                                        value={settings.work_schedule?.start}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            work_schedule: { ...settings.work_schedule, start: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="settings-group mt-2">
                                    <label className="settings-label">Hora de Fin</label>
                                    <Input
                                        type="time"
                                        value={settings.work_schedule?.end}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            work_schedule: { ...settings.work_schedule, end: e.target.value }
                                        })}
                                    />
                                </div>
                                <p className="settings-help mt-2">
                                    Este horario se aplicará a todos los empleados que no tengan un horario personalizado.
                                </p>
                            </Card>
                        </div>
                    </div>
                )}

                {/* CALENDAR TAB */}
                {activeTab === 'calendar' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2 className="section-title">Calendario Laboral</h2>
                            <p className="section-description">Festivos nacionales (Globales) y locales (por Sucursal).</p>
                        </div>
                        <Card className="max-w-3xl">
                            <div className="add-holiday-form">
                                <Input
                                    type="date"
                                    value={newHoliday.date}
                                    onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                />
                                <Input
                                    placeholder="Nombre del festivo"
                                    value={newHoliday.name}
                                    onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                                />
                                <div className="input-wrapper input-full">
                                    <div className="input-container">
                                        <select
                                            className="input-field"
                                            style={{ appearance: 'none' }}
                                            value={newHoliday.scope}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, scope: e.target.value })}
                                        >
                                            <option value="global">🌍 Global (Todas)</option>
                                            {settings.branches.map(b => (
                                                <option key={b.id} value={b.id}>📍 {b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <Button variant="primary" onClick={addHoliday} disabled={!newHoliday.date || !newHoliday.name}>
                                    <Plus size={18} />
                                </Button>
                            </div>

                            <div className="holiday-list">
                                {settings.holidays.length > 0 ? (
                                    settings.holidays.map(holiday => (
                                        <div key={holiday.id} className="holiday-item">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className="holiday-name font-semibold text-lg">{holiday.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="holiday-date-badge">
                                                            {new Date(holiday.date).toLocaleDateString()}
                                                        </span>
                                                        <span className="text-xs text-muted flex items-center gap-1">
                                                            {holiday.scope === 'global'
                                                                ? <>🌍 Nacional / Global</>
                                                                : <>📍 Solo en {getBranchName(holiday.scope)}</>
                                                            }
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                className="text-text-muted hover:text-danger p-1 transition-colors"
                                                onClick={() => deleteHoliday(holiday.id)}
                                                title="Eliminar festivo"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-muted">
                                        No hay festivos configurados
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                )}

            </div>
        </div >
    );
};

export default AdminSettingsPage;
