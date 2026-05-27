import { useState, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Info } from 'lucide-react';
import { Card, Button, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import './VacationsPage.css';

const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TYPE_CONFIG = {
    vacaciones:         { label: 'Vacaciones',         color: 'green',  cssVar: 'var(--color-success)' },
    permiso_retribuido: { label: 'Permiso retribuido',  color: 'blue',   cssVar: 'var(--color-info)' },
    asuntos_propios:    { label: 'Asuntos propios',     color: 'purple', cssVar: 'var(--color-accent-secondary)' },
};

const STATUS_LABELS = {
    pending:  'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada',
};

const STATUS_CLS = {
    pending:  'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
};

// ── Helper: calculate working days ────────────────────────────────────────────
function calcWorkingDays(startStr, endStr, workDays, holidays) {
    if (!startStr || !endStr || startStr > endStr) return 0;
    const holidaySet = new Set(holidays.map(h => h.date));
    let count = 0;
    const current = new Date(startStr + 'T12:00:00');
    const end = new Date(endStr + 'T12:00:00');
    while (current <= end) {
        const dow = current.getDay();
        const ds = current.toISOString().split('T')[0];
        if (workDays.includes(dow) && !holidaySet.has(ds)) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fmtDate(str) {
    if (!str) return '–';
    return new Date(str + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const HOLIDAY_TYPE_LABELS = {
    nacional:   'Nacional',
    autonomico: 'Autonómico',
    local:      'Local',
};

// ── MonthGrid component ───────────────────────────────────────────────────────
function MonthGrid({ year, month, holidays, workDays, requests, onDayClick }) {
    const holidayMap = {};
    holidays.forEach(h => { holidayMap[h.date] = { name: h.name, type: h.type ?? 'nacional' }; });

    const workDaySet = new Set(workDays);

    // Get days in month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Day of week for first cell (Mon=0 offset)
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1; // Monday-first

    // Build a map: dateStr → array of requests covering that day
    const dayRequests = {};
    requests.forEach(r => {
        const s = new Date(r.start_date + 'T12:00:00');
        const e = new Date(r.end_date + 'T12:00:00');
        const cur = new Date(s);
        while (cur <= e) {
            if (cur.getMonth() === month && cur.getFullYear() === year) {
                const ds = toDateStr(cur);
                if (!dayRequests[ds]) dayRequests[ds] = [];
                dayRequests[ds].push(r);
            }
            cur.setDate(cur.getDate() + 1);
        }
    });

    const cells = [];
    // Empty prefix cells
    for (let i = 0; i < startDow; i++) {
        cells.push(<div key={`e${i}`} className="vcal-cell empty" />);
    }
    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const ds = toDateStr(date);
        const dow = date.getDay(); // 0=Sun, 6=Sat
        const isWeekend = dow === 0 || dow === 6;
        const holidayInfo = holidayMap[ds];
        const isHoliday = !!holidayInfo;
        const isBlocked = isWeekend || isHoliday;
        const dayReqs = dayRequests[ds] ?? [];

        let cellClass = 'vcal-cell';
        let cellStyle = {};
        let title = isHoliday
            ? `${holidayInfo.name} · ${HOLIDAY_TYPE_LABELS[holidayInfo.type] ?? holidayInfo.type}`
            : undefined;

        if (isWeekend) cellClass += ' weekend';
        else if (isHoliday) cellClass += ` holiday holiday-${holidayInfo.type ?? 'nacional'}`;
        else if (dayReqs.length > 0) {
            const req = dayReqs[0];
            const cfg = TYPE_CONFIG[req.type];
            const alpha = req.status === 'approved' ? '1' : '0.25';
            cellStyle = {
                backgroundColor: cfg ? cfg.cssVar.replace(')', `, ${alpha})`).replace('var(', 'rgba(').replace(/var\(.*\)/, cfg.cssVar) : '',
                border: req.status === 'pending' ? `2px dashed ${cfg?.cssVar}` : 'none',
            };
            // Use actual color values for bg
            if (req.status === 'approved') {
                const colorMap = { green: '#10B981', blue: '#3B82F6', purple: '#7C3AED' };
                cellStyle = { backgroundColor: colorMap[cfg?.color] ?? '#10B981' };
            } else {
                const colorMap = { green: '#d1fae5', blue: '#dbeafe', purple: '#ede9fe' };
                cellStyle = {
                    backgroundColor: colorMap[cfg?.color] ?? '#d1fae5',
                    outline: `2px dashed ${TYPE_CONFIG[req.type]?.cssVar ?? '#10B981'}`,
                    outlineOffset: '-2px',
                };
            }
            cellClass += ` has-request status-${req.status} type-${req.type}`;
            title = `${TYPE_CONFIG[req.type]?.label} · ${STATUS_LABELS[req.status]}`;
        }

        cells.push(
            <div
                key={ds}
                className={cellClass}
                style={cellStyle}
                title={title}
                onClick={isBlocked ? undefined : () => onDayClick(ds)}
            >
                <span className="vcal-day-num">{d}</span>
            </div>
        );
    }

    return (
        <div className="vcal-month">
            <div className="vcal-month-title">{MONTHS_ES[month]}</div>
            <div className="vcal-weekdays">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                    <div key={d} className="vcal-weekday">{d}</div>
                ))}
            </div>
            <div className="vcal-grid">{cells}</div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VacationsPage() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [requests, setRequests] = useState([]);
    const [balance, setBalance] = useState({ total: 22, used: 0, remaining: 22 });
    const [settings, setSettings] = useState({ work_schedule_days: [1,2,3,4,5], holidays: [] });
    const [loading, setLoading] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ type: 'vacaciones', start_date: '', end_date: '', reason: '' });
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Cancel state: id of request pending confirmation, null otherwise
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [reqRes, balRes, settingsRes] = await Promise.all([
                api.get('/api/me/vacaciones', { year, limit: 100 }),
                api.get('/api/me/vacaciones/balance', { year }),
                api.get('/api/me/company-settings').catch(() => null),
            ]);
            setRequests(reqRes.data?.items ?? []);
            setBalance(balRes.data ?? { total: 22, used: 0, remaining: 22 });
            if (settingsRes?.data) {
                setSettings({
                    work_schedule_days: settingsRes.data.work_schedule_days ?? [1,2,3,4,5],
                    holidays: settingsRes.data.holidays ?? [],
                });
            }
        } catch { /* keep existing */ } finally { setLoading(false); }
    }, [year]);

    useEffect(() => { loadData(); }, [loadData]);

    const workingDaysPreview = calcWorkingDays(
        form.start_date, form.end_date,
        settings.work_schedule_days, settings.holidays
    );

    const openModal = (prefillDate = '') => {
        setForm({ type: 'vacaciones', start_date: prefillDate, end_date: prefillDate, reason: '' });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.start_date || !form.end_date) { setFormError('Selecciona las fechas'); return; }
        if (form.start_date > form.end_date) { setFormError('La fecha de fin debe ser igual o posterior'); return; }
        if (workingDaysPreview < 1) { setFormError('El rango no contiene días laborables'); return; }
        setSubmitting(true);
        setFormError('');
        try {
            await api.post('/api/me/vacaciones', {
                type: form.type,
                start_date: form.start_date,
                end_date: form.end_date,
                reason: form.reason || undefined,
            });
            setShowModal(false);
            loadData();
        } catch (err) {
            setFormError(err?.data?.error?.message ?? err?.message ?? 'Error al enviar solicitud');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (id) => {
        if (confirmCancel !== id) { setConfirmCancel(id); setCancelError(''); return; }
        setCancelling(true);
        setCancelError('');
        try {
            await api.delete(`/api/me/vacaciones/${id}`);
            setConfirmCancel(null);
            loadData();
        } catch (err) {
            const msg = err?.message ?? `HTTP ${err?.status ?? 'error'}`;
            setCancelError(msg);
            setConfirmCancel(null);
            console.error('[cancel vacation]', err);
        } finally {
            setCancelling(false);
        }
    };

    return (
        <div className="vacations-page">
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="vacations-header">
                <div>
                    <h1 className="vacations-title">Vacaciones y Ausencias</h1>
                    <p className="vacations-subtitle">Solicita y consulta tus periodos de descanso</p>
                </div>
                <Button variant="primary" icon={Plus} onClick={() => openModal()}>
                    Nueva Solicitud
                </Button>
            </div>

            {/* ── Balance pills ────────────────────────────────────────────── */}
            <div className="vacation-balance">
                <div className="balance-pill total">
                    <span className="balance-num">{balance.total}</span>
                    <span className="balance-lbl">días totales</span>
                </div>
                <div className="balance-pill used">
                    <span className="balance-num">{balance.used}</span>
                    <span className="balance-lbl">utilizados</span>
                </div>
                <div className="balance-pill remaining">
                    <span className="balance-num">{balance.remaining}</span>
                    <span className="balance-lbl">disponibles</span>
                </div>
            </div>

            {/* ── Year navigation ──────────────────────────────────────────── */}
            <div className="vacation-year-nav">
                <button className="year-nav-btn" onClick={() => setYear(y => y - 1)}>
                    <ChevronLeft size={18} />
                </button>
                <span className="year-label">{year}</span>
                <button className="year-nav-btn" onClick={() => setYear(y => y + 1)}>
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* ── Calendar grid ────────────────────────────────────────────── */}
            {loading ? (
                <div className="vacations-loading">Cargando calendario...</div>
            ) : (
                <div className="vcal-annual">
                    {Array.from({ length: 12 }, (_, m) => (
                        <MonthGrid
                            key={m}
                            year={year}
                            month={m}
                            holidays={settings.holidays}
                            workDays={settings.work_schedule_days}
                            requests={requests}
                            onDayClick={(ds) => openModal(ds)}
                        />
                    ))}
                </div>
            )}

            {/* ── Legend ───────────────────────────────────────────────────── */}
            <div className="vcal-legend">
                <div className="legend-item">
                    <div className="legend-swatch weekend-swatch" />
                    <span>Fin de semana</span>
                </div>
                <div className="legend-item">
                    <div className="legend-swatch holiday-swatch holiday-nacional" />
                    <span>Festivo nacional</span>
                </div>
                <div className="legend-item">
                    <div className="legend-swatch holiday-swatch holiday-autonomico" />
                    <span>Festivo autonómico</span>
                </div>
                <div className="legend-item">
                    <div className="legend-swatch holiday-swatch holiday-local" />
                    <span>Festivo local</span>
                </div>
                {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                    <div className="legend-item" key={type}>
                        <div className="legend-swatch" style={{ backgroundColor: cfg.cssVar }} />
                        <span>{cfg.label} (aprobada)</span>
                    </div>
                ))}
                <div className="legend-item">
                    <div className="legend-swatch pending-swatch" />
                    <span>Pendiente de aprobación</span>
                </div>
            </div>

            {/* ── Requests list ────────────────────────────────────────────── */}
            <div className="vacation-requests-section">
                <h2>Mis solicitudes</h2>
                {requests.length === 0 ? (
                    <Card padding="lg" className="vacations-empty">
                        <Calendar size={32} className="empty-icon" />
                        <p>Aún no tienes solicitudes</p>
                        <p className="text-muted text-sm">Haz clic en un día del calendario para crear una</p>
                    </Card>
                ) : (
                    <div className="vacation-request-list">
                        {requests.map(r => {
                            const cfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.vacaciones;
                            return (
                                <Card key={r.id} padding="md" className="vacation-request-card">
                                    <div className="vreq-header">
                                        <div className="vreq-info">
                                            <span
                                                className="vreq-type-dot"
                                                style={{ backgroundColor: cfg.cssVar }}
                                            />
                                            <span className="vreq-type-label">{cfg.label}</span>
                                            <span className="vreq-dates">
                                                {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                                            </span>
                                            <span className="vreq-days">
                                                ({r.working_days} {r.working_days === 1 ? 'día' : 'días'})
                                            </span>
                                        </div>
                                        <span className={`badge ${STATUS_CLS[r.status]}`}>
                                            {STATUS_LABELS[r.status]}
                                        </span>
                                    </div>
                                    {r.reason && (
                                        <p className="vreq-reason">{r.reason}</p>
                                    )}
                                    {r.manager_note && (
                                        <div className="vreq-manager-note">
                                            <Info size={13} />
                                            <span>{r.manager_note}</span>
                                        </div>
                                    )}
                                    {r.status === 'pending' && (
                                        <div className="vreq-cancel-row">
                                            {cancelError && confirmCancel === null && (
                                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)', marginRight: 'auto' }}>
                                                    {cancelError}
                                                </span>
                                            )}
                                            <button
                                                className={`vreq-cancel-btn${confirmCancel === r.id ? ' confirm' : ''}`}
                                                onClick={() => handleCancel(r.id)}
                                                disabled={cancelling && confirmCancel === r.id}
                                            >
                                                {confirmCancel === r.id
                                                    ? (cancelling ? 'Cancelando...' : '¿Confirmar cancelación?')
                                                    : 'Cancelar solicitud'}
                                            </button>
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Modal ────────────────────────────────────────────────────── */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Nueva Solicitud"
                size="md"
            >
                <form onSubmit={handleSubmit} className="vacation-form">
                    {/* Type selector */}
                    <div className="form-group">
                        <label className="form-label">Tipo de solicitud</label>
                        <div className="vform-type-selector">
                            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`vform-type-btn${form.type === type ? ' active' : ''}`}
                                    style={{ '--type-color': cfg.cssVar }}
                                    onClick={() => setForm(f => ({ ...f, type }))}
                                >
                                    {cfg.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Fecha inicio</label>
                            <input
                                type="date"
                                className="form-input"
                                value={form.start_date}
                                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Fecha fin</label>
                            <input
                                type="date"
                                className="form-input"
                                value={form.end_date}
                                min={form.start_date}
                                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    {/* Working days preview */}
                    {form.start_date && form.end_date && (
                        <div className="vform-days-preview">
                            <Calendar size={14} />
                            <span>
                                {workingDaysPreview > 0
                                    ? `${workingDaysPreview} día${workingDaysPreview !== 1 ? 's' : ''} laborable${workingDaysPreview !== 1 ? 's' : ''}`
                                    : 'Sin días laborables en el rango seleccionado'
                                }
                            </span>
                            {form.type === 'vacaciones' && workingDaysPreview > 0 && (
                                <span className={workingDaysPreview > balance.remaining ? 'days-warning' : 'days-ok'}>
                                    · {balance.remaining} disponibles
                                </span>
                            )}
                        </div>
                    )}

                    {/* Reason */}
                    <div className="form-group">
                        <label className="form-label">
                            Motivo <span className="form-label-hint">(opcional para vacaciones)</span>
                        </label>
                        <textarea
                            className="form-textarea"
                            value={form.reason}
                            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                            rows={3}
                            placeholder="Describe brevemente el motivo..."
                            maxLength={500}
                        />
                    </div>

                    {formError && <p className="form-error">{formError}</p>}

                    <div className="form-actions">
                        <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="primary" disabled={submitting}>
                            {submitting ? 'Enviando...' : 'Solicitar'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
