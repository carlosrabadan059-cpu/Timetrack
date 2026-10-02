import { useState, useEffect, useCallback } from 'react';
import { Scale } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, Button } from '../../components/ui';
import { RIGHTS_LABELS, RIGHTS_STATUS, formatDate, daysLeft } from '../../lib/rightsRequests';
import '../../components/RightsRequests.css';

// Solicitudes de derechos RGPD de los empleados: plazo de respuesta de un mes (art. 12.3)
const AdminRightsRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [replyFor, setReplyFor] = useState(null);
    const [response, setResponse] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get('/api/admin/rights-requests');
            setRequests(res?.data ?? []);
        } catch {
            setError('No se pudieron cargar las solicitudes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const resolve = async (id, status) => {
        if (response.trim().length < 5) {
            setError('Escribe una respuesta para el empleado (mínimo 5 caracteres)');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await api.patch(`/api/admin/rights-requests/${id}`, { status, response: response.trim() });
            setReplyFor(null);
            setResponse('');
            await load();
        } catch (err) {
            setError(err?.message || 'No se pudo guardar la respuesta');
        } finally {
            setBusy(false);
        }
    };

    const pending = requests.filter((r) => r.status === 'pending').length;

    return (
        <Card padding="md">
            <h2 className="settings-section-title">
                <Scale size={18} /> Solicitudes de derechos RGPD
            </h2>
            <p className="settings-section-desc">
                Acceso, rectificación, supresión, limitación, oposición o portabilidad pedidos por los empleados desde su perfil.
                Hay que responder en <strong>un mes</strong> (ampliable dos meses más en casos complejos, avisando antes al empleado).
                El registro de jornada no puede borrarse antes de 4 años aunque se pida la supresión.
                {pending > 0 && <> · <strong>{pending} pendiente{pending > 1 ? 's' : ''}</strong></>}
            </p>

            {error && !replyFor && <p className="rr-error">{error}</p>}
            {loading ? (
                <p className="rr-empty">Cargando...</p>
            ) : requests.length === 0 ? (
                <p className="rr-empty">No hay solicitudes.</p>
            ) : (
                <div className="rr-list">
                    {requests.map((r) => {
                        const st = RIGHTS_STATUS[r.status] ?? RIGHTS_STATUS.pending;
                        const left = daysLeft(r.due_at);
                        return (
                            <div key={r.id} className="rr-item">
                                <div className="rr-item-head">
                                    <strong>
                                        {RIGHTS_LABELS[r.type] ?? r.type} · {r.user?.full_name ?? r.user?.email ?? 'Empleado eliminado'}
                                        {r.user?.employee_code ? ` (${r.user.employee_code})` : ''}
                                    </strong>
                                    <span className={`rr-status ${st.className}`}>{st.label}</span>
                                </div>
                                <p className="rr-details">{r.details}</p>
                                {r.response && <p className="rr-response">{r.response}</p>}
                                <span className="rr-meta">
                                    Recibida el {formatDate(r.created_at)}
                                    {r.status === 'pending' ? (
                                        <> · vence el {formatDate(r.due_at)}{' '}
                                            <span className={left <= 7 ? 'rr-overdue' : ''}>
                                                ({left < 0 ? `vencida hace ${-left} días` : `quedan ${left} días`})
                                            </span>
                                        </>
                                    ) : (
                                        ` · respondida el ${formatDate(r.resolved_at)}${r.resolver ? ` por ${r.resolver.full_name ?? r.resolver.email}` : ''}`
                                    )}
                                </span>

                                {r.status === 'pending' && replyFor !== r.id && (
                                    <div className="rr-actions">
                                        <Button size="sm" variant="secondary" onClick={() => { setReplyFor(r.id); setResponse(''); setError(''); }}>
                                            Responder
                                        </Button>
                                    </div>
                                )}
                                {replyFor === r.id && (
                                    <div className="rr-form">
                                        <textarea
                                            className="rr-textarea"
                                            value={response}
                                            maxLength={2000}
                                            onChange={(e) => setResponse(e.target.value)}
                                            placeholder="Respuesta para el empleado: qué se ha hecho o por qué no procede"
                                        />
                                        {error && <p className="rr-error">{error}</p>}
                                        <div className="rr-actions">
                                            <Button size="sm" variant="ghost" onClick={() => { setReplyFor(null); setError(''); }}>Cancelar</Button>
                                            <Button size="sm" variant="danger" disabled={busy} onClick={() => resolve(r.id, 'rejected')}>Denegar</Button>
                                            <Button size="sm" disabled={busy} onClick={() => resolve(r.id, 'resolved')}>Marcar atendida</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};

export default AdminRightsRequests;
