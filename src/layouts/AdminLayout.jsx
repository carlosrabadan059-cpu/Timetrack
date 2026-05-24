import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import MobileNav from '../components/ui/MobileNav';
import HelpBot from '../components/HelpBot';
import './AdminLayout.css';

const AdminLayout = () => {
    return (
        <div className="admin-layout">
            <Sidebar variant="admin" />
            <main className="admin-main">
                <Outlet />
            </main>
            <MobileNav variant="admin" />
            <HelpBot />
        </div>
    );
};

export default AdminLayout;
