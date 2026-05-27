import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal } from '../../components/ui';
import { api, BASE_URL } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, CalendarRange, Filter } from 'lucide-react';
import './AdminVacacionesPage.css';

const TYPE_CONFIG = {
    vacaciones:         { label: 'Vacaciones',        color: '#10B981' },
    permiso_retribuido: { label: 'Permiso retribuido', color: '#3B82F6' },
    asuntos_propios:    { label: 'Asuntos propios',    color: '#7C3AED' },
};

const STATUS_BADGE = {
    pending:  <span className="badge badge-warning">Pendiente</span>,
    approved: <span className="badge badge-success">Aprobada</span>,
    rejected: <span className="badge badge-error">Rechazada</span>,
};

function fmtDate(str) {
    if (!str) return '–';
    return new Date(str + 'T12:00:00').toLocaleDateString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function fmtCreatedAt(ts) {
    if (!ts) return '–';
    return new Date(ts).toLocaleString('es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const AdminVacacionesPage = () => {
    const [requests, setRequests] = useState([]);
    const [counts, setCounts] = useState({ pending: 0, total: 0 });
    const [filterStatus, setFilterStatus] = useState('pending');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});

    // Resolve modal
    const [resolveModal, setResolveModal] = useState(null); // { id, action: 'approved'|'rejected' }
    const [managerNote, setManagerNote] = useState('');
    const [resolveError, setResolveError] = useState('');
    const [resolving, setResolving] = useState(false);

    const loadRequests = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 50 };
            if (filterStatus !== 'all') params.status = filterStatus;
            const [mainRes, pendingRes, allRes] = await Promise.all([
                api.get('/api/vacaciones', params),
                api.get('/api/vacaciones', { status: 'pending', limit: 1 }),
                api.get('/api/vacaciones', { limit: 1 }),
            ]);
            setRequests(mainRes.data?.items ?? []);
            setCounts({
                pending: pendingRes.data?.total ?? 0,
                total: allRes.data?.total ?? 0,
            });
        } catch { /* keep */ } finally { setLoading(false); }
    }, [filterStatus]);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    // SSE: reload on vacacion events
    useEffect(() => {
        const ctrl = new AbortController();
        async function connect() {
            try {
                const { data } = await supabase.auth.getSession();
                const token = data.session?.access_token;
                if (!token) return;
                const res = await fetch(`${BASE_URL}/api/admin/live`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: ctrl.signal,
                });
                if (!res.ok || !res.body) return;
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done || ctrl.signal.aborted) break;
                    const text = decoder.decode(value);
                    const lines = text.split('\n');
                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        try {
                            const event = JSON.parse(line.slice(5).trim());
                            if (event.type === 'vacacion_event') loadRequests();
                        } catch { /* ignore */ }
                    }
                }
            } catch { /* stream ended */ }
        }
        connect();
        return () => ctrl.abort();
    }, [loadRequests]);

    const openResolve = (id, action) => {
        setResolveModal({ id, action });
        setManagerNote('');
        setResolveError('');
    };

    const handleResolve = async () => {
        if (!resolveModal) return;
        setResolving(true);
        setResolveError('');
        try {
            await api.patch(`/api/vacaciones/${resolveModal.id}`, {
                status: resolveModal.action,
                manager_note: managerNote || undefined,
            });
            setResolveModal(null);
            loadRequests();
        } catch (err) {
            setResolveError(err?.data?.error?.message ?? err?.message ?? 'Error al procesar');
        } finally {
            setResolving(false);
        }
    };

    const filtered = requests;

    return (
        <div className="admin-vacaciones-page">
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="av-header">
                <div>
                    <h1>Vacaciones y Ausencias</h1>
                    <p className="page-subtitle">Gestión de solicitudes del equipo</p>
                </div>
            </div>

            {/* ── Stats ───────────────────────────────────────────────────────── */}
            <div className="av-stats">
                <div className="av-stat">
                    <span className="av-stat-num av-stat-pending">{counts.pending}</span>
                    <span className="av-stat-lbl">Pendientes</span>
                </div>
                <div className="av-stat">
                    <span className="av-stat-num">{counts.total}</span>
                    <span className="av-stat-lbl">Total este año</span>
                </div>
            </div>

            {/* ── Filters ─────────────────────────────────────────────────────── */}
            <div className="av-filters">
                <Filter size={15} className="filter-icon" />
                {[
                    { value: 'pending',  label: 'Pendientes' },
                    { value: 'approved', label: 'Aprobadas' },
                    { value: 'rejected', label: 'Rechazadas' },
                    { value: 'all',      label: 'Todas' },
                ].map(opt => (
                    <button
                        key={opt.value}
                        className={`filter-btn${filterStatus === opt.value ? ' active' : ''}`}
                        onClick={() => setFilterStatus(opt.value)}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* ── List ────────────────────────────────────────────────────────── */}
            {loading ? (
                <div className="av-loading">Cargando...</div>
            ) : filtered.length === 0 ? (
                <Card padding="lg" className="av-empty">
                    <CalendarRange size={32} className="empty-icon" />
                    <p>No hay solicitudes {filterStatus !== 'all' ? STATUS_BADGE[filterStatus] : ''}</p>
                </Card>
            ) : (
                <div className="av-list">
                    {filtered.map(r => {
                        const cfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.vacaciones;
                        const profile = r.profiles;
                        return (
                            <Card key={r.id} padding="md" className="av-card">
                                <div className="av-card-header">
                                    <div className="av-card-left">
                                        <span
                                            className="av-type-dot"
                                            style={{ backgroundColor: cfg.color }}
                                        />
                                        <div className="av-card-info">
                                            <span className="av-employee-name">
                                                {profile?.full_name ?? profile?.email ?? '–'}
                                            </span>
                                            <span className="av-type-label">{cfg.label}</span>
                                        </div>
                                    </div>
                                    {STATUS_BADGE[r.status]}
                                </div>

                                <div className="av-card-dates">
                                    <span className="av-dates">
                                        {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                                    </span>
                                    <span className="av-days">
                                        {r.working_days} {r.working_days === 1 ? 'día' : 'días'} laborables
                                    </span>
                                </div>

                                {r.reason && (
                                    <p className="av-reason">{r.reason}</p>
                                )}

                                {r.manager_note && (
                                    <div className="av-manager-note">
                                        <span className="av-note-label">Nota:</span>
                                        {r.manager_note}
                                    </div>
                                )}

                                <div className="av-card-footer">
                                    <span className="av-created">Solicitada {fmtCreatedAt(r.created_at)}</span>
                                    {r.status === 'pending' && (
                                        <div className="av-actions">
                                            <Button
                                                variant="ghost"
                                                icon={CheckCircle}
                                                className="btn-approve"
                                                onClick={() => openResolve(r.id, 'approved')}
                                            >
                                                Aprobar
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                icon={XCircle}
                                                className="btn-reject"
                                                onClick={() => openResolve(r.id, 'rejected')}
                                            >
                                                Rechazar
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ── Resolve Modal ───────────────────────────────────────────────── */}
            <Modal
                isOpen={!!resolveModal}
                onClose={() => setResolveModal(null)}
                title={resolveModal?.action === 'approved' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
                size="sm"
            >
                <div className="av-resolve-form">
                    <p className="av-resolve-desc">
                        {resolveModal?.action === 'approved'
                            ? 'Se notificará al empleado que su solicitud ha sido aprobada.'
                            : 'Se notificará al empleado que su solicitud ha sido rechazada.'}
                    </p>
                    <div className="form-group">
                        <label className="form-label">
                            Nota para el empleado <span className="form-label-hint">(opcional)</span>
                        </label>
                        <textarea
                            className="form-textarea"
                            value={managerNote}
                            onChange={e => setManagerNote(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Añade un comentario..."
                        />
                    </div>
                    {resolveError && <p className="form-error">{resolveError}</p>}
                    <div className="form-actions">
                        <Button variant="ghost" onClick={() => setResolveModal(null)}>Cancelar</Button>
                        <Button
                            variant={resolveModal?.action === 'approved' ? 'primary' : 'danger'}
                            onClick={handleResolve}
                            disabled={resolving}
                        >
                            {resolving ? 'Procesando...' : resolveModal?.action === 'approved' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminVacacionesPage;
