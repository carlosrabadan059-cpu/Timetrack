import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import './EmployeeLayout.css';

/**
 * Employee Layout
 * Main layout wrapper for employee pages with sidebar
 */
const EmployeeLayout = () => {
    return (
        <div className="employee-layout">
            <Sidebar variant="employee" />
            <main className="employee-main">
                <Outlet />
            </main>
        </div>
    );
};

export default EmployeeLayout;
