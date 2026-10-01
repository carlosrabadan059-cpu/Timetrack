import { createContext, useContext, useState, useEffect, useRef } from 'react';
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
    const [mfaPending, setMfaPending] = useState(false);
    const currentUid = useRef(null);

    async function needsMfa() {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2';
    }

    async function handleSession(session) {
        const uid = session?.user?.id ?? null;
        setUser(session?.user ?? null);
        if (!uid) {
            currentUid.current = null;
            setMfaPending(false);
            setProfile(null);
            return;
        }
        if (await needsMfa()) {
            setMfaPending(true);
            return;
        }
        setMfaPending(false);
        if (currentUid.current !== uid) {
            currentUid.current = uid;
            setProfile(null); // limpiar perfil anterior antes de cargar el nuevo
            await loadProfile();
        }
    }

    async function loadProfile(fallbackUserId = null) {
        try {
            const res = await api.get('/api/me');
            const p = res.data;
            setProfile({ ...p, name: p.full_name });
        } catch (e) {
            if (e?.code === 'account_disabled') {
                try { sessionStorage.setItem('tt_account_disabled', '1'); } catch { /* storage blocked */ }
                await supabase.auth.signOut();
                setProfile(null);
                return;
            }
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
            handleSession(session).finally(() => setLoading(false));
        });

        // supabase-js deadlocks if other auth calls are awaited inside this callback — defer them
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setTimeout(() => { handleSession(session); }, 0);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            const banned = error.code === 'user_banned' || /banned/i.test(error.message);
            return { user: null, error: banned ? 'Tu cuenta está dada de baja. Contacta con tu empresa.' : error.message };
        }
        return { user, error: null };
    };

    const verifyMfa = async (code) => {
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        const factor = factors?.totp?.[0];
        if (listError || !factor) return { error: 'No hay ningún factor 2FA configurado' };
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) return { error: 'Código incorrecto o caducado' };
        const { data: { session } } = await supabase.auth.getSession();
        await handleSession(session);
        return { error: null };
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
        verifyMfa,
        refreshProfile: loadProfile,
        mfaPending,
        hasRole,
        isAdmin,
        isEmployee,
        isAuthenticated: !!user && !mfaPending,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
