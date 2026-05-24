import { useState, useEffect, useCallback } from 'react';
import { StatCard, Card, Button } from '../../components/ui';
import { api } from '../../lib/api';
import { useCorrections } from '../../contexts/CorrectionsContext';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, AlertCircle, FileText, Filter, Search, CalendarCheck } from 'lucide-react';
import './AdminCorrectionsPage.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TYPE_LABELS = {
    correccion: 'Corrección',
    olvido:     'Fichaje Olvidado',
    ausencia:   'Ausencia',
    hora_extra: 'Hora Extra',
};

const STATUS_BADGE = {
    pending:  <span className="badge badge-warning">Pendiente</span>,
    approved: <span className="badge badge-success">Aprobada</span>,
    rejected: <span className="badge badge-error">Rechazada</span>,
};

function fmtDateTime(ts) {
    if (!ts) return '–';
    return new Date(ts).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtCreatedAt(ts) {
    if (!ts) return '–';
    return new Date(ts).toLocaleString('es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const AdminCorrectionsPage = () => {
    const { refresh: refreshBadge } = useCorrections();
    const [incidencias, setIncidencias] = useState([]);
    const [counts, setCounts] = useState({ pending: 0, total: 0 });
    const [filterStatus, setFilterStatus] = useState('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});

    const loadIncidencias = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 50 };
            if (filterStatus !== 'all') params.status = filterStatus;
            const [mainRes, pendingRes, allRes] = await Promise.all([
                api.get('/api/incidencias', params),
                api.get('/api/incidencias', { status: 'pending', limit: 1 }),
                api.get('/api/incidencias', { limit: 1 }),
            ]);
            setIncidencias(mainRes.data?.items ?? []);
            setCounts({
                pending: pendingRes.data?.total ?? 0,
                total: allRes.data?.total ?? 0,
            });
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    useEffect(() => { loadIncidencias(); }, [loadIncidencias]);

    // SSE: reload on new or resolved incidencia
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
                if (!res.ok) { if (res.status >= 500) setTimeout(connect, 5000); return; }
                const reader = res.body.getReader();
                const dec = new TextDecoder();
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += dec.decode(value, { stream: true });
                    const chunks = buf.split('\n\n');
                    buf = chunks.pop() || '';
                    for (const chunk of chunks) {
                        const line = chunk.split('\n').find(l => l.startsWith('data: '));
                        if (!line) continue;
                        try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === 'incidencia_event') {
                                loadIncidencias();
                                refreshBadge();
                            }
                        } catch { /* ignore */ }
                    }
                }
                if (!ctrl.signal.aborted) setTimeout(connect, 1000);
            } catch { if (!ctrl.signal.aborted) setTimeout(connect, 5000); }
        }
        connect();
        return () => ctrl.abort();
    }, [loadIncidencias, refreshBadge]);

    const handleAction = async (id, status) => {
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            await api.patch(`/api/incidencias/${id}`, {
                status,
                manager_note: status === 'approved'
                    ? 'Aprobado por administrador'
                    : 'Rechazado por administrador',
            });
            loadIncidencias();
            refreshBadge();
        } catch {
            // keep existing
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    const filtered = incidencias.filter(inc => {
        if (!searchTerm) return true;
        const name = inc.profiles?.full_name ?? '';
        const reason = inc.reason ?? '';
        return (
            name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            reason.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    return (
        <div className="admin-corrections-page">
            <header className="page-header">
                <div>
                    <h1>Gestión de Incidencias</h1>
                    <p className="text-muted">Revisión de solicitudes de corrección de fichajes</p>
                </div>
            </header>

            <div className="stats-grid">
                <StatCard icon={AlertCircle} label="Pendientes" value={String(counts.pending)} iconColor="warning" />
                <StatCard icon={FileText} label="Total Solicitudes" value={String(counts.total)} iconColor="primary" />
            </div>

            <Card className="filters-card" padding="sm">
                <div className="filters-row">
                    <div className="filter-group">
                        <Filter size={18} className="text-muted" />
                        {[['pending', 'Pendientes'], ['approved', 'Aprobadas'], ['rejected', 'Rechazadas'], ['all', 'Todas']].map(([val, label]) => (
                            <button
                                key={val}
                                className={`filter-btn ${filterStatus === val ? 'active' : ''}`}
                                onClick={() => setFilterStatus(val)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="search-group">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Buscar empleado o motivo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                </div>
            </Card>

            <div className="requests-list">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                        Cargando...
                    </div>
                ) : filtered.length > 0 ? (
                    filtered.map(inc => (
                        <Card key={inc.id} className="request-card-admin" padding="md">
                            <div className="req-header">
                                <div className="req-user-info">
                                    <div className="user-avatar-sm">
                                        {(inc.profiles?.full_name ?? 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <span className="user-name">{inc.profiles?.full_name ?? 'Desconocido'}</span>
                                        <span className="req-date">{fmtCreatedAt(inc.created_at)}</span>
                                    </div>
                                </div>
                                <div className="req-status">
                                    <span className="req-type-badge">{TYPE_LABELS[inc.type] ?? inc.type}</span>
                                    {STATUS_BADGE[inc.status]}
                                </div>
                            </div>

                            <div className="req-body">
                                <div className="req-details-grid">
                                    <div className="detail-item">
                                        <span className="detail-label">Motivo</span>
                                        <p className="detail-value">{inc.reason}</p>
                                    </div>

                                    {inc.type === 'correccion' && inc.original_timestamp && (
                                        <div className="detail-item time-change">
                                            <span className="detail-label">Cambio Propuesto</span>
                                            <div className="time-arrow">
                                                <span className="t-old">{fmtDateTime(inc.original_timestamp)}</span>
                                                <span>→</span>
                                                <span className="t-new">{fmtDateTime(inc.requested_timestamp)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {inc.type === 'olvido' && inc.requested_timestamp && (
                                        <div className="detail-item">
                                            <span className="detail-label">Fichaje Solicitado</span>
                                            <p className="detail-value">
                                                {fmtDateTime(inc.requested_timestamp)}
                                                {' '}({inc.requested_direction === 'in' ? 'Entrada' : 'Salida'})
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {inc.status === 'approved' && (inc.type === 'olvido' || inc.type === 'correccion') && (
                                <div className="req-fichaje-created">
                                    <CalendarCheck size={14} />
                                    {inc.type === 'olvido' && inc.requested_timestamp && (
                                        <span>
                                            Fichaje registrado: <strong>{fmtDateTime(inc.requested_timestamp)}</strong>
                                            {' '}({inc.requested_direction === 'in' ? 'Entrada' : 'Salida'})
                                        </span>
                                    )}
                                    {inc.type === 'correccion' && inc.requested_timestamp && (
                                        <span>
                                            Fichaje corregido a: <strong>{fmtDateTime(inc.requested_timestamp)}</strong>
                                        </span>
                                    )}
                                </div>
                            )}

                            {inc.status === 'pending' && (
                                <div className="req-actions">
                                    <Button
                                        variant="ghost"
                                        className="btn-reject"
                                        onClick={() => handleAction(inc.id, 'rejected')}
                                        icon={XCircle}
                                        loading={!!actionLoading[inc.id]}
                                    >
                                        Rechazar
                                    </Button>
                                    <Button
                                        variant="primary"
                                        className="btn-approve"
                                        onClick={() => handleAction(inc.id, 'approved')}
                                        icon={CheckCircle}
                                        loading={!!actionLoading[inc.id]}
                                    >
                                        Aprobar Solicitud
                                    </Button>
                                </div>
                            )}
                        </Card>
                    ))
                ) : (
                    <div className="empty-state-admin">
                        <CheckCircle size={48} />
                        <h3>No hay solicitudes</h3>
                        <p>No hay incidencias que coincidan con los filtros.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminCorrectionsPage;
