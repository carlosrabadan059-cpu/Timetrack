import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCorrections } from '../../contexts/CorrectionsContext';
import { LayoutDashboard, History, ClipboardList, User } from 'lucide-react';
import './MobileNav.css';

const MobileNav = () => {
    const { stats } = useCorrections();
    const pending = stats?.pending || 0;

    const links = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio', end: true },
        { to: '/historial',   icon: History,         label: 'Historial' },
        { to: '/correcciones', icon: ClipboardList,  label: 'Incidencias', badge: pending || null },
        { to: '/perfil',      icon: User,            label: 'Perfil' },
    ];

    return (
        <nav className="mobile-nav">
            {links.map(({ to, icon: Icon, label, badge, end }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
                >
                    <span className="mobile-nav-icon">
                        <Icon size={22} />
                        {badge ? <span className="mobile-nav-badge">{badge}</span> : null}
                    </span>
                    <span className="mobile-nav-label">{label}</span>
                </NavLink>
            ))}
        </nav>
    );
};

export default MobileNav;
