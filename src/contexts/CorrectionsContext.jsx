import React, { createContext, useContext, useState, useEffect } from 'react';
import { MOCK_CORRECTIONS } from '../lib/mockData';

const CorrectionsContext = createContext();

export const useCorrections = () => {
    return useContext(CorrectionsContext);
};

export const CorrectionsProvider = ({ children }) => {
    const [corrections, setCorrections] = useState([]);
    const [stats, setStats] = useState({
        pending: 0,
        approved: 0,
        rejected: 0,
        total: 0
    });

    // Initialize with mock data
    useEffect(() => {
        // Sort by date desc
        const sorted = [...MOCK_CORRECTIONS].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );
        setCorrections(sorted);
    }, []);

    // Update stats whenever corrections change
    useEffect(() => {
        setStats({
            pending: corrections.filter(c => c.status === 'pending').length,
            approved: corrections.filter(c => c.status === 'approved').length,
            rejected: corrections.filter(c => c.status === 'rejected').length,
            total: corrections.length
        });
    }, [corrections]);

    // Update a correction status
    const updateCorrection = (id, status, adminComment = '') => {
        setCorrections(prev => prev.map(req => {
            if (req.id === id) {
                const updated = {
                    ...req,
                    status,
                    admin_comment: adminComment,
                    resolved_at: new Date().toISOString()
                };

                // Update the mock data reference as well for "persistence" in this session
                // This is just to keep other components that might read MOCK_CORRECTIONS directly somewhat in sync if they reload
                // but primarily we rely on this Context state now.
                const mockIndex = MOCK_CORRECTIONS.findIndex(c => c.id === id);
                if (mockIndex >= 0) {
                    MOCK_CORRECTIONS[mockIndex] = updated;
                }

                return updated;
            }
            return req;
        }));
    };

    const value = {
        corrections,
        stats,
        updateCorrection
    };

    return (
        <CorrectionsContext.Provider value={value}>
            {children}
        </CorrectionsContext.Provider>
    );
};
