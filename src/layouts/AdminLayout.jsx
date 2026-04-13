import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import './AdminLayout.css';

/**
 * Admin Layout
 * Layout wrapper for admin pages with admin sidebar
 */
const AdminLayout = () => {
    return (
        <div className="admin-layout">
            <Sidebar variant="admin" />
            <main className="admin-main">
                <Outlet />
            </main>
        </div>
    );
};

export default AdminLayout;
