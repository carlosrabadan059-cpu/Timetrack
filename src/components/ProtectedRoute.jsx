import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Protected Route Component
 * Wraps routes that require authentication
 * Optionally validates required role
 */
const ProtectedRoute = ({ children, requiredRole = null }) => {
    const { isAuthenticated, profile, loading } = useAuth();
    const location = useLocation();

    // Show loading state
    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner animate-spin" />
                <p>Cargando...</p>
                <style>{`
          .loading-screen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            gap: var(--space-4);
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

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check role if required
    if (requiredRole && profile?.role !== requiredRole) {
        const role = profile?.role;
        const redirectPath = role === 'superadmin' ? '/superadmin/empresas' : role === 'admin' || role === 'manager' ? '/admin' : '/dashboard';
        return <Navigate to={redirectPath} replace />;
    }

    return children;
};

export default ProtectedRoute;
