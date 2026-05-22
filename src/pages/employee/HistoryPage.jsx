import { useState, useEffect, useCallback } from 'react';
import {
    Calendar, Clock, Filter, ChevronDown, ChevronUp,
    FileSpreadsheet, TrendingUp, Timer, CheckCircle, MapPin,
    Utensils, Coffee, Stethoscope, MoreHorizontal, Briefcase, ArrowUpDown
} from 'lucide-react';
import { Card, Button, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import './HistoryPage.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function fmtMinutes(mins) {
    if (!mins) return '0h 0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

function fmtTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function getPeriodParams(dateRange, customStart, customEnd) {
    const today = new Date().toISOString().slice(0, 10);
    if (dateRange === 'week')  return { period: 'week' };
    if (dateRange === 'month') return { period: 'month' };
    if (dateRange === 'last7') {
        const from = new Date(); from.setDate(from.getDate() - 7);
        return { period: 'custom', dateFrom: from.toISOString().slice(0, 10), dateTo: today };
    }
    if (dateRange === 'last30') {
        const from = new Date(); from.setDate(from.getDate() - 30);
        return { period: 'custom', dateFrom: from.toISOString().slice(0, 10), dateTo: today };
    }
    if (dateRange === 'custom' && customStart && customEnd) {
        return { period: 'custom', dateFrom: customStart, dateTo: customEnd };
    }
    return { period: 'month' };
}

function periodSubtitle(dateRange, customStart, customEnd) {
    const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const today = new Date();
    if (dateRange === 'week') {
        const mon = new Date(today);
        mon.setDate(mon.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
        return `${fmt(mon)} – ${fmt(today)}`;
    }
    if (dateRange === 'month') {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        return `${fmt(first)} – ${fmt(today)}`;
    }
    if (dateRange === 'last7') {
        const from = new Date(today); from.setDate(from.getDate() - 7);
        return `${fmt(from)} – ${fmt(today)}`;
    }
    if (dateRange === 'last30') {
        const from = new Date(today); from.setDate(from.getDate() - 30);
        return `${fmt(from)} – ${fmt(today)}`;
    }
    if (dateRange === 'custom' && customStart && customEnd) {
        return `${fmt(new Date(customStart))} – ${fmt(new Date(customEnd))}`;
    }
    return '';
}

const RANGE_LABELS = {
    week: 'Esta semana', month: 'Este mes',
    last7: 'Últimos 7 días', last30: 'Últimos 30 días', custom: 'Personalizado',
};

const DETAIL_BADGE = {
    normal:   { text: 'Normal',   cls: 'badge-neutral', Icon: Briefcase,      dotColor: null },
    comida:   { text: 'Comida',   cls: 'badge-warning', Icon: Utensils,       dotColor: 'var(--color-warning)' },
    descanso: { text: 'Descanso', cls: 'badge-info',    Icon: Coffee,         dotColor: 'var(--color-info)' },
    medico:   { text: 'Médico',   cls: 'badge-purple',  Icon: Stethoscope,    dotColor: 'var(--color-purple, #9F7AEA)' },
    otro:     { text: 'Otra',     cls: 'badge-neutral', Icon: MoreHorizontal, dotColor: null },
};

function getDetailBadge(detail_type) {
    return DETAIL_BADGE[detail_type] ?? { text: detail_type ?? '–', cls: 'badge-neutral', Icon: null, dotColor: null };
}

const SOURCE_LABELS = {
    web:        { icon: '🖥', label: 'App Web' },
    mobile:     { icon: '📱', label: 'App Móvil' },
    signalr:    { icon: '🔒', label: 'Lector 2N' },
    correction: { icon: '✏️', label: 'Corrección' },
};

function SourceBadge({ source }) {
    const { icon, label } = SOURCE_LABELS[source] ?? { icon: '?', label: source ?? '—' };
    return (
        <span className="source-badge" title={label}>
            <span className="source-badge-icon">{icon}</span>
            <span className="source-badge-text">{label}</span>
        </span>
    );
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const HistoryPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exportLoading, setExportLoading] = useState(false);
    const [expandedDay, setExpandedDay] = useState(null);
    const [filterType, setFilterType] = useState('all'); // 'all' | 'in' | 'out'
    const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = más reciente primero
    const [dateRange, setDateRange] = useState('month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showFilterModal, setShowFilterModal] = useState(false);

    const loadHistorial = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...getPeriodParams(dateRange, customStart, customEnd), limit: 90 };
            const res = await api.get('/api/me/historial', params);
            setData(res.data);
        } catch {
            // keep existing data visible
        } finally {
            setLoading(false);
        }
    }, [dateRange, customStart, customEnd]);

    useEffect(() => { loadHistorial(); }, [loadHistorial]);

    // SSE: recarga el historial cuando llega un nuevo fichaje (2N, web o móvil)
    useEffect(() => {
        const ctrl = new AbortController();

        async function connect() {
            try {
                const { data } = await supabase.auth.getSession();
                const token = data.session?.access_token;
                if (!token) return;

                const res = await fetch(`${BASE_URL}/api/me/live`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: ctrl.signal,
                });

                if (!res.ok) {
                    if (res.status >= 500) setTimeout(connect, 5000);
                    return;
                }

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
                            if (event.type === 'access_event') loadHistorial();
                        } catch { /* malformed SSE line */ }
                    }
                }
            } catch (err) {
                if (err.name !== 'AbortError') setTimeout(connect, 5000);
            }
        }

        connect();
        return () => ctrl.abort();
    }, [loadHistorial]);

    const handleExport = async () => {
        setExportLoading(true);
        try {
            const params = getPeriodParams(dateRange, customStart, customEnd);
            const blob = await api.download('/api/me/historial/export', { ...params, format: 'excel' });
            triggerDownload(blob, `historial-fichajes.xlsx`);
        } catch { /* silent */ } finally {
            setExportLoading(false);
        }
    };

    const summary = data?.summary;
    const days = [...(data?.days ?? [])].sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        return sortOrder === 'desc' ? -cmp : cmp;
    });

    const subtitle = periodSubtitle(dateRange, customStart, customEnd);

    return (
        <div className="history-page">
            <header className="history-header">
                <div>
                    <h1>Historial de Fichajes</h1>
                    <p className="text-muted">Consulta tus registros | {subtitle}</p>
                </div>
                <div className="history-actions">
                    <Button variant="secondary" icon={Filter} onClick={() => setShowFilterModal(true)}>
                        {RANGE_LABELS[dateRange]}
                    </Button>
                    <Button variant="secondary" icon={FileSpreadsheet} onClick={handleExport} loading={exportLoading}>
                        Exportar Excel
                    </Button>
                </div>
            </header>

            {/* Stats */}
            <div className="history-stats">
                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-primary"><Timer size={20} /></div>
                    <div className="stat-content">
                        <span className="stat-value">{fmtMinutes(summary?.total_worked_minutes)}</span>
                        <span className="stat-label">Total trabajado</span>
                    </div>
                </Card>
                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-green"><Calendar size={20} /></div>
                    <div className="stat-content">
                        <span className="stat-value">{summary?.days_worked ?? 0}</span>
                        <span className="stat-label">Días trabajados</span>
                    </div>
                </Card>
                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-purple"><TrendingUp size={20} /></div>
                    <div className="stat-content">
                        <span className="stat-value">{fmtMinutes(summary?.daily_average_minutes)}</span>
                        <span className="stat-label">Media por día</span>
                    </div>
                </Card>
                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-orange"><CheckCircle size={20} /></div>
                    <div className="stat-content">
                        <span className="stat-value">{summary?.total_fichajes ?? 0}</span>
                        <span className="stat-label">Total fichajes</span>
                    </div>
                </Card>
            </div>

            {/* Type filter */}
            <div className="history-type-filter">
                {[['all', 'Todos'], ['in', 'Entradas'], ['out', 'Salidas']].map(([val, label]) => (
                    <button
                        key={val}
                        className={`type-filter-btn ${filterType === val ? 'active' : ''}`}
                        onClick={() => setFilterType(val)}
                    >
                        {label}
                    </button>
                ))}
                <button
                    className="type-filter-btn sort-toggle"
                    onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                    title={sortOrder === 'desc' ? 'Mostrando más reciente primero' : 'Mostrando más antiguo primero'}
                >
                    <ArrowUpDown size={14} />
                    {sortOrder === 'desc' ? 'Más reciente' : 'Más antiguo'}
                </button>
            </div>

            {/* Day list */}
            <div className="history-list">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                        Cargando...
                    </div>
                ) : days.length === 0 ? (
                    <Card padding="lg" className="history-empty">
                        <Clock size={48} className="text-muted" />
                        <h3>Sin registros</h3>
                        <p className="text-muted">No hay fichajes en el período seleccionado</p>
                    </Card>
                ) : (
                    days.map((day) => {
                        const filtered = filterType === 'all'
                            ? day.fichajes
                            : day.fichajes.filter(f => f.direction === filterType);

                        if (filtered.length === 0) return null;

                        const isExpanded = expandedDay === day.date;
                        // fichajes are desc; first is most recent — is_inside if direction === 'in'
                        const isActive = day.fichajes[0]?.direction === 'in';
                        const h = Math.floor(day.total_minutes / 60);
                        const m = day.total_minutes % 60;

                        return (
                            <Card key={day.date} padding="none" className="history-day-card">
                                <button
                                    className="history-day-header"
                                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                                >
                                    <div className="history-day-info">
                                        <Calendar size={18} />
                                        <span className="history-day-label">{day.label}</span>
                                        <span className="history-day-count">{filtered.length} fichajes</span>
                                    </div>
                                    <div className="history-day-summary">
                                        <span className={`history-day-hours ${isActive ? 'active' : ''}`}>
                                            <Clock size={14} />
                                            {h}h {m}m
                                            {isActive && <span className="pulse-dot" />}
                                        </span>
                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="history-day-entries">
                                        <div className="history-timeline">
                                            {[...filtered]
                                                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                                                .map((entry, index, arr) => {
                                                    const badge = getDetailBadge(entry.detail_type);
                                                    const dirClass = entry.direction === 'in' ? 'check_in' : 'check_out';
                                                    const isLast = index === arr.length - 1;

                                                    const dotStyle = badge.dotColor
                                                        ? { background: badge.dotColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${badge.dotColor} 20%, transparent)` }
                                                        : undefined;

                                                    return (
                                                        <div key={entry.id} className={`timeline-entry ${dirClass} ${index === 0 ? 'first' : ''} ${isLast ? 'last' : ''}`}>
                                                            <div className="timeline-marker">
                                                                <div className={`timeline-dot ${dirClass}`} style={dotStyle} />
                                                                {!isLast && <div className="timeline-line" />}
                                                            </div>
                                                            <div className="timeline-content">
                                                                <div className="timeline-header">
                                                                    <span className="timeline-time">{fmtTime(entry.timestamp)}</span>
                                                                    <span className={`timeline-type-badge ${dirClass}`}>
                                                                        {entry.direction === 'in' ? 'Entrada' : 'Salida'}
                                                                    </span>
                                                                </div>
                                                                <div className="timeline-details">
                                                                    <span className={`badge ${badge.cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        {badge.Icon && <badge.Icon size={11} />}
                                                                        {badge.text}
                                                                    </span>
                                                                    {entry.corrected && (
                                                                        <span className="badge badge-info">Corregido</span>
                                                                    )}
                                                                    {(entry.latitude || entry.longitude) && (
                                                                        <span className="timeline-location">
                                                                            <MapPin size={12} />
                                                                            <span className="location-ok">GPS</span>
                                                                        </span>
                                                                    )}
                                                                    <SourceBadge source={entry.source} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Filter Modal */}
            <Modal isOpen={showFilterModal} onClose={() => setShowFilterModal(false)} title="Filtrar por período" size="sm">
                <div className="filter-modal-content">
                    <div className="filter-options">
                        {Object.entries(RANGE_LABELS).map(([value, label]) => (
                            <button
                                key={value}
                                className={`filter-option ${dateRange === value ? 'active' : ''}`}
                                onClick={() => setDateRange(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="custom-date-range">
                            <div className="date-input-group">
                                <label>Desde</label>
                                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                            </div>
                            <div className="date-input-group">
                                <label>Hasta</label>
                                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                            </div>
                        </div>
                    )}

                    <div className="filter-modal-actions">
                        <Button variant="primary" fullWidth onClick={() => setShowFilterModal(false)}>
                            Aplicar filtro
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default HistoryPage;
