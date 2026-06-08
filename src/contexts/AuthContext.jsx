import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    async function loadProfile(fallbackUserId = null) {
        try {
            const res = await api.get('/api/me');
            const p = res.data;
            setProfile({ ...p, name: p.full_name });
        } catch {
            // Fallback directo a Supabase cuando el backend no responde
            const uid = fallbackUserId || (await supabase.auth.getUser()).data.user?.id;
            if (uid) {
                const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single();
                if (p) {
                    setProfile({ ...p, name: p.full_name });
                    return;
                }
            }
            setProfile(null);
        }
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                loadProfile().finally(() => setLoading(false));
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                setProfile(null); // limpiar perfil anterior antes de cargar el nuevo
                loadProfile();
            } else {
                setProfile(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { user: null, error: error.message };
        return { user, error: null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    const resetPassword = async (email) => {
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        return { error: error?.message ?? null };
    };

    const updatePassword = async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return { error: error?.message ?? null };
    };

    const hasRole = (role) => profile?.role === role;
    const isAdmin = () => profile?.role === 'admin' || profile?.role === 'manager';
    const isEmployee = () => profile?.role === 'employee';

    const value = {
        user,
        profile,
        loading,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        hasRole,
        isAdmin,
        isEmployee,
        isAuthenticated: !!user,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
