import { createContext, useContext, useState, useEffect } from 'react';
import { MOCK_USERS } from '../lib/mockData';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Check for existing session on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('timetrack_user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
                setProfile(parsed.profile);
            } catch (error) {
                console.error('Error parsing stored user:', error);
                localStorage.removeItem('timetrack_user');
            }
        }
        setLoading(false);
    }, []);

    /**
     * Sign in with email and password
     * Currently uses mock data
     */
    const signIn = async (email, password) => {
        setLoading(true);

        try {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 500));

            // Find user in mock data
            const foundUser = MOCK_USERS.find(
                u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
            );

            if (!foundUser) {
                throw new Error('Credenciales incorrectas');
            }

            if (!foundUser.profile.is_active) {
                throw new Error('Usuario desactivado');
            }

            // Store user session
            const userData = {
                id: foundUser.id,
                email: foundUser.email,
                profile: foundUser.profile
            };

            localStorage.setItem('timetrack_user', JSON.stringify(userData));
            setUser(userData);
            setProfile(foundUser.profile);

            return { user: userData, error: null };
        } catch (error) {
            return { user: null, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Sign out current user
     */
    const signOut = async () => {
        localStorage.removeItem('timetrack_user');
        setUser(null);
        setProfile(null);
    };

    /**
     * Check if user has a specific role
     */
    const hasRole = (role) => {
        return profile?.role === role;
    };

    /**
     * Check if user is admin
     */
    const isAdmin = () => hasRole('admin');

    /**
     * Check if user is employee
     */
    const isEmployee = () => hasRole('employee');

    const value = {
        user,
        profile,
        loading,
        signIn,
        signOut,
        hasRole,
        isAdmin,
        isEmployee,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
