import { useState, useEffect } from 'react';
import { Scale } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from './ui';
import { RIGHTS_TYPES, RIGHTS_LABELS, RIGHTS_STATUS, formatDate } from '../lib/rightsRequests';
import './RightsRequests.css';

// Canal del empleado para ejercer sus derechos RGPD (arts. 15–22); respuesta en 1 mes (art. 12.3)
const MyRightsRequests = () => {
    const [requests, setRequests] = useState([]);
    const [open, setOpen] = useState(false);
    const [type, setType] = useState('acceso');
    const [details, setDetails] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/api/me/rights-requests')
            .then((res) => setRequests(res?.data ?? []))
            .catch(() => {});
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (details.trim().length < 10) {
            setError('Explica tu solicitud en al menos 10 caracteres');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await api.post('/api/me/rights-requests', { type, details: details.trim() });
            setRequests((prev) => [res.data, ...prev]);
            setDetails('');
            setOpen(false);
        } catch (err) {
            setError(err?.message || 'No se pudo enviar la solicitud');
        } finally {
            setBusy(false);
        }
    };

    const hint = RIGHTS_TYPES.find((t) => t.value === type)?.hint;

    return (
        <>
            <div className="settings-item">
                <div className="settings-icon"><Scale size={20} /></div>
                <div className="settings-info">
                    <h4>Ejercer mis derechos</h4>
                    <p>Acceso, rectificación, supresión, limitación, oposición o portabilidad. Respuesta en un mes</p>
                </div>
                {!open && (
                    <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Solicitar</Button>
                )}
            </div>

            {open && (
                <form className="rr-form" onSubmit={handleSubmit}>
                    <label className="rr-field">
                        Derecho
                        <select className="rr-select" value={type} onChange={(e) => setType(e.target.value)}>
                            {RIGHTS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {hint && <span className="rr-meta">{hint}</span>}
                    </label>
                    <label className="rr-field">
                        Explica tu solicitud
                        <textarea
                            className="rr-textarea"
                            value={details}
                            maxLength={2000}
                            onChange={(e) => setDetails(e.target.value)}
                            placeholder="Por ejemplo: quiero una copia de todos mis datos personales"
                        />
                    </label>
                    {error && <p className="rr-error">{error}</p>}
                    <div className="rr-actions">
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setError(''); }}>Cancelar</Button>
                        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Enviando...' : 'Enviar solicitud'}</Button>
                    </div>
                </form>
            )}

            {requests.length > 0 && (
                <div className="rr-list">
                    {requests.map((r) => {
                        const st = RIGHTS_STATUS[r.status] ?? RIGHTS_STATUS.pending;
                        return (
                            <div key={r.id} className="rr-item">
                                <div className="rr-item-head">
                                    <strong>{RIGHTS_LABELS[r.type] ?? r.type}</strong>
                                    <span className={`rr-status ${st.className}`}>{st.label}</span>
                                </div>
                                <p className="rr-details">{r.details}</p>
                                {r.response && <p className="rr-response">{r.response}</p>}
                                <span className="rr-meta">
                                    Enviada el {formatDate(r.created_at)}
                                    {r.status === 'pending'
                                        ? ` · respuesta antes del ${formatDate(r.due_at)}`
                                        : ` · respondida el ${formatDate(r.resolved_at)}`}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
};

export default MyRightsRequests;
