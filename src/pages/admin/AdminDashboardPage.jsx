import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users,
    Clock,
    AlertTriangle,
    TrendingUp,
    MapPin,
    MoreVertical
} from 'lucide-react';
import { StatCard, Card, Button } from '../../components/ui';
import { MOCK_USERS, MOCK_ATTENDANCE, MOCK_CORRECTIONS, getCurrentStatus } from '../../lib/mockData';
import './AdminDashboardPage.css';

/**
 * Admin Dashboard Page
 * Real-time employee status and overview
 */
const AdminDashboardPage = () => {
    const navigate = useNavigate();

    // Get all employees (not admins)
    const employees = MOCK_USERS.filter(u => u.profile.role === 'employee');

    // Calculate stats
    const employeeStatuses = employees.map(emp => ({
        ...emp.profile,
        status: getCurrentStatus(MOCK_ATTENDANCE, emp.id)
    }));

    const workingCount = employeeStatuses.filter(e => e.status.status === 'in').length;
    const outCount = employeeStatuses.filter(e => e.status.status === 'out').length;

    // Out of zone entries today
    const today = new Date().toDateString();
    const outOfZoneToday = MOCK_ATTENDANCE.filter(e => {
        const entryDate = new Date(e.timestamp).toDateString();
        return entryDate === today && !e.is_in_zone;
    }).length;

    const getStatusColor = (status) => {
        switch (status) {
            case 'in': return 'status-in';
            case 'out': return 'status-out';
            default: return '';
        }
    };

    return (
        <div className="admin-dashboard">
            <header className="admin-dashboard-header">
                <div>
                    <h1>Panel de Administración</h1>
                    <p className="text-muted">Vista general del estado de los empleados</p>
                </div>
            </header>

            {/* Stats */}
            <div className="admin-stats">
                <StatCard
                    icon={Users}
                    iconColor="primary"
                    value={employees.length.toString()}
                    label="total"
                    subtitle="Empleados"
                    onClick={() => navigate('/admin/empleados')}
                />
                <StatCard
                    icon={Clock}
                    iconColor="green"
                    value={workingCount.toString()}
                    label="trabajando ahora"
                    subtitle="En Jornada"
                    onClick={() => navigate('/admin/fichajes')}
                />
                <StatCard
                    icon={AlertTriangle}
                    iconColor="orange"
                    value={MOCK_CORRECTIONS.filter(c => c.status === 'pending').length.toString()}
                    label="pendientes"
                    subtitle="Incidencias"
                    onClick={() => navigate('/admin/correcciones')}
                />
                <StatCard
                    icon={MapPin}
                    iconColor="purple"
                    value={outOfZoneToday.toString()}
                    label="fichajes hoy"
                    subtitle="Fuera de Zona"
                    onClick={() => navigate('/admin/fichajes')}
                />
            </div>

            {/* Employee Status Grid */}
            <section className="admin-employees-section">
                <div className="section-header">
                    <h2>Estado de Empleados</h2>
                    <span className="section-subtitle">En tiempo real</span>
                </div>

                <div className="employee-grid">
                    {employeeStatuses.map((emp) => (
                        <Card key={emp.id} padding="md" className="employee-status-card">
                            <div className="employee-card-header">
                                <div className="employee-avatar">
                                    {emp.name?.charAt(0) || 'U'}
                                </div>
                                <div className="employee-info">
                                    <span className="employee-name">{emp.name}</span>
                                    <span className={`employee-status ${getStatusColor(emp.status.status)}`}>
                                        • {emp.status.label}
                                    </span>
                                </div>
                                <button className="employee-action">
                                    <MoreVertical size={18} />
                                </button>
                            </div>

                            {emp.status.status === 'in' && emp.status.since && (
                                <div className="employee-since">
                                    <Clock size={14} />
                                    Desde {new Date(emp.status.since).toLocaleTimeString('es-ES', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            </section>

            {/* Recent Activity */}
            <section className="admin-activity-section">
                <div className="section-header">
                    <h2>Actividad Reciente</h2>
                    <Button variant="ghost" size="sm">Ver todo</Button>
                </div>

                <Card padding="none">
                    <div className="activity-list">
                        {MOCK_ATTENDANCE.slice(0, 5).map((entry, idx) => {
                            const user = MOCK_USERS.find(u => u.id === entry.user_id);
                            return (
                                <div key={idx} className="activity-item">
                                    <div className="activity-avatar">
                                        {user?.profile?.name?.charAt(0) || 'U'}
                                    </div>
                                    <div className="activity-content">
                                        <span className="activity-user">{user?.profile?.name}</span>
                                        <span className="activity-action">
                                            {entry.type === 'check_in' ? 'fichó entrada' : 'fichó salida'}
                                        </span>
                                    </div>
                                    <div className="activity-meta">
                                        <span className="activity-time">
                                            {new Date(entry.timestamp).toLocaleTimeString('es-ES', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                        {!entry.is_in_zone && (
                                            <span className="activity-warning">
                                                <MapPin size={12} /> Fuera de zona
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </section>
        </div>
    );
};

export default AdminDashboardPage;
