import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import './AdminLayout.css';

const SuperAdminLayout = () => {
    return (
        <div className="admin-layout">
            <Sidebar variant="superadmin" />
            <main className="admin-main">
                <Outlet />
            </main>
        </div>
    );
};

export default SuperAdminLayout;
