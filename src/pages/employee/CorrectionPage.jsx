import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Button, Input, Modal } from '../../components/ui';
import { MOCK_ATTENDANCE, MOCK_CORRECTIONS } from '../../lib/mockData';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileEdit, Send, Clock, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import './CorrectionPage.css';

/**
 * Correction/Incident Reporting Page
 * Allows employees to report issues with their time/attendance
 */
const CorrectionPage = () => {
    const { profile } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Local state for requests to support optimistic updates
    const [myRequests, setMyRequests] = useState([]);

    // Form states
    const [requestType, setRequestType] = useState('correction'); // correction | missing | absence
    const [selectedEntry, setSelectedEntry] = useState('');
    const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customTime, setCustomTime] = useState('');
    const [reason, setReason] = useState('');
    const [comment, setComment] = useState('');

    useEffect(() => {
        if (profile?.id) {
            const userReqs = MOCK_CORRECTIONS
                .filter(c => c.user_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setMyRequests(userReqs);
        }
    }, [profile?.id, showModal]); // Refresh when modal closes (after submission)

    // Get user entries for last 7 days
    const userEntries = MOCK_ATTENDANCE
        .filter(e => e.user_id === profile?.id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 20);

    const handleSubmit = (e) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API call
        setTimeout(() => {
            const newRequest = {
                id: `req-${Date.now()}`,
                user_id: profile.id,
                type: requestType, // correction, missing, absence
                entry_id: requestType === 'correction' ? selectedEntry : null,
                original_timestamp: requestType === 'correction'
                    ? userEntries.find(e => e.id === selectedEntry)?.timestamp
                    : null,
                proposed_timestamp: requestType !== 'correction'
                    ? new Date(`${customDate}T${customTime}:00`).toISOString()
                    : customTime, // For correction, we might just send the time string or full ISO
                reason,
                comment,
                status: 'pending',
                created_at: new Date().toISOString()
            };

            // In a real app, we would send this to backend. 
            // Here we push to mock array
            MOCK_CORRECTIONS.unshift(newRequest);
            setMyRequests([newRequest, ...myRequests]);

            console.log('Incident reported:', newRequest);

            setIsLoading(false);
            setShowModal(false);
            resetForm();
        }, 800);
    };

    const resetForm = () => {
        setRequestType('correction');
        setSelectedEntry('');
        setCustomDate(format(new Date(), 'yyyy-MM-dd'));
        setCustomTime('');
        setReason('');
        setComment('');
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending':
                return <span className="badge badge-warning">Pendiente</span>;
            case 'approved':
                return <span className="badge badge-success">Aprobada</span>;
            case 'rejected':
                return <span className="badge badge-error">Rechazada</span>;
            default:
                return null;
        }
    };

    const getRequestTitle = (type) => {
        switch (type) {
            case 'correction': return 'Corrección de Fichaje';
            case 'missing': return 'Fichaje Olvidado';
            case 'absence': return 'Justificación de Ausencia';
            default: return 'Incidencia';
        }
    };

    return (
        <div className="correction-page">
            <header className="correction-header">
                <div>
                    <h1>Reporte de Incidencias</h1>
                    <p className="page-subtitle">Gestiona correcciones, olvidos y justificaciones</p>
                </div>
                <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => setShowModal(true)}
                >
                    Nueva Incidencia
                </Button>
            </header>

            <section className="correction-list-section">
                {myRequests.length > 0 ? (
                    <div className="correction-requests">
                        {myRequests.map((req) => (
                            <Card key={req.id} padding="md" className="correction-request-card">
                                <div className="correction-request-header">
                                    <div className="correction-type-info">
                                        <span className="request-type-label">{getRequestTitle(req.type)}</span>
                                        <span className="request-date">
                                            {format(parseISO(req.created_at), "d MMM yyyy", { locale: es })}
                                        </span>
                                    </div>
                                    {getStatusBadge(req.status)}
                                </div>

                                <div className="correction-details">
                                    {req.type === 'correction' && (
                                        <div className="time-change">
                                            <span>Original: {format(parseISO(req.original_timestamp), "HH:mm")}</span>
                                            <span className="arrow">→</span>
                                            <span>Propuesto: {req.proposed_timestamp}</span>
                                        </div>
                                    )}
                                    {req.type === 'missing' && (
                                        <div className="time-info">
                                            <span>Fecha/Hora: {format(parseISO(req.proposed_timestamp), "d MMM HH:mm", { locale: es })}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="correction-reason-box">
                                    <strong>{req.reason}</strong>
                                    {req.comment && <p>{req.comment}</p>}
                                </div>

                                {req.admin_comment && (
                                    <div className="admin-response">
                                        <p><strong>Admin:</strong> {req.admin_comment}</p>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <CheckCircle size={48} className="text-muted" />
                        <h3>Todo en orden</h3>
                        <p>No tienes incidencias reportadas ni pendientes.</p>
                    </div>
                )}
            </section>

            {/* Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => !isLoading && setShowModal(false)}
                title="Nueva Incidencia"
                size="md"
            >
                <form onSubmit={handleSubmit} className="correction-form">

                    <div className="form-group">
                        <label>Tipo de Incidencia</label>
                        <select
                            value={requestType}
                            onChange={(e) => setRequestType(e.target.value)}
                            className="form-select"
                        >
                            <option value="correction">Corregir un fichaje existente</option>
                            <option value="missing">He olvidado fichar (Entrada/Salida)</option>
                            <option value="absence">Justificar una ausencia</option>
                        </select>
                    </div>

                    {requestType === 'correction' && (
                        <>
                            <div className="form-group">
                                <label>Selecciona el fichaje erróneo</label>
                                <select
                                    value={selectedEntry}
                                    onChange={(e) => setSelectedEntry(e.target.value)}
                                    required
                                    className="form-select"
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {userEntries.map((entry) => (
                                        <option key={entry.id} value={entry.id}>
                                            {format(parseISO(entry.timestamp), "dd/MM - HH:mm", { locale: es })} ({entry.type === 'check_in' ? 'Entrada' : 'Salida'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Hora Correcta</label>
                                <input
                                    type="time"
                                    value={customTime}
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    required
                                    className="form-input"
                                />
                            </div>
                        </>
                    )}

                    {(requestType === 'missing' || requestType === 'absence') && (
                        <div className="form-row">
                            <div className="form-group">
                                <label>Fecha</label>
                                <input
                                    type="date"
                                    value={customDate}
                                    onChange={(e) => setCustomDate(e.target.value)}
                                    required
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label>Hora {requestType === 'absence' ? 'Inicio' : 'Estimada'}</label>
                                <input
                                    type="time"
                                    value={customTime}
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    required
                                    className="form-input"
                                />
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Motivo</label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                            className="form-select"
                        >
                            <option value="">-- Seleccionar --</option>
                            <option value="olvido">Olvido</option>
                            <option value="error_tecnico">Error Técnico</option>
                            <option value="medico">Cita Médica</option>
                            <option value="personal">Asunto Personal</option>
                            <option value="transporte">Incidencia Transporte</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Comentario / Descripción</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Describe brevemente lo ocurrido..."
                            rows={3}
                            className="form-textarea"
                            required
                        />
                    </div>

                    <div className="modal-footer actions">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setShowModal(false)}
                            disabled={isLoading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            icon={Send}
                            loading={isLoading}
                            disabled={isLoading}
                        >
                            Enviar Reporte
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CorrectionPage;
