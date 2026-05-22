import { useState, useEffect, useCallback } from 'react';
import { Card, Button, StatCard } from '../../components/ui';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { FileText, FileSpreadsheet, Calendar, BarChart3, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import './ReportsPage.css';

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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

const ReportsPage = () => {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [summary, setSummary] = useState(null);
    const [activity, setActivity] = useState([]);
    const [loadingMain, setLoadingMain] = useState(true);
    const [dlLoading, setDlLoading] = useState({});

    const loadData = useCallback(async () => {
        setLoadingMain(true);
        try {
            const [sumRes, actRes] = await Promise.all([
                api.get('/api/me/reportes/summary', { month, year }),
                api.get('/api/me/reportes/activity', { month, year, limit: 100 }),
            ]);
            setSummary(sumRes.data);
            setActivity(actRes.data?.items ?? []);
        } catch {
            // keep existing
        } finally {
            setLoadingMain(false);
        }
    }, [month, year]);

    useEffect(() => { loadData(); }, [loadData]);

    // SSE: recarga solo si el usuario está viendo el mes actual
    useEffect(() => {
        const now = new Date();
        const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
        if (!isCurrentMonth) return;

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
                            if (event.type === 'access_event') loadData();
                        } catch { /* malformed SSE line */ }
                    }
                }
            } catch (err) {
                if (err.name !== 'AbortError') setTimeout(connect, 5000);
            }
        }

        connect();
        return () => ctrl.abort();
    }, [month, year, loadData]);

    const handlePrevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };

    const handleNextMonth = () => {
        if (!summary?.has_next_month) return;
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const download = async (endpoint, params, filename) => {
        setDlLoading(prev => ({ ...prev, [filename]: true }));
        try {
            const blob = await api.download(endpoint, params);
            triggerDownload(blob, filename);
        } catch {
            // silent
        } finally {
            setDlLoading(prev => ({ ...prev, [filename]: false }));
        }
    };

    const mp = String(month).padStart(2, '0');

    return (
        <div className="reports-page">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Reportes</h1>
                    <p className="page-subtitle">Visualiza y descarga tus informes de actividad</p>
                </div>
                <div className="month-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Button variant="ghost" icon={ChevronLeft} onClick={handlePrevMonth} className="btn-icon-only" aria-label="Mes anterior" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', minWidth: '160px', justifyContent: 'center' }}>
                        <Calendar size={18} />
                        <span style={{ textTransform: 'capitalize' }}>{MONTHS_ES[month - 1]} {year}</span>
                    </div>
                    <Button
                        variant="ghost"
                        icon={ChevronRight}
                        onClick={handleNextMonth}
                        className="btn-icon-only"
                        aria-label="Mes siguiente"
                        disabled={!summary?.has_next_month}
                    />
                </div>
            </header>

            <div className="reports-stats-grid">
                <StatCard
                    icon={Timer}
                    iconColor="blue"
                    value={`${summary?.total_hours ?? 0}h`}
                    label="registradas"
                    subtitle="Total Horas"
                />
                <StatCard
                    icon={Calendar}
                    iconColor="green"
                    value={String(summary?.days_worked ?? 0)}
                    label="días"
                    subtitle="Días Trabajados"
                />
                <StatCard
                    icon={BarChart3}
                    iconColor="purple"
                    value={`${summary?.daily_average ?? 0}h`}
                    label="por día"
                    subtitle="Promedio Diario"
                />
            </div>

            <div className="reports-content">
                <Card className="report-card">
                    <div className="report-card-header">
                        <div className="report-icon-container">
                            <FileText size={32} />
                        </div>
                        <div className="report-info">
                            <h3>Informe Mensual Detallado</h3>
                            <p>Incluye registros de entrada, salida, pausas y total de horas por día.</p>
                            <div className="report-meta">
                                <span>Periodo: {summary?.period_label ?? `${mp}/${year}`}</span>
                            </div>
                        </div>
                    </div>
                    <div className="report-actions">
                        <Button
                            variant="secondary"
                            icon={FileText}
                            loading={dlLoading[`timetrack-${mp}-${year}.pdf`]}
                            onClick={() => download(
                                '/api/me/reportes/download/monthly',
                                { month, year, format: 'pdf' },
                                `timetrack-${mp}-${year}.pdf`
                            )}
                        >
                            Descargar PDF
                        </Button>
                        <Button
                            variant="secondary"
                            icon={FileSpreadsheet}
                            loading={dlLoading[`timetrack-${mp}-${year}.xlsx`]}
                            onClick={() => download(
                                '/api/me/reportes/download/monthly',
                                { month, year, format: 'excel' },
                                `timetrack-${mp}-${year}.xlsx`
                            )}
                        >
                            Descargar Excel
                        </Button>
                    </div>
                </Card>

                <Card className="report-card">
                    <div className="report-card-header">
                        <div className="report-icon-container warning">
                            <BarChart3 size={32} />
                        </div>
                        <div className="report-info">
                            <h3>Resumen de Incidencias</h3>
                            <p>Reporte de correcciones, horas extra y ausencias justificadas.</p>
                            {summary?.incidencias_summary && (
                                <div className="report-meta">
                                    <span>
                                        Total: {summary.incidencias_summary.total}
                                        {' · '}Pendientes: {summary.incidencias_summary.pending}
                                        {' · '}Aprobadas: {summary.incidencias_summary.approved}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="report-actions">
                        <Button
                            variant="secondary"
                            icon={FileText}
                            loading={dlLoading[`incidencias-${mp}-${year}.pdf`]}
                            onClick={() => download(
                                '/api/me/reportes/download/incidencias',
                                { month, year },
                                `incidencias-${mp}-${year}.pdf`
                            )}
                        >
                            Descargar PDF
                        </Button>
                    </div>
                </Card>
            </div>

            <Card className="report-card full-width" style={{ marginTop: '2rem' }}>
                <div className="report-card-header">
                    <div className="report-info">
                        <h3>Detalle de Actividad</h3>
                        <p>Registro diario de entradas y salidas.</p>
                    </div>
                </div>
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Día</th>
                                <th>Hora</th>
                                <th>Tipo</th>
                                <th>Detalle</th>
                                <th>Origen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingMain ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-8)' }}>
                                        Cargando...
                                    </td>
                                </tr>
                            ) : activity.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-8)' }}>
                                        No hay registros para este mes.
                                    </td>
                                </tr>
                            ) : (
                                activity.map((entry, i) => (
                                    <tr key={i}>
                                        <td>{entry.fecha}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{entry.dia}</td>
                                        <td><strong>{entry.hora}</strong></td>
                                        <td>
                                            <span className={`type-badge ${entry.tipo === 'ENTRADA' ? 'check_in' : 'check_out'}`}>
                                                {entry.tipo}
                                            </span>
                                        </td>
                                        <td className="text-muted">{entry.detalle}</td>
                                        <td className="text-muted">{entry.origen}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default ReportsPage;
