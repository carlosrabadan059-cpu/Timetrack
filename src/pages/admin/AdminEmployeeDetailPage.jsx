import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, User, Mail, Hash, Shield, Clock, Calendar,
    CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { api } from '../../lib/api';
import './AdminEmployeeDetailPage.css';

const ROLE_LABELS = { admin: 'Administrador', manager: 'Manager', employee: 'Empleado' };
const STATUS_LABELS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
const STATUS_CLS   = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
const TYPE_LABELS  = { olvido: 'Olvido', correccion: 'Corrección', ausencia: 'Ausencia', hora_extra: 'Hora extra' };

const SOURCE_LABELS = {
    web:        { icon: '🖥', label: 'App Web' },
    mobile:     { icon: '📱', label: 'App Móvil' },
    signalr:    { icon: '🔒', label: 'Lector 2N' },
    correction: { icon: '✏️', label: 'Corrección' },
};

function fmtDateTime(ts) {
    if (!ts) return '–';
    return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name[0] ?? 'U').toUpperCase();
}

// ── Tab: Información ──────────────────────────────────────────────────────────
function TabInfo({ profile }) {
    if (!profile) return null;
    const rows = [
        { icon: User,        label: 'Nombre',        value: profile.full_name },
        { icon: Mail,        label: 'Email',          value: profile.email },
        { icon: Hash,        label: 'Código',         value: profile.employee_code ?? '–' },
        { icon: Shield,      label: 'Rol',            value: ROLE_LABELS[profile.role] ?? profile.role },
        { icon: CheckCircle, label: 'Sync 2N',        value: profile.ac_synced ? 'Sincronizado' : 'Pendiente' },
        { icon: Clock,       label: 'Último acceso',  value: fmtDateTime(profile.last_access?.timestamp) },
        { icon: Calendar,    label: 'Alta en sistema', value: fmtDate(profile.created_at) },
    ];
    return (
        <div className="detail-info-grid">
            {rows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="detail-info-row">
                    <div className="detail-info-icon"><Icon size={16} /></div>
                    <span className="detail-info-label">{label}</span>
                    <span className="detail-info-value">{value}</span>
                </div>
            ))}
        </div>
    );
}

// ── Tab: Fichajes ─────────────────────────────────────────────────────────────
function TabFichajes({ userId }) {
    const [items, setItems]   = useState([]);
    const [total, setTotal]   = useState(0);
    const [page, setPage]     = useState(1);
    const [loading, setLoading] = useState(true);
    const LIMIT = 20;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/admin/access-logs', { user_id: userId, page, limit: LIMIT });
            setItems(res.data ?? []);
            setTotal(res.meta?.total ?? 0);
        } catch { /* keep */ } finally { setLoading(false); }
    }, [userId, page]);

    useEffect(() => { load(); }, [load]);

    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    return (
        <div>
            <Card padding="none">
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Fecha y hora</th>
                                <th>Tipo</th>
                                <th>Detalle</th>
                                <th>Origen</th>
                                <th>GPS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="table-empty">Cargando...</td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={5} className="table-empty">Sin fichajes</td></tr>
                            ) : items.map((f) => {
                                const src = SOURCE_LABELS[f.source] ?? { icon: '?', label: f.source };
                                return (
                                    <tr key={f.id}>
                                        <td><strong>{fmtDateTime(f.timestamp)}</strong></td>
                                        <td>
                                            <span className={`type-badge ${f.direction === 'in' ? 'check_in' : 'check_out'}`}>
                                                {f.direction === 'in' ? 'Entrada' : 'Salida'}
                                            </span>
                                        </td>
                                        <td className="text-muted">{f.detail_type ?? '–'}</td>
                                        <td>
                                            <span className="source-inline">{src.icon} {src.label}</span>
                                        </td>
                                        <td>{f.has_gps ? <CheckCircle size={14} color="var(--color-success)" /> : <span className="text-muted">–</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            {totalPages > 1 && (
                <div className="pagination">
                    <Button variant="ghost" icon={ChevronLeft} onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-icon-only" />
                    <span className="pagination-info">Página {page} de {totalPages}</span>
                    <Button variant="ghost" icon={ChevronRight} onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="btn-icon-only" />
                </div>
            )}
        </div>
    );
}

// ── Tab: Incidencias ──────────────────────────────────────────────────────────
function TabIncidencias({ userId }) {
    const [items, setItems]   = useState([]);
    const [total, setTotal]   = useState(0);
    const [page, setPage]     = useState(1);
    const [loading, setLoading] = useState(true);
    const LIMIT = 20;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/admin/incidencias', { user_id: userId, page, limit: LIMIT });
            setItems(res.data?.items ?? []);
            setTotal(res.data?.total ?? 0);
        } catch { /* keep */ } finally { setLoading(false); }
    }, [userId, page]);

    useEffect(() => { load(); }, [load]);

    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    return (
        <div>
            <Card padding="none">
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Estado</th>
                                <th>Motivo</th>
                                <th>Solicitada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="table-empty">Cargando...</td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={5} className="table-empty">Sin incidencias</td></tr>
                            ) : items.map((inc) => (
                                <tr key={inc.id}>
                                    <td><strong>{fmtDate(inc.date)}</strong></td>
                                    <td className="text-muted">{TYPE_LABELS[inc.type] ?? inc.type}</td>
                                    <td>
                                        <span className={`badge ${STATUS_CLS[inc.status] ?? 'badge-neutral'}`}>
                                            {STATUS_LABELS[inc.status] ?? inc.status}
                                        </span>
                                    </td>
                                    <td className="text-muted reason-cell">{inc.reason ?? '–'}</td>
                                    <td className="text-muted">{fmtDate(inc.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
            {totalPages > 1 && (
                <div className="pagination">
                    <Button variant="ghost" icon={ChevronLeft} onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-icon-only" />
                    <span className="pagination-info">Página {page} de {totalPages}</span>
                    <Button variant="ghost" icon={ChevronRight} onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="btn-icon-only" />
                </div>
            )}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
    { id: 'info',        label: 'Información' },
    { id: 'fichajes',    label: 'Fichajes' },
    { id: 'incidencias', label: 'Incidencias' },
];

const AdminEmployeeDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('info');

    useEffect(() => {
        api.get(`/api/users/${id}`)
            .then(res => setProfile(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    return (
        <div className="employee-detail-page">
            <header className="employee-detail-header">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>
                    Volver
                </Button>
                {profile && (
                    <div className="employee-detail-identity">
                        <div className="employee-detail-avatar">{getInitials(profile.full_name)}</div>
                        <div>
                            <h1>{profile.full_name}</h1>
                            <span className={`role-badge ${profile.role}`}>
                                {ROLE_LABELS[profile.role] ?? profile.role}
                            </span>
                            {profile.employee_code && (
                                <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginLeft: '8px' }}>
                                    {profile.employee_code}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {loading ? (
                <div className="detail-loading">Cargando...</div>
            ) : !profile ? (
                <Card padding="lg"><p className="text-muted">Empleado no encontrado.</p></Card>
            ) : (
                <>
                    <div className="detail-tabs">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                className={`detail-tab${tab === t.id ? ' active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="detail-tab-content">
                        {tab === 'info'        && <Card padding="md"><TabInfo profile={profile} /></Card>}
                        {tab === 'fichajes'    && <TabFichajes userId={id} />}
                        {tab === 'incidencias' && <TabIncidencias userId={id} />}
                    </div>
                </>
            )}
        </div>
    );
};

export default AdminEmployeeDetailPage;
