import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MapPin, Smartphone, Globe, Lock, PenLine } from 'lucide-react';
import { Card } from '../../components/ui';
import { api, BASE_URL } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import './AdminAttendancePage.css';

function fmtDateTime(ts) {
    const d = new Date(ts);
    return {
        date: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
}

function SourceIcon({ source }) {
    if (source === 'mobile')     return <Smartphone size={14} />;
    if (source === 'signalr')    return <Lock size={14} />;
    if (source === 'correction') return <PenLine size={14} />;
    return <Globe size={14} />;
}

function sourceLabel(source) {
    if (source === 'mobile')     return 'Móvil';
    if (source === 'signalr')    return '2N';
    if (source === 'correction') return 'Corrección';
    return 'Web';
}

const LIMIT = 50;

const AdminAttendancePage = () => {
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [directionFilter, setDirectionFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');
    const [page, setPage] = useState(1);
    const debounceRef = useRef(null);

    const loadLogs = useCallback(async (search, direction, date, pg) => {
        setLoading(true);
        try {
            const params = { limit: LIMIT, page: pg };
            if (search) params.search = search;
            if (direction !== 'all') params.direction = direction;
            if (date) params.date = date;
            const res = await api.get('/api/admin/access-logs', params);
            setRecords(res.data ?? []);
            setTotal(res.meta?.total ?? 0);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce filter changes, reset to page 1
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            loadLogs(searchTerm, directionFilter, dateFilter, 1);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [searchTerm, directionFilter, dateFilter, loadLogs]);

    // Reload when page changes (without resetting)
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) { isFirstRender.current = false; return; }
        loadLogs(searchTerm, directionFilter, dateFilter, page);
    }, [page]); // eslint-disable-line

    // SSE: reload on new fichaje (only if on page 1)
    const pageRef = useRef(page);
    useEffect(() => { pageRef.current = page; }, [page]);

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
                            if (event.type === 'access_event' && pageRef.current === 1) {
                                loadLogs(searchTerm, directionFilter, dateFilter, 1);
                            }
                        } catch { /* ignore */ }
                    }
                }
                if (!ctrl.signal.aborted) setTimeout(connect, 1000);
            } catch { if (!ctrl.signal.aborted) setTimeout(connect, 5000); }
        }
        connect();
        return () => ctrl.abort();
    }, [loadLogs, searchTerm, directionFilter, dateFilter]);

    return (
        <div className="admin-attendance-page">
            <header className="page-header">
                <div>
                    <h1>Listado de Fichajes</h1>
                    <p className="text-muted">Registro completo de entradas y salidas</p>
                </div>
            </header>

            <Card className="filters-attendance-card" padding="sm">
                <div className="filters-row">
                    <div className="search-group">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Buscar por empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-group">
                        <select
                            className="filter-select"
                            value={directionFilter}
                            onChange={(e) => setDirectionFilter(e.target.value)}
                        >
                            <option value="all">Todos los tipos</option>
                            <option value="in">Entradas</option>
                            <option value="out">Salidas</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <input
                            type="date"
                            className="date-filter"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        />
                    </div>
                </div>
            </Card>

            <Card className="table-card" padding="none">
                <div className="attendance-table-container">
                    <table className="attendance-table">
                        <thead>
                            <tr>
                                <th>Fecha / Hora</th>
                                <th>Empleado</th>
                                <th>Tipo</th>
                                <th>Detalle</th>
                                <th>GPS</th>
                                <th>Origen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-8 text-muted">Cargando...</td>
                                </tr>
                            ) : records.length > 0 ? (
                                records.map(record => {
                                    const { date, time } = fmtDateTime(record.timestamp);
                                    return (
                                        <tr key={record.id}>
                                            <td>
                                                <div className="font-medium">{date}</div>
                                                <div className="text-muted text-xs">{time}</div>
                                            </td>
                                            <td>
                                                <div className="attendance-user">{record.user_name}</div>
                                                <div className="attendance-email">{record.user_email}</div>
                                            </td>
                                            <td>
                                                <span className={`type-indicator ${record.direction === 'in' ? 'check_in' : 'check_out'}`}>
                                                    {record.direction === 'in' ? 'Entrada' : 'Salida'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-sm capitalize">{record.detail_type || 'Normal'}</span>
                                                {(record.corrected || record.source === 'correction') && (
                                                    <span className="badge badge-info" style={{ marginLeft: '0.25rem', fontSize: '0.65rem' }}>
                                                        Corrección
                                                    </span>
                                                )}
                                                {record.out_of_schedule && (
                                                    <span className="badge badge-warning" style={{ marginLeft: '0.25rem', fontSize: '0.65rem' }}>
                                                        Fuera de horario
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {record.within_geofence === true ? (
                                                    <span className="location-badge in-zone" title="Dentro de la sede">
                                                        <MapPin size={10} /> En sede
                                                    </span>
                                                ) : record.within_geofence === false ? (
                                                    <span className="location-badge out-zone" title="Fuera de la sede">
                                                        <MapPin size={10} /> Fuera
                                                    </span>
                                                ) : record.has_gps ? (
                                                    <span className="location-badge" title="GPS registrado, geofence no configurado">
                                                        <MapPin size={10} /> GPS
                                                    </span>
                                                ) : (
                                                    <span className="text-muted text-xs">–</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1 text-muted text-sm">
                                                    <SourceIcon source={record.source} />
                                                    <span>{sourceLabel(record.source)}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center py-8 text-muted">
                                        No se encontraron registros
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-border-light" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="text-xs text-muted">Total: {total} registros</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            style={{ padding: '0.25rem 0.75rem', opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'default' : 'pointer', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}
                        >
                            ← Anterior
                        </button>
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                            Página {page}
                        </span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page * LIMIT >= total || loading}
                            style={{ padding: '0.25rem 0.75rem', opacity: page * LIMIT >= total ? 0.4 : 1, cursor: page * LIMIT >= total ? 'default' : 'pointer', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}
                        >
                            Siguiente →
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default AdminAttendancePage;
