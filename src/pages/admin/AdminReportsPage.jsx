import { useState, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import {
    Download,
    Calendar,
    Users,
    Clock,
    TrendingUp,
    AlertTriangle,
    FileText,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { StatCard, Card, Button } from '../../components/ui';
import { MOCK_USERS } from '../../lib/mockData';
import { generateChartData, getReportTableData, calculatePeriodStats } from '../../lib/reportsUtils';
import { generateCSV, generatePDF } from '../../lib/exportUtils';
import { startOfMonth, endOfMonth, format, subMonths, parseISO, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import './AdminReportsPage.css';

const AdminReportsPage = () => {
    // State
    const [dateRange, setDateRange] = useState({
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date())
    });
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [stats, setStats] = useState({ totalHours: 0, overtimeHours: 0, absenteeism: 0, punctuality: 0 });
    const [chartData, setChartData] = useState([]);
    const [tableData, setTableData] = useState([]);

    // Update data when filters change
    useEffect(() => {
        try {
            const newStats = calculatePeriodStats(dateRange.start, dateRange.end, selectedEmployee);
            const newChart = generateChartData(dateRange.start, dateRange.end, selectedEmployee);
            const newTable = getReportTableData(dateRange.start, dateRange.end, selectedEmployee);

            setStats(newStats);
            setChartData(newChart);
            setTableData(newTable);
        } catch (e) {
            console.error('Error updating report data:', e);
        }
    }, [dateRange, selectedEmployee]);

    // Handlers
    const handleEmployeeChange = (e) => setSelectedEmployee(e.target.value);

    const handleRangeChange = (preset) => {
        const now = new Date();
        if (preset === 'month') {
            setDateRange({ start: startOfMonth(now), end: endOfMonth(now) });
        } else if (preset === 'prev_month') {
            const prev = subMonths(now, 1);
            setDateRange({ start: startOfMonth(prev), end: endOfMonth(prev) });
        }
    };

    const handlePrevMonth = () => {
        const newStart = subMonths(dateRange.start, 1);
        setDateRange({ start: startOfMonth(newStart), end: endOfMonth(newStart) });
    };

    const handleNextMonth = () => {
        const newStart = addMonths(dateRange.start, 1);
        setDateRange({ start: startOfMonth(newStart), end: endOfMonth(newStart) });
    };

    const handleExport = (formatType) => {
        const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
        const fileName = `Reporte_Asistencia_${timestamp}`;

        if (formatType === 'CSV') {
            generateCSV(tableData, fileName);
        } else if (formatType === 'PDF') {
            const columns = ['Empleado', 'Fecha', 'Tipo', 'Hora', 'Dispositivo'];
            const rows = tableData.map(row => [
                row.userName,
                format(parseISO(row.date), 'dd/MM/yyyy', { locale: es }),
                row.type === 'check_in' ? 'Entrada' : 'Salida',
                format(parseISO(row.date), 'HH:mm'),
                row.device
            ]);
            generatePDF('Reporte de Asistencia', columns, rows, fileName);
        }
    };

    return (
        <div className="admin-reports-page">
            <header className="page-header">
                <div>
                    <h1>Informes y Analítica</h1>
                    <p className="text-muted">Análisis de asistencia y exportación de datos</p>
                </div>
                <div className="header-actions">
                    <Button variant="outline" icon={Download} onClick={() => handleExport('CSV')}>
                        CSV
                    </Button>
                    <Button variant="primary" icon={FileText} onClick={() => handleExport('PDF')}>
                        PDF
                    </Button>
                </div>
            </header>

            {/* Filters */}
            <Card className="filters-card-reports" padding="sm">
                <div className="filters-row">
                    <div className="filter-group">
                        <Calendar size={18} className="text-muted" />
                        <span className="filter-label">Periodo:</span>
                        <div className="date-presets" style={{ display: 'flex', alignItems: 'center' }}>
                            <Button variant="ghost" icon={ChevronLeft} onClick={handlePrevMonth} className="btn-icon-only preset-btn" style={{ padding: '4px' }} />
                            <span className="date-display" style={{ margin: '0 8px', minWidth: '120px', textAlign: 'center' }}>
                                {format(dateRange.start, 'MMMM yyyy', { locale: es })}
                            </span>
                            <Button variant="ghost" icon={ChevronRight} onClick={handleNextMonth} className="btn-icon-only preset-btn" style={{ padding: '4px' }} />
                        </div>
                    </div>

                    <div className="filter-group">
                        <Users size={18} className="text-muted" />
                        <select
                            className="employee-select"
                            value={selectedEmployee}
                            onChange={handleEmployeeChange}
                        >
                            <option value="all">Todos los empleados</option>
                            {MOCK_USERS.filter(u => u.profile.role === 'employee').map(u => (
                                <option key={u.id} value={u.id}>{u.profile.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </Card>

            {/* KPIs */}
            <div className="stats-grid-reports">
                <StatCard
                    icon={Clock}
                    label="Horas Totales"
                    value={`${stats.totalHours}h`}
                    subtitle="En periodo seleccionado"
                    iconColor="primary"
                />
                <StatCard
                    icon={TrendingUp}
                    label="Horas Extra Estimadas"
                    value={`~${stats.overtimeHours}h`}
                    subtitle="Promedio semanal"
                    iconColor="orange"
                />
                <StatCard
                    icon={AlertTriangle}
                    label="Ausentismo"
                    value={`${stats.absenteeism}%`}
                    subtitle="Tasa global"
                    iconColor="danger"
                />
            </div>

            {/* Main Chart */}
            <div className="reports-layout">
                {/* Chart commented out for debugging */}
                {/* 
                <Card className="chart-card" title="Evolución de Horas Trabajadas">
                    <div style={{ height: '300px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'var(--color-bg-tertiary)', 
                                        borderColor: 'var(--color-border)', 
                                        borderRadius: '8px',
                                        color: 'var(--color-text-primary)'
                                    }}
                                    cursor={{ fill: 'var(--color-bg-secondary)' }}
                                />
                                <Bar dataKey="hours" fill="var(--color-primary)" radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                */}

                {/* Detailed Table */}
                <Card className="table-card" title="Detalle de Fichajes">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>Hora</th>
                                    <th>Dispositivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableData.slice(0, 10).map((row) => (
                                    <tr key={row.id}>
                                        <td className="font-medium">{row.userName}</td>
                                        <td>{format(parseISO(row.date), 'd MMM yyyy', { locale: es })}</td>
                                        <td>
                                            <span className={`type-badge ${row.type}`}>
                                                {row.type === 'check_in' ? 'Entrada' : 'Salida'}
                                            </span>
                                        </td>
                                        <td>{format(parseISO(row.date), 'HH:mm')}</td>
                                        <td className="text-muted text-sm">{row.device}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="table-footer">
                            <span className="text-xs text-muted">Mostrando últimos 10 registros</span>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AdminReportsPage;
