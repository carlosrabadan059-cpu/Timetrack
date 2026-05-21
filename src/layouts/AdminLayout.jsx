import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import HelpBot from '../components/HelpBot';
import './AdminLayout.css';

const AdminLayout = () => {
    return (
        <div className="admin-layout">
            <Sidebar variant="admin" />
            <main className="admin-main">
                <Outlet />
            </main>
            <HelpBot />
        </div>
    );
};

export default AdminLayout;
