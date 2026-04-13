import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Clock,
    TrendingUp,
    Activity,
    Timer,
    Play,
    PauseCircle,
    Square,
    MapPin,
    Search,
    Calendar,
    LogOut,
    Utensils,
    Stethoscope,
    MoreHorizontal,
    Coffee
} from 'lucide-react';
import { StatCard, Card, Button, Modal } from '../../components/ui';
import {
    MOCK_ATTENDANCE,
    MOCK_SETTINGS,
    getWeeklyHours
} from '../../lib/mockData';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip
} from 'recharts';
import { startOfDay, differenceInSeconds, parseISO, isSameDay } from 'date-fns';
import './DashboardPage.css';

/**
 * Employee Dashboard Page
 * Main dashboard matching Monitor.png design
 */
const DashboardPage = () => {
    const { profile } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());

    // States for work tracking
    const [isWorking, setIsWorking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [pauseReason, setPauseReason] = useState(null);
    const [currentSessionStart, setCurrentSessionStart] = useState(null);
    const [accumulatedSecondsToday, setAccumulatedSecondsToday] = useState(0);

    // Modal states
    // No modal state needed anymore
    // const [showClockModal, setShowClockModal] = useState(false);
    // const [clockType, setClockType] = useState('check_in');

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Helper: Get user entries for today
    const getTodayEntries = () => {
        const today = new Date();
        return MOCK_ATTENDANCE
            .filter(e => e.user_id === profile?.id && isSameDay(parseISO(e.timestamp), today))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    };

    // Calculate current status and accumulated time
    useEffect(() => {
        const todayEntries = getTodayEntries();

        let totalSeconds = 0;
        let lastIn = null;
        let working = false;
        let paused = false;
        let pReason = null;

        // Calculate closed sessions
        todayEntries.forEach(entry => {
            const entryTime = parseISO(entry.timestamp);

            if (entry.type === 'check_in') {
                lastIn = entryTime;
                working = true;
                paused = false;
                pReason = null;
            } else if (entry.type === 'check_out') {
                if (lastIn) {
                    totalSeconds += differenceInSeconds(entryTime, lastIn);
                    lastIn = null;
                }
                working = false;
                // Check if this exit is a "pause" (lunch)
                if (entry.label === 'comida') {
                    paused = true;
                    pReason = entry.label;
                }
            }
        });

        setAccumulatedSecondsToday(totalSeconds);
        setIsWorking(working);
        setIsPaused(paused);
        setPauseReason(pReason);
        if (working && lastIn) {
            setCurrentSessionStart(lastIn);
        } else {
            setCurrentSessionStart(null);
        }

    }, [profile?.id, currentTime]); // Re-calculating on currentTime update ensures we catch day changes, but main timer loop handles display

    // Check if within work schedule
    // Check if within work schedule (incorporating flexibility)
    const isWithinSchedule = () => {
        const schedule = profile?.work_schedule || MOCK_SETTINGS.work_schedule;
        if (!schedule) return true;

        const { start, end, days, flexibility_minutes } = schedule;
        const flex = flexibility_minutes || 0;
        const currentDay = currentTime.getDay();

        if (days && !days.includes(currentDay)) return false;

        const [startHour, startMinute] = start.split(':').map(Number);
        const [endHour, endMinute] = end.split(':').map(Number);

        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const minutesNow = currentHour * 60 + currentMinute;

        const minutesStart = startHour * 60 + startMinute;
        // Allowed Entry Window: Start -> Start + Flexibility
        const minutesEndWindow = minutesStart + flex;

        // If ALREADY working, we don't block "being in schedule".
        if (isWorking || isPaused) return true;

        // Validation for STARTING a shift:
        // Must be >= Start AND <= Start + Flex
        return minutesNow >= minutesStart && minutesNow <= minutesEndWindow;
    };

    // Calculate expected exit time based on check-in
    const getExpectedExitTime = () => {
        if (!currentSessionStart) return null;

        const schedule = profile?.work_schedule || MOCK_SETTINGS.work_schedule;
        if (!schedule) return null;

        const { start, end } = schedule;
        const [startHour, startMinute] = start.split(':').map(Number);
        const [endHour, endMinute] = end.split(':').map(Number);

        // Calculate standard duration in minutes
        const standardDuration = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

        const entryTime = new Date(currentSessionStart);
        const exitTime = new Date(entryTime.getTime() + standardDuration * 60000);

        return exitTime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get time display (formatted HH:MM)
    const getTimeDisplay = () => {
        return currentTime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get entry time display
    const getEntryTimeDisplay = () => {
        if (!currentSessionStart) return null;
        return currentSessionStart.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get greeting based on time
    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return 'Buenos días';
        if (hour < 20) return 'Buenas tardes';
        return 'Buenas noches';
    };

    // Calculate weekly stats
    const weeklyHours = getWeeklyHours(MOCK_ATTENDANCE, profile?.id);
    const totalWeeklyMinutes = weeklyHours.reduce((acc, d) => acc + d.hours * 60, 0);
    const weeklyHoursFormatted = `${Math.floor(totalWeeklyMinutes / 60)}h ${Math.round(totalWeeklyMinutes % 60)}m`;
    const daysWorked = weeklyHours.filter(d => d.hours > 0).length;
    const avgDaily = daysWorked > 0
        ? `${Math.floor(totalWeeklyMinutes / daysWorked / 60)}h ${Math.round((totalWeeklyMinutes / daysWorked) % 60)}m`
        : '0h 0m';

    // Unified handler for all clock actions
    const handleClockAction = (actionType, label = null) => {
        const newEntry = {
            id: `new-${Date.now()}`,
            user_id: profile?.id,
            timestamp: new Date().toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        };

        if (actionType === 'start' || actionType === 'resume') {
            newEntry.type = 'check_in';
            newEntry.label = 'normal';
            // Optimistic update
            MOCK_ATTENDANCE.push(newEntry);
            setIsWorking(true);
            setIsPaused(false);
            setPauseReason(null);
            setCurrentSessionStart(new Date());
        } else if (actionType === 'pause') {
            newEntry.type = 'check_out';
            newEntry.label = label || 'pause';
            // Optimistic update
            MOCK_ATTENDANCE.push(newEntry);
            setIsWorking(false);
            setCurrentSessionStart(null);
            setIsPaused(true);
            setPauseReason(label);
        } else if (actionType === 'finish') {
            newEntry.type = 'check_out';
            newEntry.label = 'normal';
            // Optimistic update
            MOCK_ATTENDANCE.push(newEntry);
            setIsWorking(false);
            setCurrentSessionStart(null);
            setIsPaused(false);
            setPauseReason(null);
        }
    };

    // Removed confirmClock function as it is now integrated into handleClockAction direct calls

    // Format current date
    const formattedDate = currentTime.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    const pauseOptions = [
        { id: 'comida', label: 'Comida', icon: Utensils, color: 'var(--color-warning)' },
        { id: 'descanso', label: 'Descanso', icon: Coffee, color: 'var(--color-info)' },
        { id: 'medico', label: 'Médico', icon: Stethoscope, color: 'var(--color-purple, #9F7AEA)' },
        { id: 'otro', label: 'Otra', icon: MoreHorizontal, color: 'var(--color-text-secondary)' },
    ];

    // Status config
    const getStatusConfig = () => {
        if (isWorking) return { label: 'En jornada', class: 'working' };
        if (isPaused) return { label: 'En pausa', class: 'paused' };
        return { label: 'Fuera de jornada', class: 'not-working' };
    };

    const statusConfig = getStatusConfig();

    return (
        <div className="dashboard-page">
            {/* Header */}
            <header className="dashboard-header">
                <div className="dashboard-greeting">
                    <span className="dashboard-greeting-time">{getGreeting()}</span>
                    <h1 className="dashboard-greeting-name">{profile?.name || 'Usuario'}</h1>
                </div>

                <div className="dashboard-title">
                    <h2>Control Horario</h2>
                    <p>¡Gestiona tu tiempo de trabajo!</p>
                </div>

                <div className="dashboard-header-actions">
                    <div className="dashboard-search">
                        <Search size={18} />
                        <input type="text" placeholder="Buscar..." />
                    </div>
                    <div className="dashboard-date">
                        <Calendar size={18} />
                        <span>{formattedDate}</span>
                    </div>
                    <span className="dashboard-today-badge">Hoy</span>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="dashboard-stats">
                <StatCard
                    icon={Clock}
                    iconColor="primary"
                    value={weeklyHoursFormatted}
                    label="esta semana"
                    subtitle="Horas Trabajadas"
                />
                <StatCard
                    icon={Activity}
                    iconColor="purple"
                    value={daysWorked.toString()}
                    label="días trabajados"
                    subtitle="Actividad"
                />
                <StatCard
                    icon={Timer}
                    iconColor="blue"
                    value={avgDaily}
                    label="por día"
                    subtitle="Media Diaria"
                />

                {/* Clock Control Card */}
                <Card className="dashboard-clock-card">
                    {/* Main Clock UI - No Modals */}
                    <div className="clock-controls-container">
                        <div className="dashboard-clock-header center-header">
                            <h3>Control de Jornada</h3>
                            <span className={`dashboard-clock-status-badge ${statusConfig.class}`}>
                                • {statusConfig.label} {pauseReason ? `(${pauseOptions.find(p => p.id === pauseReason)?.label || pauseReason})` : ''}
                            </span>
                        </div>

                        <div className="dashboard-clock-time major">
                            {getTimeDisplay()}
                            {currentSessionStart && (
                                <span className="timer-label" style={{ display: 'block', fontSize: '1rem', marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                    Entrada: {getEntryTimeDisplay()}
                                    {getExpectedExitTime() && (
                                        <span style={{ marginLeft: '10px', color: 'var(--color-primary)' }}>
                                            • Salida est: {getExpectedExitTime()}
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>

                        <div className="clock-actions-area">
                            {!isWorking && !isPaused ? (
                                /* START BUTTON */
                                <Button
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    className="btn-start-day"
                                    icon={Play}
                                    onClick={() => handleClockAction('start')}
                                    disabled={!isWithinSchedule()}
                                    title={!isWithinSchedule() ? "Fuera de horario laboral" : "Iniciar jornada"}
                                >
                                    {!isWithinSchedule() ? "Fuera de Horario" : "Iniciar Jornada"}
                                </Button>
                            ) : isPaused ? (
                                /* RESUME BUTTON */
                                <Button
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    className="btn-resume-day"
                                    icon={Play}
                                    onClick={() => handleClockAction('resume')}
                                >
                                    Reanudar Jornada
                                </Button>
                            ) : (
                                /* ACTIVE WORKING CONTROLS */
                                <div className="active-controls">
                                    <div className="pause-actions-grid">
                                        {pauseOptions.map(option => (
                                            <button
                                                key={option.id}
                                                className="pause-action-btn"
                                                onClick={() => handleClockAction('pause', option.id)}
                                                style={{ '--btn-color': option.color }}
                                            >
                                                <option.icon size={20} />
                                                <span>{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <Button
                                        variant="danger"
                                        size="lg"
                                        fullWidth
                                        className="btn-finish-day"
                                        icon={Square}
                                        onClick={() => handleClockAction('finish')}
                                    >
                                        Finalizar Jornada
                                    </Button>
                                    <div className="location-verified">
                                        <MapPin size={14} />
                                        <span>Ubicación verificada</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="dashboard-charts">
                <Card padding="md" className="dashboard-weekly-chart">
                    <h3>Horas Semanales</h3>
                    <div className="dashboard-chart-container">
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={weeklyHours}>
                                <XAxis
                                    dataKey="day"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                    domain={[0, 12]}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0D0D16',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: '#fff'
                                    }}
                                    formatter={(value) => [`${value}h`, 'Horas']}
                                />
                                <Bar
                                    dataKey="hours"
                                    fill="#BEFA3B"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={40}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="dashboard-chart-footer">
                        <span>Total: <strong>{weeklyHoursFormatted}</strong></span>
                        <span>Media: <strong>{avgDaily}/día</strong></span>
                    </div>
                </Card>

                <Card padding="md" className="dashboard-distribution">
                    <h3>Distribución Hoy</h3>
                    <div className="dashboard-distribution-list">
                        <div className="dashboard-distribution-item">
                            <span className="dashboard-distribution-label">Trabajo</span>
                            <div className="dashboard-distribution-bar">
                                <div className="dashboard-distribution-fill work" style={{ width: '75%' }}></div>
                            </div>
                            <span className="dashboard-distribution-value">6h 30m</span>
                        </div>
                        <div className="dashboard-distribution-item">
                            <span className="dashboard-distribution-label">Descanso</span>
                            <div className="dashboard-distribution-bar">
                                <div className="dashboard-distribution-fill break" style={{ width: '15%' }}></div>
                            </div>
                            <span className="dashboard-distribution-value">1h 00m</span>
                        </div>
                        <div className="dashboard-distribution-item">
                            <span className="dashboard-distribution-label">Otros</span>
                            <div className="dashboard-distribution-bar">
                                <div className="dashboard-distribution-fill other" style={{ width: '10%' }}></div>
                            </div>
                            <span className="dashboard-distribution-value">30m</span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Modal removed */}
        </div>
    );
};

export default DashboardPage;
