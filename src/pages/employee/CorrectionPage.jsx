import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { Send, CheckCircle, Plus, AlertCircle } from 'lucide-react';
import './CorrectionPage.css';

const TYPE_LABELS = {
    correccion: 'Corrección de Fichaje',
    olvido:     'Fichaje Olvidado',
    ausencia:   'Justificación de Ausencia',
    hora_extra: 'Hora Extra',
};

const STATUS_BADGE = {
    pending:  <span className="badge badge-warning">Pendiente</span>,
    approved: <span className="badge badge-success">Aprobada</span>,
    rejected: <span className="badge badge-error">Rechazada</span>,
};

function fmtDateTime(ts) {
    if (!ts) return '–';
    return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d) {
    if (!d) return '–';
    return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CorrectionPage = () => {
    const [incidencias, setIncidencias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const [recentFichajes, setRecentFichajes] = useState([]);

    const [type, setType] = useState('olvido');
    const [selectedLogId, setSelectedLogId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState('');
    const [direction, setDirection] = useState('in');
    const [reason, setReason] = useState('');

    const loadIncidencias = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/me/incidencias', { limit: 50 });
            setIncidencias(res.data?.items ?? []);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadIncidencias(); }, [loadIncidencias]);

    const loadRecentFichajes = useCallback(async () => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const from = new Date(); from.setDate(from.getDate() - 14);
            const res = await api.get('/api/me/historial', {
                period: 'custom',
                dateFrom: from.toISOString().slice(0, 10),
                dateTo: today,
                limit: 50,
            });
            const days = res.data?.days ?? [];
            const flat = days.flatMap(d => d.fichajes);
            flat.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setRecentFichajes(flat);
        } catch {
            // ignore
        }
    }, []);

    const openModal = () => {
        setType('olvido');
        setSelectedLogId('');
        setDate(new Date().toISOString().slice(0, 10));
        setTime('');
        setDirection('in');
        setReason('');
        setSubmitError('');
        setShowModal(true);
        if (recentFichajes.length === 0) loadRecentFichajes();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');

        if (reason.trim().length < 10) {
            setSubmitError('El motivo debe tener al menos 10 caracteres');
            return;
        }

        const body = { type, date, reason: reason.trim() };

        if (type === 'olvido') {
            if (!time) { setSubmitError('Indica la hora del fichaje olvidado'); return; }
            body.requested_direction = direction;
            body.requested_timestamp = new Date(`${date}T${time}:00`).toISOString();
        }

        if (type === 'correccion') {
            if (!selectedLogId) { setSubmitError('Selecciona el fichaje a corregir'); return; }
            if (!time) { setSubmitError('Indica la hora correcta'); return; }
            const orig = recentFichajes.find(f => f.id === selectedLogId);
            if (orig) {
                const origDate = new Date(orig.timestamp).toISOString().slice(0, 10);
                body.access_log_id = selectedLogId;
                body.original_timestamp = orig.timestamp;
                body.date = origDate;
                body.requested_timestamp = new Date(`${origDate}T${time}:00`).toISOString();
            }
        }

        setSubmitLoading(true);
        try {
            await api.post('/api/me/incidencias', body);
            setShowModal(false);
            loadIncidencias();
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <div className="correction-page">
            <header className="correction-header">
                <div>
                    <h1>Reporte de Incidencias</h1>
                    <p className="page-subtitle">Gestiona correcciones, olvidos y justificaciones</p>
                </div>
                <Button variant="primary" icon={Plus} onClick={openModal}>
                    Nueva Incidencia
                </Button>
            </header>

            <section className="correction-list-section">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                        Cargando...
                    </div>
                ) : incidencias.length === 0 ? (
                    <div className="empty-state">
                        <CheckCircle size={48} className="text-muted" />
                        <h3>Todo en orden</h3>
                        <p>No tienes incidencias reportadas ni pendientes.</p>
                    </div>
                ) : (
                    <div className="correction-requests">
                        {incidencias.map((inc) => (
                            <Card key={inc.id} padding="md" className="correction-request-card">
                                <div className="correction-request-header">
                                    <div className="correction-type-info">
                                        <span className="request-type-label">{TYPE_LABELS[inc.type] ?? inc.type}</span>
                                        <span className="request-date">{fmtDate(inc.date)}</span>
                                    </div>
                                    {STATUS_BADGE[inc.status]}
                                </div>

                                <div className="correction-details">
                                    {inc.type === 'correccion' && inc.original_timestamp && (
                                        <div className="time-change">
                                            <span>Original: {fmtDateTime(inc.original_timestamp)}</span>
                                            {inc.requested_timestamp && (
                                                <>
                                                    <span className="arrow">→</span>
                                                    <span>Propuesto: {fmtDateTime(inc.requested_timestamp)}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    {inc.type === 'olvido' && inc.requested_timestamp && (
                                        <div className="time-info">
                                            <span>
                                                Fichaje solicitado: {fmtDateTime(inc.requested_timestamp)}
                                                {' '}({inc.requested_direction === 'in' ? 'Entrada' : 'Salida'})
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="correction-reason-box">
                                    <p>{inc.reason}</p>
                                </div>

                                {inc.manager_note && (
                                    <div className="admin-response">
                                        <p><strong>Admin:</strong> {inc.manager_note}</p>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </section>

            <Modal
                isOpen={showModal}
                onClose={() => !submitLoading && setShowModal(false)}
                title="Nueva Incidencia"
                size="md"
            >
                <form onSubmit={handleSubmit} className="correction-form">
                    <div className="form-group">
                        <label>Tipo de Incidencia</label>
                        <select value={type} onChange={(e) => setType(e.target.value)} className="form-select">
                            <option value="olvido">He olvidado fichar (Entrada/Salida)</option>
                            <option value="correccion">Corregir un fichaje existente</option>
                            <option value="ausencia">Justificar una ausencia</option>
                            <option value="hora_extra">Hora extra</option>
                        </select>
                    </div>

                    {type === 'correccion' && (
                        <>
                            <div className="form-group">
                                <label>Selecciona el fichaje erróneo</label>
                                <select
                                    value={selectedLogId}
                                    onChange={(e) => setSelectedLogId(e.target.value)}
                                    required
                                    className="form-select"
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {recentFichajes.map((f) => {
                                        const d = new Date(f.timestamp);
                                        const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} (${f.direction === 'in' ? 'Entrada' : 'Salida'})`;
                                        return <option key={f.id} value={f.id}>{label}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Hora Correcta</label>
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    required
                                    className="form-input"
                                />
                            </div>
                        </>
                    )}

                    {type === 'olvido' && (
                        <>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Fecha</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        required
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Hora</label>
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={(e) => setTime(e.target.value)}
                                        required
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Tipo</label>
                                <select value={direction} onChange={(e) => setDirection(e.target.value)} className="form-select">
                                    <option value="in">Entrada</option>
                                    <option value="out">Salida</option>
                                </select>
                            </div>
                        </>
                    )}

                    {(type === 'ausencia' || type === 'hora_extra') && (
                        <div className="form-group">
                            <label>Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                                className="form-input"
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>
                            Motivo / Descripción
                            <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal', marginLeft: '0.5rem' }}>(mín. 10 caracteres)</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Describe brevemente lo ocurrido..."
                            rows={3}
                            className="form-textarea"
                            required
                        />
                    </div>

                    {submitError && (
                        <p className="form-error" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <AlertCircle size={14} />{submitError}
                        </p>
                    )}

                    <div className="modal-footer actions">
                        <Button type="button" variant="ghost" onClick={() => setShowModal(false)} disabled={submitLoading}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="primary" icon={Send} loading={submitLoading}>
                            Enviar Reporte
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CorrectionPage;
