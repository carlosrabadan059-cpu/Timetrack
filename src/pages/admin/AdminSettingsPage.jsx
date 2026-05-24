import { useState, useEffect, useRef } from 'react';
import {
    Building2,
    MapPin,
    Clock,
    Calendar,
    Save,
    Trash,
    Plus,
    Pencil,
    X,
    Store,
    Globe,
    Smartphone,
    Wifi,
    Eye,
    EyeOff,
    CheckCircle,
    XCircle,
    Loader,
    Download,
    Users,
    Key,
    Copy,
    AlertTriangle,
    Sun,
    Moon,
    Monitor,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, Button, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';

// Fix leaflet default marker icons broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapCenterUpdater({ lat, lng }) {
    const map = useMap();
    useEffect(() => { map.setView([lat, lng], map.getZoom()); }, [lat, lng, map]);
    return null;
}

function MapClickHandler({ onLocationChange }) {
    useMapEvents({
        click(e) { onLocationChange(e.latlng.lat, e.latlng.lng); },
    });
    return null;
}
import './AdminSettingsPage.css';

const DEFAULT_CLOCKING_MODES = {
    web: true,
    mobile: true,
    twoN: { enabled: false, type: null, ac_base_url: '', ac_api_token: '', device_webhook_secret: null },
};

const DEFAULT_SETTINGS = {
    company: { name: '', cif: '', address: '', email: '' },
    branches: [],
    rules: { geoFenceRadius: 100, courtesyMinutes: 15, latitude: 40.4168, longitude: -3.7038, flexibleScheduleEnabled: false, flexibleScheduleMinutes: 15 },
    work_schedule: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
    holidays: [],
    clocking_modes: DEFAULT_CLOCKING_MODES,
};

const AdminSettingsPage = () => {
    const [activeTab, setActiveTab] = useState('general');
    const { theme, setTheme } = useTheme();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'ok' | 'error'
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);

    // Forms State
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '', scope: 'global', type: 'nacional' });
    const [editingHoliday, setEditingHoliday] = useState(null); // { id, date, name, scope, type }
    const [newBranch, setNewBranch] = useState({ name: '', address: '' });
    const [showAcToken, setShowAcToken] = useState(false);
    const [acTestStatus, setAcTestStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
    const [acTestMessage, setAcTestMessage] = useState('');
    const [acImportStatus, setAcImportStatus] = useState(null); // null | 'importing' | { total_in_ac, created, linked, skipped } | 'error'
    const [acImportMessage, setAcImportMessage] = useState('');

    // API Keys state
    const [apiKeys, setApiKeys] = useState([]);
    const [apiKeysLoading, setApiKeysLoading] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyExpires, setNewKeyExpires] = useState('');
    const [creatingKey, setCreatingKey] = useState(false);
    const [revealedKey, setRevealedKey] = useState(null); // { id, api_key, name }
    const [copyDone, setCopyDone] = useState(false);

    const loadApiKeys = async () => {
        setApiKeysLoading(true);
        try {
            const res = await api.get('/api/admin/api-keys');
            setApiKeys(res.data.data ?? []);
        } catch {
            setApiKeys([]);
        } finally {
            setApiKeysLoading(false);
        }
    };

    const createApiKey = async () => {
        if (!newKeyName.trim()) return;
        setCreatingKey(true);
        try {
            const body = { name: newKeyName.trim() };
            if (newKeyExpires) body.expires_at = new Date(newKeyExpires).toISOString();
            const res = await api.post('/api/admin/api-keys', body);
            const created = res.data.data;
            setRevealedKey({ id: created.id, api_key: created.api_key, name: created.name });
            setNewKeyName('');
            setNewKeyExpires('');
            loadApiKeys();
        } catch {
            // error handled by api interceptor
        } finally {
            setCreatingKey(false);
        }
    };

    const revokeApiKey = async (id) => {
        if (!window.confirm('¿Revocar esta API Key? Los sistemas que la usen dejarán de funcionar.')) return;
        try {
            await api.delete(`/api/admin/api-keys/${id}`);
            setApiKeys(prev => prev.filter(k => k.id !== id));
        } catch {
            // error handled by api interceptor
        }
    };

    const copyKey = () => {
        if (!revealedKey) return;
        navigator.clipboard.writeText(revealedKey.api_key).then(() => {
            setCopyDone(true);
            setTimeout(() => setCopyDone(false), 2000);
        });
    };

    useEffect(() => {
        api.get('/api/admin/settings')
            .then(res => setSettings({ ...DEFAULT_SETTINGS, ...res.data }))
            .catch(() => setSettings(DEFAULT_SETTINGS))
            .finally(() => setIsLoading(false));
    }, []);

    // Handlers
    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus(null);
        try {
            await api.patch('/api/admin/settings', settings);
            setSaveStatus('ok');
            setTimeout(() => setSaveStatus(null), 3000);
        } catch {
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
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
            rules: { ...prev.rules, [field]: typeof value === 'boolean' ? value : (parseFloat(value) || value) }
        }));
    };

    const handleModesChange = (patch) => {
        setSettings(prev => ({
            ...prev,
            clocking_modes: { ...prev.clocking_modes, ...patch },
        }));
    };

    const handleTwoNChange = (patch) => {
        setSettings(prev => ({
            ...prev,
            clocking_modes: {
                ...prev.clocking_modes,
                twoN: { ...prev.clocking_modes.twoN, ...patch },
            },
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
        setNewHoliday({ date: '', name: '', scope: 'global', type: 'nacional' });
    };

    const deleteHoliday = (id) => {
        setSettings(prev => ({
            ...prev,
            holidays: prev.holidays.filter(h => h.id !== id)
        }));
    };

    const updateHoliday = () => {
        if (!editingHoliday?.date || !editingHoliday?.name) return;
        setSettings(prev => ({
            ...prev,
            holidays: prev.holidays
                .map(h => h.id === editingHoliday.id ? { ...editingHoliday } : h)
                .sort((a, b) => new Date(a.date) - new Date(b.date)),
        }));
        setEditingHoliday(null);
    };

    const handleTestAc = async () => {
        setAcTestStatus('testing');
        setAcTestMessage('');
        try {
            const res = await api.post('/api/admin/settings/test-ac', {
                ac_base_url: settings.clocking_modes.twoN.ac_base_url,
                ac_api_token: settings.clocking_modes.twoN.ac_api_token,
            });
            setAcTestStatus('ok');
            setAcTestMessage(res.data.message ?? 'Conexión establecida correctamente');
        } catch (err) {
            setAcTestStatus('error');
            setAcTestMessage(err?.response?.data?.error?.message ?? err?.message ?? 'Error de conexión');
        }
    };

    const handleImportFromAc = async () => {
        setAcImportStatus('importing');
        setAcImportMessage('');
        try {
            const res = await api.post('/api/admin/settings/import-from-ac', {});
            setAcImportStatus(res.data);
            if (res.data?.company_name) {
                setSettings(prev => ({
                    ...prev,
                    company: { ...prev.company, name: res.data.company_name },
                }));
            }
        } catch (err) {
            setAcImportStatus('error');
            setAcImportMessage(err?.response?.data?.error?.message ?? err?.message ?? 'Error al importar');
        }
    };

    const getBranchName = (id) => {
        const branch = settings.branches.find(b => b.id.toString() === id.toString());
        return branch ? branch.name : 'Desconocida';
    };

    if (isLoading) {
        return (
            <div className="admin-settings-page">
                <div className="flex items-center justify-center py-20 text-muted">Cargando configuración...</div>
            </div>
        );
    }

    return (
        <div className="admin-settings-page">
            <header className="page-header">
                <div>
                    <h1>Configuración</h1>
                    <p className="text-muted">Administra los parámetros globales y sucursales</p>
                </div>
                <div className="flex items-center gap-3">
                    {saveStatus === 'ok' && <span className="text-sm text-success">✓ Guardado</span>}
                    {saveStatus === 'error' && <span className="text-sm text-danger">Error al guardar</span>}
                    <Button onClick={handleSave} disabled={isSaving} icon={isSaving ? undefined : Save}>
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </Button>
                </div>
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
                    className={`tab-button ${activeTab === 'modos' ? 'active' : ''}`}
                    onClick={() => setActiveTab('modos')}
                >
                    <Wifi size={16} className="inline mr-2" /> Modos de Fichaje
                </button>
                <button
                    className={`tab-button ${activeTab === 'calendar' ? 'active' : ''}`}
                    onClick={() => setActiveTab('calendar')}
                >
                    <Calendar size={16} className="inline mr-2" /> Calendario
                </button>
                <button
                    className={`tab-button ${activeTab === 'apikeys' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('apikeys'); loadApiKeys(); }}
                >
                    <Key size={16} className="inline mr-2" /> API Keys
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
                        <Card title="Apariencia">
                            <div className="settings-item">
                                <div className="settings-icon"><Monitor size={20} /></div>
                                <div className="settings-info">
                                    <h4>Tema de la interfaz</h4>
                                    <p>Claro, oscuro o según el sistema</p>
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
                                    <div className="location-map-wrapper">
                                        <MapContainer
                                            center={[settings.rules.latitude, settings.rules.longitude]}
                                            zoom={15}
                                            scrollWheelZoom={false}
                                            style={{ height: '220px', width: '100%', borderRadius: 'var(--radius-lg)' }}
                                            className="location-map"
                                        >
                                            <TileLayer
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                            />
                                            <Marker
                                                position={[settings.rules.latitude, settings.rules.longitude]}
                                                draggable
                                                eventHandlers={{
                                                    dragend(e) {
                                                        const { lat, lng } = e.target.getLatLng();
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            rules: { ...prev.rules, latitude: lat, longitude: lng },
                                                        }));
                                                    },
                                                }}
                                            />
                                            <MapClickHandler
                                                onLocationChange={(lat, lng) =>
                                                    setSettings(prev => ({
                                                        ...prev,
                                                        rules: { ...prev.rules, latitude: lat, longitude: lng },
                                                    }))
                                                }
                                            />
                                            <MapCenterUpdater lat={settings.rules.latitude} lng={settings.rules.longitude} />
                                        </MapContainer>
                                        <span className="location-map-coords">
                                            <MapPin size={12} />
                                            {settings.rules.latitude.toFixed(4)}, {settings.rules.longitude.toFixed(4)}
                                            <span className="location-map-hint">· Haz clic en el mapa o arrastra el marcador para cambiar la ubicación</span>
                                        </span>
                                    </div>
                                </div>
                            </Card>

                            <Card title="Tolerancia y Pausas">
                                <div className="settings-group">
                                    <div className="settings-item" style={{ border: 'none', padding: 0 }}>
                                        <div className="settings-icon"><Clock size={20} /></div>
                                        <div className="settings-info">
                                            <h4>Horario Flexible (minutos)</h4>
                                            <p>Permite a los empleados fichar dentro de una ventana de tiempo</p>
                                        </div>
                                        <label className="settings-toggle">
                                            <input
                                                type="checkbox"
                                                checked={settings.rules.flexibleScheduleEnabled ?? false}
                                                onChange={(e) => handleRuleChange('flexibleScheduleEnabled', e.target.checked)}
                                            />
                                            <span className="settings-toggle-slider" />
                                        </label>
                                    </div>

                                    {settings.rules.flexibleScheduleEnabled && (
                                        <div className="mt-3">
                                            <label className="settings-label">Minutos de flexibilidad (máx. 60)</label>
                                            <div className="flex items-center gap-2">
                                                <Clock size={16} className="text-muted" />
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={60}
                                                    value={settings.rules.flexibleScheduleMinutes ?? 15}
                                                    onChange={(e) => {
                                                        const v = Math.min(60, Math.max(0, parseInt(e.target.value) || 0));
                                                        handleRuleChange('flexibleScheduleMinutes', v);
                                                    }}
                                                />
                                            </div>
                                            <p className="settings-help">
                                                Los empleados podrán fichar hasta {settings.rules.flexibleScheduleMinutes ?? 15} minutos fuera del horario establecido sin incidencia.
                                            </p>
                                        </div>
                                    )}
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

                {/* MODOS DE FICHAJE TAB */}
                {activeTab === 'modos' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2 className="section-title">Modos de Fichaje</h2>
                            <p className="section-description">Configura qué métodos de fichaje están habilitados para tu empresa.</p>
                        </div>
                        <Card className="max-w-2xl">
                            <div className="modes-list">
                                {/* Web */}
                                <div className="mode-row">
                                    <div className="mode-row-info">
                                        <Globe size={20} className="mode-icon" />
                                        <div>
                                            <div className="mode-row-title">Fichaje Web</div>
                                            <div className="mode-row-desc">Botón en la app del navegador</div>
                                        </div>
                                    </div>
                                    <label className="settings-toggle">
                                        <input
                                            type="checkbox"
                                            checked={settings.clocking_modes?.web ?? true}
                                            onChange={e => handleModesChange({ web: e.target.checked })}
                                        />
                                        <span className="settings-toggle-slider" />
                                    </label>
                                </div>

                                {/* Mobile */}
                                <div className="mode-row">
                                    <div className="mode-row-info">
                                        <Smartphone size={20} className="mode-icon" />
                                        <div>
                                            <div className="mode-row-title">Fichaje Móvil</div>
                                            <div className="mode-row-desc">App iOS / Android con GPS opcional</div>
                                        </div>
                                    </div>
                                    <label className="settings-toggle">
                                        <input
                                            type="checkbox"
                                            checked={settings.clocking_modes?.mobile ?? true}
                                            onChange={e => handleModesChange({ mobile: e.target.checked })}
                                        />
                                        <span className="settings-toggle-slider" />
                                    </label>
                                </div>

                                {/* 2N */}
                                <div className="mode-row">
                                    <div className="mode-row-info">
                                        <Wifi size={20} className="mode-icon" />
                                        <div>
                                            <div className="mode-row-title">Lectores 2N</div>
                                            <div className="mode-row-desc">Integración con dispositivos físicos 2N</div>
                                        </div>
                                    </div>
                                    <label className="settings-toggle">
                                        <input
                                            type="checkbox"
                                            checked={settings.clocking_modes?.twoN?.enabled ?? false}
                                            onChange={e => handleTwoNChange({ enabled: e.target.checked, type: e.target.checked ? (settings.clocking_modes?.twoN?.type ?? null) : null })}
                                        />
                                        <span className="settings-toggle-slider" />
                                    </label>
                                </div>

                                {settings.clocking_modes?.twoN?.enabled && (
                                    <div className="twoN-settings">
                                        <div className="settings-group">
                                            <label className="settings-label">Tipo de integración</label>
                                            <div className="radio-row">
                                                <label className="radio-pill">
                                                    <input
                                                        type="radio"
                                                        name="twoN-type-settings"
                                                        value="ac"
                                                        checked={settings.clocking_modes.twoN.type === 'ac'}
                                                        onChange={() => handleTwoNChange({ type: 'ac' })}
                                                    />
                                                    2N Access Commander
                                                </label>
                                                <label className="radio-pill">
                                                    <input
                                                        type="radio"
                                                        name="twoN-type-settings"
                                                        value="device"
                                                        checked={settings.clocking_modes.twoN.type === 'device'}
                                                        onChange={() => handleTwoNChange({ type: 'device' })}
                                                    />
                                                    Dispositivo Directo
                                                </label>
                                            </div>
                                        </div>

                                        {settings.clocking_modes.twoN.type === 'ac' && (
                                            <>
                                                <div className="settings-group">
                                                    <label className="settings-label">URL del Access Commander</label>
                                                    <Input
                                                        value={settings.clocking_modes.twoN.ac_base_url ?? ''}
                                                        onChange={e => handleTwoNChange({ ac_base_url: e.target.value })}
                                                        placeholder="https://192.168.1.1"
                                                    />
                                                </div>
                                                <div className="settings-group">
                                                    <label className="settings-label">API Token</label>
                                                    <div className="input-token-row">
                                                        <Input
                                                            type={showAcToken ? 'text' : 'password'}
                                                            value={settings.clocking_modes.twoN.ac_api_token ?? ''}
                                                            onChange={e => { handleTwoNChange({ ac_api_token: e.target.value }); setAcTestStatus(null); }}
                                                            placeholder="Token de 2N AC"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="token-toggle-btn"
                                                            onClick={() => setShowAcToken(v => !v)}
                                                        >
                                                            {showAcToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                    </div>
                                                    <p className="settings-help">El token se guarda cifrado. Introduce uno nuevo para actualizarlo.</p>
                                                </div>

                                                <div className="ac-test-row">
                                                    <button
                                                        type="button"
                                                        className="ac-test-btn"
                                                        onClick={handleTestAc}
                                                        disabled={acTestStatus === 'testing' || !settings.clocking_modes.twoN.ac_base_url || !settings.clocking_modes.twoN.ac_api_token}
                                                    >
                                                        {acTestStatus === 'testing'
                                                            ? <><Loader size={14} className="spin" /> Probando...</>
                                                            : 'Probar conexión'}
                                                    </button>
                                                    {acTestStatus === 'ok' && (
                                                        <span className="ac-test-result ac-test-ok">
                                                            <CheckCircle size={14} /> {acTestMessage}
                                                        </span>
                                                    )}
                                                    {acTestStatus === 'error' && (
                                                        <span className="ac-test-result ac-test-error">
                                                            <XCircle size={14} /> {acTestMessage}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="ac-import-section">
                                                    <div className="ac-import-row">
                                                        <button
                                                            type="button"
                                                            className="ac-import-btn"
                                                            onClick={handleImportFromAc}
                                                            disabled={acImportStatus === 'importing' || !settings.clocking_modes.twoN.ac_base_url}
                                                        >
                                                            {acImportStatus === 'importing'
                                                                ? <><Loader size={14} className="spin" /> Importando usuarios...</>
                                                                : <><Download size={14} /> Importar usuarios desde 2N AC</>}
                                                        </button>
                                                        <p className="settings-help" style={{ margin: 0 }}>
                                                            Crea o vincula automáticamente los empleados registrados en el Access Commander.
                                                        </p>
                                                    </div>
                                                    {acImportStatus && acImportStatus !== 'importing' && acImportStatus !== 'error' && (
                                                        <div className="ac-import-result">
                                                            <Users size={14} />
                                                            <span>
                                                                <strong>{acImportStatus.total_in_ac}</strong> usuarios en AC —{' '}
                                                                <strong className="text-success">{acImportStatus.created} creados</strong>,{' '}
                                                                <strong>{acImportStatus.linked} vinculados</strong>,{' '}
                                                                {acImportStatus.skipped} ya sincronizados
                                                                {acImportStatus.errors?.length > 0 && (
                                                                    <span className="ac-import-errors">
                                                                        {' '}· {acImportStatus.errors.length} error(es)
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {acImportStatus === 'error' && (
                                                        <span className="ac-test-result ac-test-error">
                                                            <XCircle size={14} /> {acImportMessage}
                                                        </span>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {settings.clocking_modes.twoN.type === 'device' && (
                                            <div className="device-webhook-info">
                                                <p className="settings-label">URL del webhook para dispositivos</p>
                                                <code className="webhook-url">
                                                    {`${window.location.origin.replace('5173', '3000')}/webhooks/2n-device/[company-id]`}
                                                </code>
                                                <p className="settings-help">Configura esta URL en el dispositivo 2N junto con el secreto. El secreto se genera automáticamente.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card>
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
                                <div className="input-wrapper">
                                    <div className="input-container">
                                        <select
                                            className="input-field"
                                            style={{ appearance: 'none' }}
                                            value={newHoliday.type}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, type: e.target.value })}
                                        >
                                            <option value="nacional">🇪🇸 Nacional</option>
                                            <option value="autonomico">🏛️ Autonómico</option>
                                            <option value="local">📍 Local</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="input-wrapper">
                                    <div className="input-container">
                                        <select
                                            className="input-field"
                                            style={{ appearance: 'none' }}
                                            value={newHoliday.scope}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, scope: e.target.value })}
                                        >
                                            <option value="global">🌍 Global (Todas)</option>
                                            {settings.branches.map(b => (
                                                <option key={b.id} value={b.id}>🏢 {b.name}</option>
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
                                        editingHoliday?.id === holiday.id ? (
                                            <div key={holiday.id} className="holiday-item holiday-item-editing">
                                                <div className="holiday-edit-form">
                                                    <input
                                                        type="date"
                                                        className="input-field"
                                                        value={editingHoliday.date}
                                                        onChange={e => setEditingHoliday({ ...editingHoliday, date: e.target.value })}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input-field"
                                                        placeholder="Nombre del festivo"
                                                        value={editingHoliday.name}
                                                        onChange={e => setEditingHoliday({ ...editingHoliday, name: e.target.value })}
                                                    />
                                                    <select
                                                        className="input-field"
                                                        value={editingHoliday.type}
                                                        onChange={e => setEditingHoliday({ ...editingHoliday, type: e.target.value })}
                                                    >
                                                        <option value="nacional">🇪🇸 Nacional</option>
                                                        <option value="autonomico">🏛️ Autonómico</option>
                                                        <option value="local">📍 Local</option>
                                                    </select>
                                                    <select
                                                        className="input-field"
                                                        value={editingHoliday.scope}
                                                        onChange={e => setEditingHoliday({ ...editingHoliday, scope: e.target.value })}
                                                    >
                                                        <option value="global">🌍 Global (Todas)</option>
                                                        {settings.branches.map(b => (
                                                            <option key={b.id} value={b.id}>🏢 {b.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="holiday-edit-actions">
                                                    <button className="holiday-action-btn save" onClick={updateHoliday} title="Guardar">
                                                        <Save size={15} />
                                                    </button>
                                                    <button className="holiday-action-btn cancel" onClick={() => setEditingHoliday(null)} title="Cancelar">
                                                        <X size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                        <div key={holiday.id} className="holiday-item">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className="holiday-name font-semibold text-lg">{holiday.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="holiday-date-badge">
                                                            {new Date(holiday.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                        <span className={`holiday-type-badge holiday-type-${holiday.type ?? 'nacional'}`}>
                                                            {holiday.type === 'autonomico' ? '🏛️ Autonómico'
                                                             : holiday.type === 'local'    ? '📍 Local'
                                                             :                              '🇪🇸 Nacional'}
                                                        </span>
                                                        {holiday.scope !== 'global' && (
                                                            <span className="text-xs text-muted">· {getBranchName(holiday.scope)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="holiday-row-actions">
                                                <button
                                                    className="holiday-action-btn edit"
                                                    onClick={() => setEditingHoliday({ ...holiday })}
                                                    title="Editar festivo"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    className="holiday-action-btn delete"
                                                    onClick={() => deleteHoliday(holiday.id)}
                                                    title="Eliminar festivo"
                                                >
                                                    <Trash size={15} />
                                                </button>
                                            </div>
                                        </div>
                                        )
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

                {/* API KEYS TAB */}
                {activeTab === 'apikeys' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2 className="section-title">API Keys</h2>
                            <p className="section-description">Claves para integración M2M con ERPs, nóminas u otras plataformas. Cada clave solo se muestra una vez al crearla.</p>
                        </div>

                        {/* Revealed key banner */}
                        {revealedKey && (
                            <div className="apikey-revealed-banner">
                                <div className="apikey-revealed-header">
                                    <AlertTriangle size={16} className="text-warning" />
                                    <span>Copia la clave ahora — no podrás verla de nuevo</span>
                                    <button className="apikey-revealed-close" onClick={() => setRevealedKey(null)}>✕</button>
                                </div>
                                <div className="apikey-revealed-row">
                                    <code className="apikey-revealed-value">{revealedKey.api_key}</code>
                                    <button className="apikey-copy-btn" onClick={copyKey}>
                                        {copyDone ? <CheckCircle size={16} className="text-success" /> : <Copy size={16} />}
                                        {copyDone ? 'Copiado' : 'Copiar'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Create form */}
                        <Card className="max-w-2xl" style={{ marginBottom: 'var(--space-6)' }}>
                            <h3 className="font-semibold text-base mb-4">Nueva API Key</h3>
                            <div className="settings-grid" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                                <Input
                                    placeholder="Nombre identificativo (ej. SAP, Nóminas)"
                                    value={newKeyName}
                                    onChange={e => setNewKeyName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && createApiKey()}
                                />
                                <Input
                                    type="date"
                                    title="Fecha de expiración (opcional)"
                                    value={newKeyExpires}
                                    onChange={e => setNewKeyExpires(e.target.value)}
                                />
                                <Button
                                    variant="primary"
                                    onClick={createApiKey}
                                    disabled={creatingKey || !newKeyName.trim()}
                                    icon={creatingKey ? undefined : Plus}
                                >
                                    {creatingKey ? 'Creando...' : 'Crear'}
                                </Button>
                            </div>
                        </Card>

                        {/* Keys list */}
                        <Card className="max-w-2xl">
                            {apiKeysLoading ? (
                                <div className="flex items-center justify-center py-8 gap-2 text-muted">
                                    <Loader size={18} className="animate-spin" /> Cargando...
                                </div>
                            ) : apiKeys.length === 0 ? (
                                <div className="text-center py-8 text-muted">
                                    <Key size={32} className="mx-auto mb-2 opacity-30" />
                                    <p>No hay API Keys creadas</p>
                                </div>
                            ) : (
                                <div className="apikey-list">
                                    {apiKeys.map(k => {
                                        const expired = k.expires_at && new Date(k.expires_at) < new Date();
                                        return (
                                            <div key={k.id} className="apikey-item">
                                                <div className="apikey-info">
                                                    <span className="apikey-name">{k.name}</span>
                                                    <div className="apikey-meta">
                                                        <code className="apikey-prefix">{k.key_prefix}…</code>
                                                        <span className="text-xs text-muted">
                                                            Creada {new Date(k.created_at).toLocaleDateString()}
                                                        </span>
                                                        {k.expires_at && (
                                                            <span className={`text-xs ${expired ? 'text-danger' : 'text-muted'}`}>
                                                                {expired ? 'Expirada' : `Expira ${new Date(k.expires_at).toLocaleDateString()}`}
                                                            </span>
                                                        )}
                                                        <span className={`apikey-badge ${k.is_active && !expired ? 'active' : 'inactive'}`}>
                                                            {k.is_active && !expired ? 'Activa' : 'Inactiva'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    className="text-text-muted hover:text-danger p-1 transition-colors"
                                                    onClick={() => revokeApiKey(k.id)}
                                                    title="Revocar clave"
                                                >
                                                    <Trash size={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>
                )}

            </div>
        </div >
    );
};

export default AdminSettingsPage;
