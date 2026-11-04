import { useState, useEffect, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, Button } from '../../components/ui';
import '../../components/RightsRequests.css';

// Registro de auditoría (art. 5.2 y 32 RGPD): solo lectura, append-only en BD
const ACTION_LABELS = {
    DATA_VIEW: 'Consulta de datos',
    DATA_EXPORT: 'Exportación',
    CORRECTION_APPLY: 'Corrección aplicada',
    INCIDENT_APPROVE: 'Aprobación',
    INCIDENT_REJECT: 'Rechazo',
    CONFIG_CHANGE: 'Cambio de configuración',
    USER_CREATE: 'Alta de empleado',
    USER_UPDATE: 'Edición de empleado',
    USER_DEACTIVATE: 'Baja de empleado',
    USER_REACTIVATE: 'Reactivación de empleado',
    CREDENTIAL_CHANGE: 'Cambio de tarjeta/PIN',
    API_KEY_CHANGE: 'Cambio de API key',
    SYNC_RUN: 'Sincronización 2N',
    SUPERADMIN_ACTION: 'Acción de superadmin',
    EXTERNAL_API_ACCESS: 'Acceso API externa',
    RETENTION_PURGE: 'Purga por conservación',
};

const ENTITY_LABELS = {
    attendance_dashboard: 'Panel de asistencia',
    live_attendance: 'Asistencia en vivo',
    access_logs: 'Fichajes',
    incidencia: 'Incidencia',
    incidencias: 'Incidencias',
    vacation_request: 'Solicitud de vacaciones',
    vacation_requests: 'Vacaciones y ausencias',
    fichaje_override: 'Autorización de fichaje',
    profile: 'Perfil de empleado',
    card: 'Tarjeta RFID',
    pin: 'PIN',
    company: 'Empresa',
    company_settings: 'Configuración de la empresa',
    api_key: 'API key',
    ac_import: 'Importación desde 2N',
    ac_sync: 'Sincronización con 2N',
    registro_jornada: 'Registro de jornada',
    data_rights_request: 'Solicitud de derechos RGPD',
    data_rights_requests: 'Solicitudes de derechos RGPD',
};

const PAGE_SIZE = 50;

const formatDateTime = (iso) =>
    new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Madrid' });

const describePayload = (p) => {
    if (!p || typeof p !== 'object') return '';
    const parts = [];
    if (p.method && p.path) parts.push(`${p.method} ${p.path}`);
    const rest = Object.entries(p).filter(([k]) => k !== 'method' && k !== 'path');
    if (rest.length) parts.push(JSON.stringify(Object.fromEntries(rest)));
    return parts.join(' · ');
};

const AdminAuditLog = () => {
    const [events, setEvents] = useState([]);
    const [meta, setMeta] = useState({ page: 1, total: 0, has_more: false });
    const [action, setAction] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
            if (action) qs.set('action', action);
            const res = await api.get(`/api/admin/audit?${qs}`);
            setEvents(res?.data ?? []);
            setMeta(res?.meta ?? { page, total: 0, has_more: false });
        } catch {
            setError('No se pudo cargar el registro de auditoría');
        } finally {
            setLoading(false);
        }
    }, [page, action]);

    useEffect(() => { load(); }, [load]);

    return (
        <Card padding="md">
            <h2 className="settings-section-title">
                <ScrollText size={18} /> Registro de auditoría
            </h2>
            <p className="settings-section-desc">
                Quién ha consultado, exportado o modificado datos personales de la empresa. El registro no se puede editar
                ni borrar y se conserva 4 años.
            </p>

            <div className="rr-actions" style={{ justifyContent: 'flex-start' }}>
                <select
                    className="rr-select"
                    style={{ width: 'auto' }}
                    value={action}
                    onChange={(e) => { setAction(e.target.value); setPage(1); }}
                >
                    <option value="">Todas las acciones</option>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>

            {error && <p className="rr-error">{error}</p>}
            {loading ? (
                <p className="rr-empty">Cargando...</p>
            ) : events.length === 0 ? (
                <p className="rr-empty">No hay eventos.</p>
            ) : (
                <div className="rr-list">
                    {events.map((e) => (
                        <div key={e.id} className="rr-item">
                            <div className="rr-item-head">
                                <strong>
                                    {ACTION_LABELS[e.action] ?? e.action}
                                    {e.entity_type ? ` · ${ENTITY_LABELS[e.entity_type] ?? e.entity_type}` : ''}
                                </strong>
                                <span className="rr-meta">{formatDateTime(e.created_at)}</span>
                            </div>
                            <span className="rr-meta">
                                {e.actor ? `${e.actor.full_name ?? e.actor.email} (${e.actor.role})` : 'Sistema / usuario eliminado'}
                            </span>
                            {describePayload(e.payload) && <p className="rr-details rr-meta">{describePayload(e.payload)}</p>}
                        </div>
                    ))}
                </div>
            )}

            <div className="rr-actions" style={{ marginTop: 'var(--space-3)', alignItems: 'center' }}>
                <span className="rr-meta">{meta.total} eventos · página {page}</span>
                <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="secondary" disabled={!meta.has_more || loading} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
        </Card>
    );
};

export default AdminAuditLog;
