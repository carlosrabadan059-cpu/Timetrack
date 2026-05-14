import { useState, useEffect, useCallback } from 'react';
import { Calendar, Users, Clock, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { StatCard, Card, Button } from '../../components/ui';
import { api } from '../../lib/api';
import './AdminReportsPage.css';

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const AdminReportsPage = () => {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [selectedUserId, setSelectedUserId] = useState('all');
    const [employees, setEmployees] = useState([]);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/api/users', { limit: 100 })
            .then(res => setEmployees(res.data ?? []))
            .catch(() => {});
    }, []);

    const loadReports = useCallback(async () => {
        setLoading(true);
        try {
            const lastDay = new Date(year, month, 0).getDate();
            const mp = String(month).padStart(2, '0');
            const ldp = String(lastDay).padStart(2, '0');
            const params = {
                date_from: `${year}-${mp}-01`,
                date_to: `${year}-${mp}-${ldp}`,
                limit: 100,
            };
            if (selectedUserId !== 'all') params.user_id = selectedUserId;
            const res = await api.get('/api/admin/access-logs', params);
            setRecords(res.data ?? []);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, [month, year, selectedUserId]);

    useEffect(() => { loadReports(); }, [loadReports]);

    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

    const handlePrevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };

    const handleNextMonth = () => {
        if (isCurrentMonth) return;
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const totalFichajes = records.length;
    const uniqueDays = new Set(records.map(r => r.timestamp?.slice(0, 10))).size;

    return (
        <div className="admin-reports-page">
            <header className="page-header">
                <div>
                    <h1>Informes y Analítica</h1>
                    <p className="text-muted">Análisis de asistencia por empleado y periodo</p>
                </div>
            </header>

            <Card className="filters-card-reports" padding="sm">
                <div className="filters-row">
                    <div className="filter-group">
                        <Calendar size={18} className="text-muted" />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Button variant="ghost" icon={ChevronLeft} onClick={handlePrevMonth} className="btn-icon-only preset-btn" style={{ padding: '4px' }} />
                            <span style={{ minWidth: '140px', textAlign: 'center', fontWeight: 500 }}>
                                {MONTHS_ES[month - 1]} {year}
                            </span>
                            <Button
                                variant="ghost"
                                icon={ChevronRight}
                                onClick={handleNextMonth}
                                className="btn-icon-only preset-btn"
                                disabled={isCurrentMonth}
                                style={{ padding: '4px' }}
                            />
                        </div>
                    </div>
                    <div className="filter-group">
                        <Users size={18} className="text-muted" />
                        <select
                            className="employee-select"
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                        >
                            <option value="all">Todos los empleados</option>
                            {employees.filter(e => e.role === 'employee').map(u => (
                                <option key={u.id} value={u.id}>{u.full_name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </Card>

            <div className="stats-grid-reports">
                <StatCard icon={FileText} label="Total Fichajes" value={String(totalFichajes)} subtitle="En periodo" iconColor="primary" />
                <StatCard icon={Clock} label="Días con actividad" value={String(uniqueDays)} subtitle="Días únicos" iconColor="blue" />
            </div>

            <div className="reports-layout">
                <Card className="table-card" title="Detalle de Fichajes">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Fecha</th>
                                    <th>Hora</th>
                                    <th>Tipo</th>
                                    <th>Origen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-8)' }}>
                                            Cargando...
                                        </td>
                                    </tr>
                                ) : records.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-8)' }}>
                                            Sin datos para este periodo
                                        </td>
                                    </tr>
                                ) : (
                                    records.map((row) => {
                                        const d = new Date(row.timestamp);
                                        return (
                                            <tr key={row.id}>
                                                <td className="font-medium">{row.user_name}</td>
                                                <td>{d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td>{d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td>
                                                    <span className={`type-badge ${row.direction === 'in' ? 'check_in' : 'check_out'}`}>
                                                        {row.direction === 'in' ? 'Entrada' : 'Salida'}
                                                    </span>
                                                </td>
                                                <td className="text-muted text-sm">{row.source}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                        {records.length > 0 && (
                            <div className="table-footer">
                                <span className="text-xs text-muted">Mostrando {records.length} registros</span>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AdminReportsPage;
