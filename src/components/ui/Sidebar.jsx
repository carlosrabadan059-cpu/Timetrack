import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCorrections } from '../../contexts/CorrectionsContext';
import {
    LayoutDashboard,
    Clock,
    History,
    FileText,
    User,
    LogOut,
    Users,
    ClipboardList,
    BarChart3,
    Settings,
    Building2,
    ChevronUp,
    Calendar,
    CalendarRange,
} from 'lucide-react';
import './Sidebar.css';

/**
 * Sidebar Component
 * Dark navigation sidebar matching Monitor.png design
 */
const Sidebar = ({ variant = 'employee' }) => {
    const { profile, signOut } = useAuth();
    const { stats } = useCorrections();
    const navigate = useNavigate();

    const [confirmSignOut, setConfirmSignOut] = useState(false);

    const handleSignOut = async () => {
        if (!confirmSignOut) { setConfirmSignOut(true); return; }
        setConfirmSignOut(false);
        await signOut();
        navigate('/login');
    };

    // Calculate pending incidents from context
    const pendingIncidents = stats?.pending || 0;

    const employeeLinks = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/historial', icon: History, label: 'Historial' },
        { to: '/correcciones', icon: ClipboardList, label: 'Incidencias' },
        { to: '/vacaciones', icon: Calendar, label: 'Vacaciones' },
        { to: '/reportes', icon: FileText, label: 'Reportes' },
        { to: '/perfil', icon: User, label: 'Perfil' }
    ];

    const adminLinks = [
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/admin/empleados', icon: Users, label: 'Empleados' },
        { to: '/admin/fichajes', icon: Clock, label: 'Fichajes' },
        {
            to: '/admin/correcciones',
            icon: ClipboardList,
            label: 'Incidencias',
            badge: pendingIncidents > 0 ? pendingIncidents : null
        },
        { to: '/admin/vacaciones', icon: CalendarRange, label: 'Vacaciones' },
        { to: '/admin/informes', icon: BarChart3, label: 'Informes' },
        { to: '/admin/configuracion', icon: Settings, label: 'Configuración' }
    ];

    const superadminLinks = [
        { to: '/superadmin/empresas', icon: Building2, label: 'Empresas' },
    ];

    const links = variant === 'superadmin' ? superadminLinks : variant === 'admin' ? adminLinks : employeeLinks;

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <Clock size={24} className="sidebar-logo-icon" />
                    <span className="sidebar-logo-text">TimeTrack</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <ul className="sidebar-nav-list">
                    {links.map(({ to, icon: Icon, label, badge }) => (
                        <li key={to}>
                            <NavLink
                                to={to}
                                end={to === '/dashboard' || to === '/admin'}
                                className={({ isActive }) =>
                                    `sidebar-nav-link ${isActive ? 'active' : ''}`
                                }
                            >
                                <Icon size={20} />
                                <span>{label}</span>
                                {badge && <span className="sidebar-badge">{badge}</span>}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="sidebar-footer">


                <div className="sidebar-user">
                    <div className="sidebar-user-avatar">
                        {profile?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="sidebar-user-info">
                        <span className="sidebar-user-name">{profile?.name || 'Usuario'}</span>
                        <span className="sidebar-user-role">
                            {profile?.role === 'superadmin' ? 'Super Admin' : profile?.role === 'admin' ? 'Administrador' : 'Empleado'}
                        </span>
                    </div>
                    {confirmSignOut ? (
                        <div className="sidebar-signout-confirm">
                            <span>¿Cerrar sesión?</span>
                            <button className="sidebar-signout-yes" onClick={handleSignOut}>Sí</button>
                            <button className="sidebar-signout-no" onClick={() => setConfirmSignOut(false)}>No</button>
                        </div>
                    ) : (
                        <button
                            className="sidebar-user-action"
                            onClick={handleSignOut}
                            title="Cerrar sesión"
                        >
                            <ChevronUp size={18} />
                        </button>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
