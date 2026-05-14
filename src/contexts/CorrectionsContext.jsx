import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const CorrectionsContext = createContext({ stats: { pending: 0, approved: 0, rejected: 0, total: 0 } });

export const useCorrections = () => useContext(CorrectionsContext);

export const CorrectionsProvider = ({ children }) => {
    const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

    const refresh = () => {
        api.get('/api/incidencias', { status: 'pending', limit: 1 })
            .then(res => setStats(prev => ({ ...prev, pending: res.data?.total ?? 0 })))
            .catch(() => {});
    };

    useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <CorrectionsContext.Provider value={{ stats, refresh }}>
            {children}
        </CorrectionsContext.Provider>
    );
};
