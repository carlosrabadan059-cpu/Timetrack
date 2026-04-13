import { useState } from 'react';
import { StatCard, Card, Button } from '../../components/ui';
import { MOCK_USERS } from '../../lib/mockData';
import { useCorrections } from '../../contexts/CorrectionsContext';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    FileText,
    Filter,
    Search
} from 'lucide-react';
import './AdminCorrectionsPage.css';

/**
 * Admin Corrections Page
 * Manage employee correction requests and incidents
 */
const AdminCorrectionsPage = () => {
    // State
    const { corrections, updateCorrection } = useCorrections();
    const [filterStatus, setFilterStatus] = useState('pending'); // pending, approved, rejected, all
    const [searchTerm, setSearchTerm] = useState('');

    // Helper to get user details
    const getUser = (userId) => {
        const user = MOCK_USERS.find(u => u.id === userId);
        return user?.profile || { name: 'Usuario Desconocido', role: 'employee' };
    };

    // Filter logic
    const filteredRequests = corrections.filter(req => {
        const matchesStatus = filterStatus === 'all' || req.status === filterStatus;
        const user = getUser(req.user_id);
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.reason.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    // Actions
    const handleApprove = (id) => {
        updateCorrection(id, 'approved', 'Aprobado por administrador');
    };

    const handleReject = (id) => {
        // Ejecución directa para evitar bloqueos del navegador con window.confirm
        updateCorrection(id, 'rejected', 'Rechazado por administrador');
    };

    // UI Helpers
    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return <span className="badge badge-warning">Pendiente</span>;
            case 'approved': return <span className="badge badge-success">Aprobada</span>;
            case 'rejected': return <span className="badge badge-error">Rechazada</span>;
            default: return null;
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'correction': return 'Corrección';
            case 'missing': return 'Fichaje Olvidado';
            case 'absence': return 'Ausencia';
            default: return 'Incidencia';
        }
    };

    return (
        <div className="admin-corrections-page">
            <header className="page-header">
                <div>
                    <h1>Gestión de Incidencias</h1>
                    <p className="text-muted">Revisión de solicitudes de corrección de fichajes</p>
                </div>
            </header>

            {/* Stats Overview */}
            <div className="stats-grid">
                <StatCard
                    icon={AlertCircle}
                    label="Pendientes"
                    value={corrections.filter(r => r.status === 'pending').length.toString()}
                    iconColor="warning"
                />
                <StatCard
                    icon={CheckCircle}
                    label="Aprobadas (Mes)"
                    value={corrections.filter(r => r.status === 'approved').length.toString()}
                    iconColor="success"
                />
                <StatCard
                    icon={FileText}
                    label="Total Solicitudes"
                    value={corrections.length.toString()}
                    iconColor="primary"
                />
            </div>

            {/* Filters */}
            <Card className="filters-card" padding="sm">
                <div className="filters-row">
                    <div className="filter-group">
                        <Filter size={18} className="text-muted" />
                        <button
                            className={`filter-btn ${filterStatus === 'pending' ? 'active' : ''}`}
                            onClick={() => setFilterStatus('pending')}
                        >
                            Pendientes
                        </button>
                        <button
                            className={`filter-btn ${filterStatus === 'approved' ? 'active' : ''}`}
                            onClick={() => setFilterStatus('approved')}
                        >
                            Aprobadas
                        </button>
                        <button
                            className={`filter-btn ${filterStatus === 'rejected' ? 'active' : ''}`}
                            onClick={() => setFilterStatus('rejected')}
                        >
                            Rechazadas
                        </button>
                        <button
                            className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
                            onClick={() => setFilterStatus('all')}
                        >
                            Todas
                        </button>
                    </div>

                    <div className="search-group">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Buscar empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                </div>
            </Card>

            {/* Requests List */}
            <div className="requests-list">
                {filteredRequests.length > 0 ? (
                    filteredRequests.map(req => {
                        const user = getUser(req.user_id);
                        return (
                            <Card key={req.id} className="request-card-admin" padding="md">
                                <div className="req-header">
                                    <div className="req-user-info">
                                        <div className="user-avatar-sm">{user.name.charAt(0)}</div>
                                        <div>
                                            <span className="user-name">{user.name}</span>
                                            <span className="req-date">
                                                {format(parseISO(req.created_at), "d MMM yyyy HH:mm", { locale: es })}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="req-status">
                                        <span className="req-type-badge">{getTypeLabel(req.type)}</span>
                                        {getStatusBadge(req.status)}
                                    </div>
                                </div>

                                <div className="req-body">
                                    <div className="req-details-grid">
                                        <div className="detail-item">
                                            <span className="detail-label">Motivo</span>
                                            <p className="detail-value">{req.reason}</p>
                                        </div>

                                        {req.type === 'correction' && (
                                            <div className="detail-item time-change">
                                                <span className="detail-label">Cambio Propuesto</span>
                                                <div className="time-arrow">
                                                    <span className="t-old">{format(parseISO(req.original_timestamp), "HH:mm")}</span>
                                                    <span>→</span>
                                                    <span className="t-new">{req.proposed_timestamp}</span>
                                                </div>
                                            </div>
                                        )}

                                        {(req.type === 'missing' || req.type === 'absence') && (
                                            <div className="detail-item">
                                                <span className="detail-label">Fecha/Hora Propuesta</span>
                                                <p className="detail-value">{format(parseISO(req.proposed_timestamp), "d MMM yyyy - HH:mm", { locale: es })}</p>
                                            </div>
                                        )}
                                    </div>

                                    {req.comment && (
                                        <div className="req-comment">
                                            <p>"{req.comment}"</p>
                                        </div>
                                    )}
                                </div>

                                {req.status === 'pending' && (
                                    <div className="req-actions">
                                        <Button
                                            variant="ghost"
                                            className="btn-reject"
                                            onClick={() => handleReject(req.id)}
                                            icon={XCircle}
                                        >
                                            Rechazar
                                        </Button>
                                        <Button
                                            variant="primary"
                                            className="btn-approve"
                                            onClick={() => handleApprove(req.id)}
                                            icon={CheckCircle}
                                        >
                                            Aprobar Solicitud
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        );
                    })
                ) : (
                    <div className="empty-state-admin">
                        <CheckCircle size={48} />
                        <h3>No hay solicitudes</h3>
                        <p>No hay correcciones que coincidan con los filtros.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminCorrectionsPage;
