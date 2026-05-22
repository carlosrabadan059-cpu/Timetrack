import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Clock, AlertTriangle } from 'lucide-react';
import { StatCard, Card } from '../../components/ui';
import { api } from '../../lib/api';
import './AdminDashboardPage.css';

function fmtTime(ts) {
    if (!ts) return null;
    return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

const AdminDashboardPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadDashboard = useCallback(async () => {
        try {
            const res = await api.get('/api/admin/dashboard');
            setData(res.data);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
        const interval = setInterval(loadDashboard, 30_000);
        return () => clearInterval(interval);
    }, [loadDashboard]);

    return (
        <div className="admin-dashboard">
            <header className="admin-dashboard-header">
                <div>
                    <h1>Panel de Administración</h1>
                    <p className="text-muted">Vista general del estado de los empleados</p>
                </div>
            </header>

            <div className="admin-stats">
                <StatCard
                    icon={Users}
                    iconColor="primary"
                    value={String(data?.employees_total ?? 0)}
                    label="total"
                    subtitle="Empleados"
                    onClick={() => navigate('/admin/empleados')}
                />
                <StatCard
                    icon={Clock}
                    iconColor="green"
                    value={String(data?.employees_working ?? 0)}
                    label="trabajando ahora"
                    subtitle="En Jornada"
                    onClick={() => navigate('/admin/fichajes')}
                />
                <StatCard
                    icon={AlertTriangle}
                    iconColor="orange"
                    value={String(data?.incidencias_pending ?? 0)}
                    label="pendientes"
                    subtitle="Incidencias"
                    onClick={() => navigate('/admin/correcciones')}
                />
            </div>

            <section className="admin-employees-section">
                <div className="section-header">
                    <h2>Estado de Empleados</h2>
                    <span className="section-subtitle">Hoy</span>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                        Cargando...
                    </div>
                ) : (
                    <div className="employee-grid">
                        {(data?.employee_statuses ?? []).length === 0 ? (
                            <p style={{ color: 'var(--color-text-muted)', gridColumn: '1/-1' }}>
                                No hay empleados registrados.
                            </p>
                        ) : (
                            (data?.employee_statuses ?? []).map((emp) => (
                                <Card key={emp.id} padding="md" className="employee-status-card clickable" onClick={() => navigate(`/admin/empleados/${emp.id}`)}>
                                    <div className="employee-card-header">
                                        <div className="employee-avatar">
                                            {emp.full_name?.charAt(0)?.toUpperCase() || 'U'}
                                        </div>
                                        <div className="employee-info">
                                            <span className="employee-name">{emp.full_name}</span>
                                            <span className={`employee-status ${emp.is_inside ? 'status-in' : 'status-out'}`}>
                                                • {emp.is_inside ? 'En jornada' : 'Fuera de jornada'}
                                            </span>
                                        </div>
                                    </div>

                                    {emp.is_inside && emp.jornada_started_at && (
                                        <div className="employee-since">
                                            <Clock size={14} />
                                            Desde {fmtTime(emp.jornada_started_at)}
                                        </div>
                                    )}
                                </Card>
                            ))
                        )}
                    </div>
                )}
            </section>

            <section className="admin-activity-section">
                <div className="section-header">
                    <h2>Actividad Reciente</h2>
                </div>

                <Card padding="none">
                    <div className="activity-list">
                        {(data?.recent_activity ?? []).length === 0 && !loading ? (
                            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                Sin actividad reciente
                            </div>
                        ) : (
                            (data?.recent_activity ?? []).map((entry) => (
                                <div key={entry.id} className="activity-item">
                                    <div className="activity-avatar">
                                        {entry.user_name?.charAt(0)?.toUpperCase() || 'U'}
                                    </div>
                                    <div className="activity-content">
                                        <span className="activity-user">{entry.user_name}</span>
                                        <span className="activity-action">
                                            {entry.direction === 'in' ? 'fichó entrada' : 'fichó salida'}
                                        </span>
                                    </div>
                                    <div className="activity-meta">
                                        <span className="activity-time">{fmtTime(entry.timestamp)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </section>
        </div>
    );
};

export default AdminDashboardPage;
