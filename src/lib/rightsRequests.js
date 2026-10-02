// Derechos RGPD (arts. 15–22) que un empleado puede ejercer desde la app
export const RIGHTS_TYPES = [
    { value: 'acceso', label: 'Acceso', hint: 'Saber qué datos tuyos trata la empresa y obtener una copia' },
    { value: 'rectificacion', label: 'Rectificación', hint: 'Corregir datos inexactos o incompletos' },
    { value: 'supresion', label: 'Supresión', hint: 'Borrar datos que ya no sean necesarios (el registro de jornada se conserva 4 años por ley)' },
    { value: 'limitacion', label: 'Limitación', hint: 'Que tus datos se conserven pero no se usen mientras se resuelve una reclamación' },
    { value: 'oposicion', label: 'Oposición', hint: 'Oponerte a un tratamiento concreto, por ejemplo la geolocalización' },
    { value: 'portabilidad', label: 'Portabilidad', hint: 'Recibir tus datos en un formato estructurado para llevarlos a otro sitio' },
];

export const RIGHTS_LABELS = Object.fromEntries(RIGHTS_TYPES.map((t) => [t.value, t.label]));

export const RIGHTS_STATUS = {
    pending: { label: 'Pendiente', className: 'rr-status-pending' },
    resolved: { label: 'Atendida', className: 'rr-status-resolved' },
    rejected: { label: 'Denegada', className: 'rr-status-rejected' },
};

export function formatDate(iso) {
    return iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function daysLeft(dueIso) {
    return Math.ceil((new Date(dueIso).getTime() - Date.now()) / 86400000);
}
