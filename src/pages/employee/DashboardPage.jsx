import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
    Clock, Activity, Timer, Play, Square,
    MapPin, Search, Calendar, Utensils, Stethoscope, MoreHorizontal, Coffee
} from 'lucide-react';
import { StatCard, Card, Button } from '../../components/ui';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import './DashboardPage.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getDeviceInfo() {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'web';
}

function fmtMinutes(mins) {
    if (!mins) return '0h 0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

const pauseOptions = [
    { id: 'comida',   label: 'Comida',   icon: Utensils,      color: 'var(--color-warning)' },
    { id: 'descanso', label: 'Descanso', icon: Coffee,         color: 'var(--color-info)' },
    { id: 'medico',   label: 'Médico',   icon: Stethoscope,    color: 'var(--color-purple, #9F7AEA)' },
    { id: 'otro',     label: 'Otra',     icon: MoreHorizontal, color: 'var(--color-text-secondary)' },
];

const DashboardPage = () => {
    const { profile } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [dashData, setDashData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ficharLoading, setFicharLoading] = useState(false);
    const [ficharError, setFicharError] = useState('');
    const [currentPauseType, setCurrentPauseType] = useState(null);
    const ficharErrorTimer = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => () => clearTimeout(ficharErrorTimer.current), []);

    const loadDashboard = useCallback(async () => {
        try {
            const res = await api.get('/api/me/dashboard');
            setDashData(res.data);
            setCurrentPauseType(res.data.current_pause_type ?? null);
        } catch {
            // keep showing previous data on transient errors
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    // SSE for live events from 2N reader
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
                            if (event.type === 'access_event') loadDashboard();
                        } catch { /* malformed SSE line */ }
                    }
                }
            } catch (err) {
                if (err.name !== 'AbortError') setTimeout(connect, 5000);
            }
        }

        connect();
        return () => ctrl.abort();
    }, [loadDashboard]);

    const PAUSE_TYPES = new Set(['comida', 'descanso', 'medico', 'otro']);

    const handleFichar = async (detailType = null) => {
        setFicharLoading(true);
        setFicharError('');
        try {
            const body = { device_info: getDeviceInfo(), ...(detailType ? { detail_type: detailType } : {}) };
            const res = await api.post('/api/me/fichar', body);
            const { direction, detail_type, is_inside, timestamp } = res.data;
            const newStatus =
                direction === 'in' ? 'working' :
                PAUSE_TYPES.has(detail_type) ? 'paused' : 'out';
            setDashData(prev => prev ? {
                ...prev,
                is_inside,
                jornada_status: newStatus,
                jornada_started_at:
                    direction === 'in'
                        ? (prev.jornada_started_at || timestamp)
                        : prev.jornada_started_at,
            } : prev);
            setCurrentPauseType(newStatus === 'paused' ? detail_type : null);
            loadDashboard();
        } catch (e) {
            setFicharError(e.message);
            if (e.code === 'rate_limit') {
                const match = e.message.match(/\d+/);
                const secs = match ? parseInt(match[0], 10) : 30;
                clearTimeout(ficharErrorTimer.current);
                ficharErrorTimer.current = setTimeout(() => setFicharError(''), secs * 1000);
            }
        } finally {
            setFicharLoading(false);
        }
    };

    const isWorking = dashData?.jornada_status === 'working';
    const isPaused  = dashData?.jornada_status === 'paused';

    const weeklyBars = (dashData?.weekly_bars ?? []).map(b => ({
        day: b.day,
        hours: parseFloat((b.minutes / 60).toFixed(1)),
    }));

    const dist = dashData?.today_distribution ?? { trabajo_minutes: 0, descanso_minutes: 0, otros_minutes: 0 };
    const distTotal = (dist.trabajo_minutes + dist.descanso_minutes + dist.otros_minutes) || 1;
    const distItems = [
        { label: 'Trabajo',  key: 'trabajo_minutes',  cls: 'work' },
        { label: 'Descanso', key: 'descanso_minutes',  cls: 'break' },
        { label: 'Otros',    key: 'otros_minutes',     cls: 'other' },
    ];

    const activePauseOption = isPaused && currentPauseType
        ? pauseOptions.find(o => o.id === currentPauseType)
        : null;

    const statusConfig = isWorking
        ? { label: 'En jornada',      class: 'working',     color: null }
        : isPaused
        ? {
            label: activePauseOption ? `En ${activePauseOption.label.toLowerCase()}` : 'En pausa',
            class: 'paused',
            color: activePauseOption?.color ?? null,
          }
        : { label: 'Fuera de jornada', class: 'not-working', color: null };

    const getGreeting = () => {
        const h = currentTime.getHours();
        return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    };

    const getTimeDisplay = () =>
        currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const getEntryTimeDisplay = () => {
        if (!dashData?.jornada_started_at) return null;
        return new Date(dashData.jornada_started_at)
            .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const formattedDate = currentTime.toLocaleDateString('es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
    });

    if (loading) {
        return (
            <div className="dashboard-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{ width: 40, height: 40, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <div className="dashboard-greeting">
                    <span className="dashboard-greeting-time">{getGreeting()}</span>
                    <h1 className="dashboard-greeting-name">{profile?.name || profile?.full_name || 'Usuario'}</h1>
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

            <div className="dashboard-stats">
                <StatCard
                    icon={Clock}
                    iconColor="primary"
                    value={fmtMinutes(dashData?.week_total_minutes)}
                    label="esta semana"
                    subtitle="Horas Trabajadas"
                />
                <StatCard
                    icon={Activity}
                    iconColor="purple"
                    value={String(dashData?.days_worked_this_week ?? 0)}
                    label="días trabajados"
                    subtitle="Actividad"
                />
                <StatCard
                    icon={Timer}
                    iconColor="blue"
                    value={fmtMinutes(dashData?.daily_average_minutes)}
                    label="por día"
                    subtitle="Media Diaria"
                />

                <Card className="dashboard-clock-card">
                    <div className="clock-controls-container">
                        <div className="dashboard-clock-header center-header">
                            <h3>Control de Jornada</h3>
                            <span
                                className={`dashboard-clock-status-badge ${statusConfig.class}`}
                                style={statusConfig.color ? { color: statusConfig.color } : undefined}
                            >
                                • {statusConfig.label}
                            </span>
                        </div>

                        <div className="dashboard-clock-time major">
                            {getTimeDisplay()}
                            {getEntryTimeDisplay() && (
                                <span className="timer-label" style={{ display: 'block', fontSize: '1rem', marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                    Entrada: {getEntryTimeDisplay()}
                                </span>
                            )}
                        </div>

                        {ficharError && (
                            <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: 'var(--font-size-sm)', textAlign: 'center', margin: '0 0 var(--space-3)' }}>
                                {ficharError}
                            </p>
                        )}

                        <div className="clock-actions-area">
                            {!isWorking && !isPaused ? (
                                <Button variant="primary" size="lg" fullWidth className="btn-start-day" icon={Play} onClick={() => handleFichar()} loading={ficharLoading}>
                                    Iniciar Jornada
                                </Button>
                            ) : isPaused ? (
                                <Button variant="primary" size="lg" fullWidth className="btn-resume-day" icon={Play} onClick={() => handleFichar()} loading={ficharLoading}>
                                    Reanudar Jornada
                                </Button>
                            ) : (
                                <div className="active-controls">
                                    <div className="pause-actions-grid">
                                        {pauseOptions.map(option => (
                                            <button
                                                key={option.id}
                                                className="pause-action-btn"
                                                onClick={() => handleFichar(option.id)}
                                                style={{ '--btn-color': option.color }}
                                                disabled={ficharLoading}
                                            >
                                                <option.icon size={20} />
                                                <span>{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <Button variant="danger" size="lg" fullWidth className="btn-finish-day" icon={Square} onClick={() => handleFichar()} loading={ficharLoading}>
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

            <div className="dashboard-charts">
                <Card padding="md" className="dashboard-weekly-chart">
                    <h3>Horas Semanales</h3>
                    <div className="dashboard-chart-container">
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={weeklyBars}>
                                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} domain={[0, 12]} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0D0D16', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    formatter={(value) => [`${value}h`, 'Horas']}
                                />
                                <Bar dataKey="hours" fill="#BEFA3B" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="dashboard-chart-footer">
                        <span>Total: <strong>{fmtMinutes(dashData?.week_total_minutes)}</strong></span>
                        <span>Media: <strong>{fmtMinutes(dashData?.daily_average_minutes)}/día</strong></span>
                    </div>
                </Card>

                <Card padding="md" className="dashboard-distribution">
                    <h3>Distribución Hoy</h3>
                    <div className="dashboard-distribution-list">
                        {distItems.map(({ label, key, cls }) => {
                            const mins = dist[key] ?? 0;
                            const pct = Math.round((mins / distTotal) * 100);
                            return (
                                <div key={key} className="dashboard-distribution-item">
                                    <span className="dashboard-distribution-label">{label}</span>
                                    <div className="dashboard-distribution-bar">
                                        <div className={`dashboard-distribution-fill ${cls}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="dashboard-distribution-value">{fmtMinutes(mins)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default DashboardPage;
