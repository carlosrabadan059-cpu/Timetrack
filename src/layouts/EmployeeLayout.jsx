import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import MobileNav from '../components/ui/MobileNav';
import HelpBot from '../components/HelpBot';
import './EmployeeLayout.css';

const EmployeeLayout = () => {
    return (
        <div className="employee-layout">
            <Sidebar variant="employee" />
            <main className="employee-main">
                <Outlet />
            </main>
            <MobileNav />
            <HelpBot />
        </div>
    );
};

export default EmployeeLayout;
