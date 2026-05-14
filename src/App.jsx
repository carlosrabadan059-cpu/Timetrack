import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import EmployeeLayout from './layouts/EmployeeLayout';
import AdminLayout from './layouts/AdminLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/employee/DashboardPage';
import HistoryPage from './pages/employee/HistoryPage';
import CorrectionPage from './pages/employee/CorrectionPage';
import ReportsPage from './pages/employee/ReportsPage';
import ProfilePage from './pages/employee/ProfilePage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminCorrectionsPage from './pages/admin/AdminCorrectionsPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminAttendancePage from './pages/admin/AdminAttendancePage';
import AdminEmployeesPage from './pages/admin/AdminEmployeesPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import SuperAdminLayout from './layouts/SuperAdminLayout';
import SuperAdminCompaniesPage from './pages/superadmin/SuperAdminCompaniesPage';

// Styles
import './App.css';

/**
 * App Component
 * Main router configuration
 */
function App() {
    const { isAuthenticated, profile, loading } = useAuth();

    if (loading) {
        return (
            <div className="app-loading">
                <div className="loading-spinner animate-spin" />
                <style>{`
          .app-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--color-border);
            border-top-color: var(--color-accent-primary);
            border-radius: 50%;
          }
        `}</style>
            </div>
        );
    }

    return (
        <Routes>
            {/* Public routes */}
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />


            {/* Employee routes */}
            <Route
                path="/"
                element={
                    <ProtectedRoute requiredRole="employee">
                        <EmployeeLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="historial" element={<HistoryPage />} />
                <Route path="correcciones" element={<CorrectionPage />} />
                <Route path="reportes" element={<ReportsPage />} />
                <Route path="perfil" element={<ProfilePage />} />
            </Route>

            {/* Super-admin routes */}
            <Route
                path="/superadmin"
                element={
                    <ProtectedRoute requiredRole="superadmin">
                        <SuperAdminLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Navigate to="/superadmin/empresas" replace />} />
                <Route path="empresas" element={<SuperAdminCompaniesPage />} />
            </Route>

            {/* Admin routes */}
            <Route
                path="/admin"
                element={
                    <ProtectedRoute requiredRole="admin">
                        <AdminLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<AdminDashboardPage />} />
                <Route path="correcciones" element={<AdminCorrectionsPage />} />
                <Route path="empleados" element={<AdminEmployeesPage />} />
                <Route path="fichajes" element={<AdminAttendancePage />} />
                <Route path="informes" element={<AdminReportsPage />} />
                <Route path="configuracion" element={<AdminSettingsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to={isAuthenticated ? (profile?.role === 'superadmin' ? '/superadmin/empresas' : profile?.role === 'admin' || profile?.role === 'manager' ? '/admin' : '/dashboard') : '/login'} replace />} />
        </Routes>
    );
}

/**
 * Placeholder page for routes not yet implemented
 */
function PlaceholderPage({ title }) {
    return (
        <div style={{
            padding: 'var(--space-6)',
            animation: 'fadeIn var(--transition-normal) ease-out'
        }}>
            <h1>{title}</h1>
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
                Esta página está en desarrollo
            </p>
        </div>
    );
}

export default App;
