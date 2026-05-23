import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCorrections } from '../../contexts/CorrectionsContext';
import { LayoutDashboard, History, ClipboardList, User, LogOut } from 'lucide-react';
import './MobileNav.css';

const MobileNav = () => {
    const { signOut } = useAuth();
    const { stats } = useCorrections();
    const navigate = useNavigate();
    const pending = stats?.pending || 0;
    const [confirmLogout, setConfirmLogout] = useState(false);

    const handleLogout = async () => {
        if (!confirmLogout) {
            setConfirmLogout(true);
            setTimeout(() => setConfirmLogout(false), 3000);
            return;
        }
        await signOut();
        navigate('/login');
    };

    const links = [
        { to: '/dashboard',    icon: LayoutDashboard, label: 'Inicio',      end: true },
        { to: '/historial',    icon: History,         label: 'Historial' },
        { to: '/correcciones', icon: ClipboardList,   label: 'Incidencias', badge: pending || null },
        { to: '/perfil',       icon: User,            label: 'Perfil' },
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
            <button
                className={`mobile-nav-item mobile-nav-logout${confirmLogout ? ' confirming' : ''}`}
                onClick={handleLogout}
                title={confirmLogout ? 'Toca de nuevo para confirmar' : 'Cerrar sesión'}
            >
                <span className="mobile-nav-icon">
                    <LogOut size={22} />
                </span>
                <span className="mobile-nav-label">Salir</span>
            </button>
        </nav>
    );
};

export default MobileNav;
