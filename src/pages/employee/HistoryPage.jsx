import { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Calendar,
    Clock,
    MapPin,
    Filter,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Download,
    FileSpreadsheet,
    TrendingUp,
    Timer,
    CheckCircle,
    X
} from 'lucide-react';
import { Card, Button, Modal } from '../../components/ui';
import { MOCK_ATTENDANCE, calculateHoursWorked } from '../../lib/mockData';
import {
    format,
    parseISO,
    isToday,
    isYesterday,
    startOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    isWithinInterval,
    differenceInMinutes,
    subDays
} from 'date-fns';
import { generateExcel } from '../../lib/exportUtils';
import { es } from 'date-fns/locale';
import './HistoryPage.css';

/**
 * History Page
 * Vista completa del historial de fichajes del empleado
 */
const HistoryPage = () => {
    const { profile } = useAuth();
    const [expandedDay, setExpandedDay] = useState(null);
    const [filterType, setFilterType] = useState('all');
    const [dateRange, setDateRange] = useState('week'); // week, month, custom
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showFilterModal, setShowFilterModal] = useState(false);

    // Calcular rango de fechas según el filtro
    const getDateRange = () => {
        const today = new Date();
        switch (dateRange) {
            case 'week':
                return {
                    start: startOfWeek(today, { weekStartsOn: 1 }),
                    end: endOfWeek(today, { weekStartsOn: 1 })
                };
            case 'month':
                return {
                    start: startOfMonth(today),
                    end: endOfMonth(today)
                };
            case 'last7':
                return {
                    start: subDays(today, 7),
                    end: today
                };
            case 'last30':
                return {
                    start: subDays(today, 30),
                    end: today
                };
            case 'custom':
                return {
                    start: customStart ? parseISO(customStart) : subDays(today, 30),
                    end: customEnd ? parseISO(customEnd) : today
                };
            default:
                return {
                    start: startOfWeek(today, { weekStartsOn: 1 }),
                    end: endOfWeek(today, { weekStartsOn: 1 })
                };
        }
    };

    // Filtrar entradas por usuario y rango de fechas
    const { start, end } = getDateRange();

    const userEntries = useMemo(() => {
        return MOCK_ATTENDANCE
            .filter(e => {
                if (e.user_id !== profile?.id) return false;
                const entryDate = parseISO(e.timestamp);
                return isWithinInterval(entryDate, { start, end });
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }, [profile?.id, start, end]);

    // Agrupar entradas por día
    const groupedByDay = useMemo(() => {
        return userEntries.reduce((acc, entry) => {
            const day = startOfDay(parseISO(entry.timestamp)).toISOString();
            if (!acc[day]) {
                acc[day] = [];
            }
            acc[day].push(entry);
            return acc;
        }, {});
    }, [userEntries]);

    // Calcular estadísticas del período
    const periodStats = useMemo(() => {
        let totalMinutes = 0;
        let daysWorked = 0;
        let outOfZoneCount = 0;
        let totalEntries = 0;

        Object.entries(groupedByDay).forEach(([day, entries]) => {
            // Ordenar entradas del día
            const sortedEntries = [...entries].sort((a, b) =>
                new Date(a.timestamp) - new Date(b.timestamp)
            );

            let lastCheckIn = null;
            let dayMinutes = 0;

            sortedEntries.forEach(entry => {
                if (entry.type === 'check_in') {
                    lastCheckIn = parseISO(entry.timestamp);
                } else if (entry.type === 'check_out' && lastCheckIn) {
                    dayMinutes += differenceInMinutes(parseISO(entry.timestamp), lastCheckIn);
                    lastCheckIn = null;
                }
                if (!entry.is_in_zone) outOfZoneCount++;
                totalEntries++;
            });

            if (dayMinutes > 0) {
                totalMinutes += dayMinutes;
                daysWorked++;
            }
        });

        const avgMinutesPerDay = daysWorked > 0 ? totalMinutes / daysWorked : 0;

        return {
            totalHours: Math.floor(totalMinutes / 60),
            totalMinutes: totalMinutes % 60,
            daysWorked,
            avgHours: Math.floor(avgMinutesPerDay / 60),
            avgMinutes: Math.round(avgMinutesPerDay % 60),
            outOfZoneCount,
            totalEntries
        };
    }, [groupedByDay]);

    // Calcular horas trabajadas en un día específico
    const calculateDayHours = (entries) => {
        const sortedEntries = [...entries].sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        let totalMinutes = 0;
        let lastCheckIn = null;

        sortedEntries.forEach(entry => {
            if (entry.type === 'check_in') {
                lastCheckIn = parseISO(entry.timestamp);
            } else if (entry.type === 'check_out' && lastCheckIn) {
                totalMinutes += differenceInMinutes(parseISO(entry.timestamp), lastCheckIn);
                lastCheckIn = null;
            }
        });

        // Si todavía está fichado, contar hasta ahora
        if (lastCheckIn) {
            totalMinutes += differenceInMinutes(new Date(), lastCheckIn);
        }

        return {
            hours: Math.floor(totalMinutes / 60),
            minutes: totalMinutes % 60,
            isActive: lastCheckIn !== null
        };
    };

    // Formatear etiqueta del día
    const formatDayLabel = (dateStr) => {
        const date = parseISO(dateStr);
        if (isToday(date)) return 'Hoy';
        if (isYesterday(date)) return 'Ayer';
        return format(date, "EEEE, d 'de' MMMM", { locale: es });
    };

    // Obtener etiqueta del tipo
    const getTypeLabel = (type) => {
        switch (type) {
            case 'check_in': return 'Entrada';
            case 'check_out': return 'Salida';
            default: return type;
        }
    };

    // Obtener badge de etiqueta
    const getLabelBadge = (label) => {
        switch (label) {
            case 'normal': return { text: 'Normal', class: 'badge-neutral' };
            case 'comida': return { text: 'Comida', class: 'badge-warning' };
            case 'medico': return { text: 'Médico', class: 'badge-info' };
            case 'otro': return { text: 'Otro', class: 'badge-neutral' };
            default: return { text: label, class: 'badge-neutral' };
        }
    };

    const toggleDay = (day) => {
        setExpandedDay(expandedDay === day ? null : day);
    };

    const getRangeLabel = () => {
        switch (dateRange) {
            case 'week': return 'Esta semana';
            case 'month': return 'Este mes';
            case 'last7': return 'Últimos 7 días';
            case 'last30': return 'Últimos 30 días';
            case 'custom': return 'Personalizado';
            default: return 'Esta semana';
        }
    };

    // Filtrar entradas por tipo
    const getFilteredEntries = (entries) => {
        if (filterType === 'all') return entries;
        return entries.filter(e => e.type === filterType);
    };

    // Exportar datos actuales
    const handleExport = () => {
        const safeName = profile?.name?.replace(/\s+/g, '_') || 'Usuario';
        const dateStr = `${format(start, 'yyyyMMdd')}_${format(end, 'yyyyMMdd')}`;
        const fileName = `Fichajes_${safeName}_${dateStr}`;
        // console.log('Generando Excel con nombre:', fileName);

        const dataToExport = userEntries.map(entry => ({
            Fecha: format(parseISO(entry.timestamp), 'dd/MM/yyyy', { locale: es }),
            Hora: format(parseISO(entry.timestamp), 'HH:mm'),
            Tipo: getTypeLabel(entry.type),
            Etiqueta: getLabelBadge(entry.label).text,
            Ubicacion: entry.is_in_zone ? 'En zona' : 'Fuera de zona',
            Dispositivo: entry.origin
        }));

        generateExcel(dataToExport, fileName);
    };

    return (
        <div className="history-page">
            {/* Header */}
            <header className="history-header">
                <div>
                    <h1>Historial de Fichajes</h1>
                    <p className="text-muted">
                        Consulta tus registros | {format(start, "d MMM", { locale: es })} - {format(end, "d MMM yyyy", { locale: es })}
                    </p>
                </div>

                <div className="history-actions">
                    <Button
                        variant="secondary"
                        icon={Filter}
                        onClick={() => setShowFilterModal(true)}
                    >
                        {getRangeLabel()}
                    </Button>
                    <Button
                        variant="secondary"
                        icon={FileSpreadsheet}
                        onClick={handleExport}
                    >
                        Exportar Excel
                    </Button>
                </div>
            </header>

            {/* Estadísticas del período */}
            <div className="history-stats">
                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-primary">
                        <Timer size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">
                            {periodStats.totalHours}h {periodStats.totalMinutes}m
                        </span>
                        <span className="stat-label">Total trabajado</span>
                    </div>
                </Card>

                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-green">
                        <Calendar size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{periodStats.daysWorked}</span>
                        <span className="stat-label">Días trabajados</span>
                    </div>
                </Card>

                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-purple">
                        <TrendingUp size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">
                            {periodStats.avgHours}h {periodStats.avgMinutes}m
                        </span>
                        <span className="stat-label">Media por día</span>
                    </div>
                </Card>

                <Card padding="md" className="history-stat-card">
                    <div className="stat-icon stat-icon-orange">
                        <CheckCircle size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{periodStats.totalEntries}</span>
                        <span className="stat-label">Total fichajes</span>
                    </div>
                </Card>
            </div>

            {/* Filtro de tipo */}
            <div className="history-type-filter">
                <button
                    className={`type-filter-btn ${filterType === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterType('all')}
                >
                    Todos
                </button>
                <button
                    className={`type-filter-btn ${filterType === 'check_in' ? 'active' : ''}`}
                    onClick={() => setFilterType('check_in')}
                >
                    Entradas
                </button>
                <button
                    className={`type-filter-btn ${filterType === 'check_out' ? 'active' : ''}`}
                    onClick={() => setFilterType('check_out')}
                >
                    Salidas
                </button>
            </div>

            {/* Lista de días */}
            <div className="history-list">
                {Object.entries(groupedByDay).map(([day, entries]) => {
                    const isExpanded = expandedDay === day;
                    const filteredEntries = getFilteredEntries(entries);
                    const dayHours = calculateDayHours(entries);

                    if (filteredEntries.length === 0) return null;

                    return (
                        <Card key={day} padding="none" className="history-day-card">
                            <button
                                className="history-day-header"
                                onClick={() => toggleDay(day)}
                            >
                                <div className="history-day-info">
                                    <Calendar size={18} />
                                    <span className="history-day-label">
                                        {formatDayLabel(day)}
                                    </span>
                                    <span className="history-day-count">
                                        {filteredEntries.length} fichajes
                                    </span>
                                </div>

                                <div className="history-day-summary">
                                    <span className={`history-day-hours ${dayHours.isActive ? 'active' : ''}`}>
                                        <Clock size={14} />
                                        {dayHours.hours}h {dayHours.minutes}m
                                        {dayHours.isActive && <span className="pulse-dot" />}
                                    </span>
                                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="history-day-entries">
                                    {/* Timeline */}
                                    <div className="history-timeline">
                                        {filteredEntries
                                            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                                            .map((entry, index) => {
                                                const badge = getLabelBadge(entry.label);
                                                const isFirst = index === 0;
                                                const isLast = index === filteredEntries.length - 1;

                                                return (
                                                    <div
                                                        key={entry.id}
                                                        className={`timeline-entry ${entry.type} ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}`}
                                                    >
                                                        <div className="timeline-marker">
                                                            <div className={`timeline-dot ${entry.type}`} />
                                                            {!isLast && <div className="timeline-line" />}
                                                        </div>

                                                        <div className="timeline-content">
                                                            <div className="timeline-header">
                                                                <span className="timeline-time">
                                                                    {format(parseISO(entry.timestamp), 'HH:mm', { locale: es })}
                                                                </span>
                                                                <span className={`timeline-type-badge ${entry.type}`}>
                                                                    {getTypeLabel(entry.type)}
                                                                </span>
                                                            </div>

                                                            <div className="timeline-details">
                                                                <span className={`badge ${badge.class}`}>
                                                                    {badge.text}
                                                                </span>

                                                                <span className="timeline-location">
                                                                    <MapPin size={12} />
                                                                    {entry.is_in_zone ? (
                                                                        <span className="location-ok">En zona</span>
                                                                    ) : (
                                                                        <span className="location-warning">
                                                                            <AlertCircle size={12} />
                                                                            Fuera de zona
                                                                        </span>
                                                                    )}
                                                                </span>

                                                                <span className="timeline-origin">
                                                                    {entry.origin === 'web' ? '🖥️' : '📱'}
                                                                </span>
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
                })}

                {Object.keys(groupedByDay).length === 0 && (
                    <Card padding="lg" className="history-empty">
                        <Clock size={48} className="text-muted" />
                        <h3>Sin registros</h3>
                        <p className="text-muted">No hay fichajes en el período seleccionado</p>
                    </Card>
                )}
            </div>

            {/* Modal de filtros */}
            <Modal
                isOpen={showFilterModal}
                onClose={() => setShowFilterModal(false)}
                title="Filtrar por período"
                size="sm"
            >
                <div className="filter-modal-content">
                    <div className="filter-options">
                        {[
                            { value: 'week', label: 'Esta semana' },
                            { value: 'month', label: 'Este mes' },
                            { value: 'last7', label: 'Últimos 7 días' },
                            { value: 'last30', label: 'Últimos 30 días' },
                            { value: 'custom', label: 'Personalizado' }
                        ].map(option => (
                            <button
                                key={option.value}
                                className={`filter-option ${dateRange === option.value ? 'active' : ''}`}
                                onClick={() => setDateRange(option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="custom-date-range">
                            <div className="date-input-group">
                                <label>Desde</label>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                />
                            </div>
                            <div className="date-input-group">
                                <label>Hasta</label>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="filter-modal-actions">
                        <Button
                            variant="primary"
                            fullWidth
                            onClick={() => setShowFilterModal(false)}
                        >
                            Aplicar filtro
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default HistoryPage;
