import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Button, StatCard } from '../../components/ui';
import { FileText, FileSpreadsheet, Calendar, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { MOCK_ATTENDANCE, calculateHoursWorked } from '../../lib/mockData';
import { generateExcel, generatePDF } from '../../lib/exportUtils';
import { parseISO, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import './ReportsPage.css';

const ReportsPage = () => {
    const { profile } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    const handlePrevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));

    // Generate monthly stats
    const getMonthlyStats = () => {
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        const monthEntries = MOCK_ATTENDANCE.filter(e => {
            const date = parseISO(e.timestamp);
            return e.user_id === profile?.id && isSameMonth(date, selectedMonth);
        });

        // Group by day to calculate totals
        const days = eachDayOfInterval({ start, end });
        let totalHours = 0;
        let daysWorked = 0;
        let perfectDays = 0; // e.g. >= 8 hours

        days.forEach(day => {
            const dayEntries = monthEntries.filter(e =>
                parseISO(e.timestamp).toDateString() === day.toDateString()
            );
            if (dayEntries.length > 0) {
                const { hours, minutes } = calculateHoursWorked(dayEntries, profile?.id);
                const totalDecimal = hours + minutes / 60;

                if (totalDecimal > 0) daysWorked++;
                if (totalDecimal >= 8) perfectDays++;

                totalHours += totalDecimal;
            }
        });

        return {
            totalHours: Math.round(totalHours * 10) / 10,
            daysWorked,
            averageHours: daysWorked ? Math.round((totalHours / daysWorked) * 10) / 10 : 0
        };
    };

    const stats = getMonthlyStats();

    const handleDownloadReport = (formatType, reportType = 'monthly') => {
        const monthStr = format(selectedMonth, 'yyyy_MM');
        let fileName = `Mi_Reporte_${monthStr}`;
        let title = `Reporte Mensual: ${format(selectedMonth, 'MMMM yyyy', { locale: es })}`;

        if (reportType === 'incidents') {
            fileName = `Reporte_Incidencias_${monthStr}`;
            title = `Resumen de Incidencias: ${format(selectedMonth, 'MMMM yyyy', { locale: es })}`;
        }

        // Generate Detailed Data for Export
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        const monthEntries = MOCK_ATTENDANCE
            .filter(e => {
                const date = parseISO(e.timestamp);
                return e.user_id === profile?.id && isSameMonth(date, selectedMonth);
            })
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const exportData = monthEntries.map(entry => ({
            Fecha: format(parseISO(entry.timestamp), 'dd/MM/yyyy', { locale: es }),
            Hora: format(parseISO(entry.timestamp), 'HH:mm'),
            Tipo: entry.type === 'check_in' ? 'Entrada' : 'Salida',
            Detalle: entry.label || '-'
        }));

        if (formatType === 'Excel') {
            generateExcel(exportData, fileName);
        } else if (formatType === 'PDF') {
            const columns = ['Fecha', 'Hora', 'Tipo', 'Detalle'];
            const rows = exportData.map(d => [d.Fecha, d.Hora, d.Tipo, d.Detalle]);
            generatePDF(title, columns, rows, fileName);
        }
    };

    return (
        <div className="reports-page">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Reportes</h1>
                    <p className="page-subtitle">Visualiza y descarga tus informes de actividad</p>
                </div>
                <div className="month-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Button variant="ghost" icon={ChevronLeft} onClick={handlePrevMonth} className="btn-icon-only" aria-label="Mes anterior" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', minWidth: '140px', justifyContent: 'center' }}>
                        <Calendar size={18} />
                        <span style={{ textTransform: 'capitalize' }}>{format(selectedMonth, 'MMMM yyyy', { locale: es })}</span>
                    </div>
                    <Button variant="ghost" icon={ChevronRight} onClick={handleNextMonth} className="btn-icon-only" aria-label="Mes siguiente" />
                </div>
            </header>

            <div className="reports-stats-grid">
                <StatCard
                    icon={FileText}
                    iconColor="blue"
                    value={`${stats.totalHours}h`}
                    label="registradas"
                    subtitle="Total Horas"
                />
                <StatCard
                    icon={Calendar}
                    iconColor="green"
                    value={stats.daysWorked.toString()}
                    label="días"
                    subtitle="Días Trabajados"
                />
                <StatCard
                    icon={BarChart3}
                    iconColor="purple"
                    value={`${stats.averageHours}h`}
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
                                <span>Periodo: {format(startOfMonth(selectedMonth), 'dd MMM', { locale: es })} - {format(endOfMonth(selectedMonth), 'dd MMM yyyy', { locale: es })}</span>
                            </div>
                        </div>
                    </div>
                    <div className="report-actions">
                        <Button
                            variant="secondary"
                            icon={FileText}
                            onClick={() => handleDownloadReport('PDF', 'monthly')}
                        >
                            Descargar PDF
                        </Button>
                        <Button
                            variant="secondary"
                            icon={FileSpreadsheet}
                            onClick={() => handleDownloadReport('Excel', 'monthly')}
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
                            <div className="report-meta">
                                <span>Estado: Generado automáticamente</span>
                            </div>
                        </div>
                    </div>
                    <div className="report-actions">
                        <Button
                            variant="secondary"
                            icon={FileText}
                            onClick={() => handleDownloadReport('PDF', 'incidents')}
                        >
                            Descargar PDF
                        </Button>
                    </div>
                </Card>
            </div>

            {/* Detailed Table */}
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
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_ATTENDANCE
                                .filter(e => {
                                    const date = parseISO(e.timestamp);
                                    return e.user_id === profile?.id && isSameMonth(date, selectedMonth);
                                })
                                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                .map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{format(parseISO(entry.timestamp), 'dd/MM/yyyy', { locale: es })}</td>
                                        <td>{format(parseISO(entry.timestamp), 'EEEE', { locale: es })}</td>
                                        <td><strong>{format(parseISO(entry.timestamp), 'HH:mm')}</strong></td>
                                        <td>
                                            <span className={`type-badge ${entry.type}`}>
                                                {entry.type === 'check_in' ? 'Entrada' : 'Salida'}
                                            </span>
                                        </td>
                                        <td className="text-muted">{entry.label || '-'}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
                {MOCK_ATTENDANCE.filter(e => e.user_id === profile?.id && isSameMonth(parseISO(e.timestamp), selectedMonth)).length === 0 && (
                    <div className="empty-state">
                        <p>No hay registros para este mes.</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ReportsPage;
