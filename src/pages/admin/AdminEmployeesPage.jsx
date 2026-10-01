import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, Edit2, Trash, Search, Download, RotateCcw } from 'lucide-react';
import { Card, Button, Modal, Input } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import './AdminEmployeesPage.css';

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name[0] ?? 'U').toUpperCase();
}

const ROLE_LABELS = { admin: 'Administrador', manager: 'Manager', employee: 'Empleado' };

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const AdminEmployeesPage = () => {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openActionId, setOpenActionId] = useState(null);
    const [menuPos, setMenuPos] = useState(null); // estilo fixed del menú de acciones
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [formData, setFormData] = useState({ full_name: '', email: '', role: 'employee', manager_id: '' });
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [managers, setManagers] = useState([]);
    const [view, setView] = useState('active'); // 'active' | 'inactive'
    const [bajaTarget, setBajaTarget] = useState(null);
    const [bajaLoading, setBajaLoading] = useState(false);
    const [bajaError, setBajaError] = useState('');
    const [exportingId, setExportingId] = useState(null);

    const isAdmin = profile?.role === 'admin';

    useEffect(() => {
        if (profile?.role === 'admin') {
            api.get('/api/users', { role: 'manager', limit: 100 })
                .then(res => setManagers(res.data ?? []))
                .catch(() => {});
        }
    }, [profile?.role]);

    const managersMap = Object.fromEntries(managers.map(m => [m.id, m.full_name]));

    useEffect(() => {
        if (!openActionId) return;
        const close = () => setOpenActionId(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        document.addEventListener('click', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            document.removeEventListener('click', close);
        };
    }, [openActionId]);

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 50 };
            if (searchTerm) params.search = searchTerm;
            if (view === 'inactive') params.status = 'inactive';
            const res = await api.get('/api/users', params);
            setEmployees(res.data ?? []);
            setTotal(res.meta?.total ?? 0);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, [searchTerm, view]);

    useEffect(() => {
        const t = setTimeout(loadEmployees, 300);
        return () => clearTimeout(t);
    }, [loadEmployees]);

    const openCreate = () => {
        setEditingEmployee(null);
        setFormData({ full_name: '', email: '', role: 'employee', manager_id: '' });
        setFormError('');
        setIsModalOpen(true);
    };

    const openEdit = (emp) => {
        setEditingEmployee(emp);
        setFormData({ full_name: emp.full_name, email: emp.email, role: emp.role, manager_id: emp.manager_id ?? '' });
        setFormError('');
        setIsModalOpen(true);
        setOpenActionId(null);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEmployee(null);
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!formData.full_name.trim()) {
            setFormError('El nombre es obligatorio');
            return;
        }
        setFormLoading(true);
        try {
            if (editingEmployee) {
                const payload = {
                    full_name: formData.full_name.trim(),
                    role: formData.role,
                };
                if (isAdmin) {
                    payload.manager_id = formData.manager_id || null;
                }
                await api.patch(`/api/users/${editingEmployee.id}`, payload);
            } else {
                if (!formData.email.trim()) { setFormError('El email es obligatorio'); return; }
                if (!profile?.company_id) { setFormError('Sin empresa asignada'); return; }
                const payload = {
                    full_name: formData.full_name.trim(),
                    email: formData.email.trim(),
                    role: formData.role,
                    company_id: profile.company_id,
                };
                await api.post('/api/users', payload);
            }
            closeModal();
            loadEmployees();
        } catch (err) {
            setFormError(err.message);
        } finally {
            setFormLoading(false);
        }
    };

    const handleExport = async (emp) => {
        setOpenActionId(null);
        setExportingId(emp.id);
        try {
            const blob = await api.download(`/api/users/${emp.id}/registro/export`);
            triggerDownload(blob, `registro-jornada-${emp.employee_code ?? emp.id.slice(0, 8)}.xlsx`);
        } catch (err) {
            alert(`No se pudo descargar el registro: ${err.message}`);
        } finally {
            setExportingId(null);
        }
    };

    const openBaja = (emp) => {
        setOpenActionId(null);
        setBajaError('');
        setBajaTarget(emp);
    };

    const confirmBaja = async () => {
        setBajaLoading(true);
        setBajaError('');
        try {
            await api.delete(`/api/users/${bajaTarget.id}`);
            setBajaTarget(null);
            loadEmployees();
        } catch (err) {
            setBajaError(err.message);
        } finally {
            setBajaLoading(false);
        }
    };

    const handleReactivate = async (emp) => {
        setOpenActionId(null);
        if (!window.confirm(`¿Reactivar a ${emp.full_name}? Podrá volver a entrar en la app. El acceso físico (2N) hay que volver a darlo de alta.`)) return;
        try {
            await api.patch(`/api/users/${emp.id}`, { access_valid_to: null });
            loadEmployees();
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="admin-employees-page">
            <header className="page-header">
                <div>
                    <h1>Gestión de Empleados</h1>
                    <p className="text-muted">Administra usuarios y roles</p>
                </div>
                <div className="page-actions">
                    <Button onClick={openCreate} icon={Plus}>Nuevo Empleado</Button>
                </div>
            </header>

            <div className="employees-toolbar">
                <div className="search-container">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o email..."
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {isAdmin && (
                    <div className="employees-view-toggle" role="tablist">
                        <button
                            role="tab"
                            aria-selected={view === 'active'}
                            className={view === 'active' ? 'active' : ''}
                            onClick={() => setView('active')}
                        >
                            Activos
                        </button>
                        <button
                            role="tab"
                            aria-selected={view === 'inactive'}
                            className={view === 'inactive' ? 'active' : ''}
                            onClick={() => setView('inactive')}
                        >
                            Ex-empleados
                        </button>
                    </div>
                )}
            </div>
            {view === 'inactive' && (
                <p className="employees-inactive-note">
                    Datos bloqueados (art. 32 LOPDGDD): el registro de jornada de los ex-empleados se conserva 4 años
                    (art. 34.9 ET) solo para entregarlo al trabajador, a sus representantes o a la Inspección de Trabajo.
                </p>
            )}

            <Card padding="none" className="employees-table-card">
                <div className="table-responsive">
                    <table className="employees-table">
                        <thead>
                            <tr>
                                <th style={{ width: '30%' }}>Empleado</th>
                                <th>Código</th>
                                <th>Rol</th>
                                {isAdmin && <th>Supervisor</th>}
                                <th>Sync 2N</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                                        Cargando...
                                    </td>
                                </tr>
                            ) : employees.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                                        No hay empleados
                                    </td>
                                </tr>
                            ) : (
                                employees.map((emp) => (
                                    <tr key={emp.id} className="border-b border-border-light last:border-0 hover:bg-bg-secondary/50 transition-colors">
                                        <td className="p-4" style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/empleados/${emp.id}`)}>
                                            <div className="employee-cell">
                                                <div className="employee-avatar">
                                                    {getInitials(emp.full_name)}
                                                </div>
                                                <div className="employee-info">
                                                    <span className="employee-name">{emp.full_name}</span>
                                                    <span className="employee-email">{emp.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-muted text-sm">{emp.employee_code ?? '–'}</span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`role-badge ${emp.role}`}>
                                                {ROLE_LABELS[emp.role] ?? emp.role}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td className="p-4">
                                                <span className="text-sm text-muted">
                                                    {emp.manager_id ? (managersMap[emp.manager_id] ?? '–') : '–'}
                                                </span>
                                            </td>
                                        )}
                                        <td className="p-4">
                                            {view === 'inactive' ? (
                                                <span className="text-sm text-muted">
                                                    Baja: {emp.access_valid_to ? new Date(emp.access_valid_to).toLocaleDateString('es-ES') : '–'}
                                                </span>
                                            ) : (
                                                <span className={`status-badge ${emp.ac_synced ? 'active' : 'inactive'}`}>
                                                    {emp.ac_synced ? 'Synced' : 'Pendiente'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="relative">
                                                <button
                                                    className="employee-action-trigger"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (openActionId === emp.id) { setOpenActionId(null); return; }
                                                        const r = e.currentTarget.getBoundingClientRect();
                                                        const right = Math.max(8, window.innerWidth - r.right);
                                                        // Abrir hacia arriba si no caben ~3 opciones debajo
                                                        setMenuPos(window.innerHeight - r.bottom < 170
                                                            ? { right, bottom: window.innerHeight - r.top + 4 }
                                                            : { right, top: r.bottom + 4 });
                                                        setOpenActionId(emp.id);
                                                    }}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>
                                                {openActionId === emp.id && (
                                                    <div className="employee-action-menu" style={menuPos ?? undefined}>
                                                        {view === 'active' && (
                                                            <button
                                                                className="employee-action-btn"
                                                                onClick={(e) => { e.stopPropagation(); openEdit(emp); }}
                                                            >
                                                                <Edit2 size={16} className="text-muted" /> Editar
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                className="employee-action-btn"
                                                                disabled={exportingId === emp.id}
                                                                onClick={(e) => { e.stopPropagation(); handleExport(emp); }}
                                                            >
                                                                <Download size={16} className="text-muted" /> Descargar registro
                                                            </button>
                                                        )}
                                                        {isAdmin && view === 'active' && emp.id !== profile?.id && (
                                                            <button
                                                                className="employee-action-btn delete"
                                                                onClick={(e) => { e.stopPropagation(); openBaja(emp); }}
                                                            >
                                                                <Trash size={16} /> Dar de baja
                                                            </button>
                                                        )}
                                                        {isAdmin && view === 'inactive' && (
                                                            <button
                                                                className="employee-action-btn"
                                                                onClick={(e) => { e.stopPropagation(); handleReactivate(emp); }}
                                                            >
                                                                <RotateCcw size={16} className="text-muted" /> Reactivar
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {total > 0 && (
                    <div className="p-4 border-t border-border-light text-center text-xs text-muted">
                        {employees.length} de {total} usuarios
                    </div>
                )}
            </Card>

            <Modal
                isOpen={!!bajaTarget}
                onClose={() => !bajaLoading && setBajaTarget(null)}
                title={`Dar de baja a ${bajaTarget?.full_name ?? ''}`}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            icon={Download}
                            loading={exportingId === bajaTarget?.id}
                            onClick={() => handleExport(bajaTarget)}
                        >
                            Descargar registro
                        </Button>
                        <Button variant="danger" loading={bajaLoading} onClick={confirmBaja}>
                            Confirmar baja
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                    <p>Al dar de baja a este empleado:</p>
                    <ul style={{ paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        <li>Pierde el acceso a la app y a las instalaciones (lector 2N, tarjeta y PIN).</li>
                        <li>Se borran las coordenadas GPS de sus fichajes; se mantiene solo si fichó dentro o fuera de la sede.</li>
                        <li>Su registro de jornada <strong>se conserva 4 años</strong> (art. 34.9 ET), bloqueado, y después se borra automáticamente.</li>
                        <li>Pasa a la pestaña <em>Ex-empleados</em>, desde donde se puede reactivar.</li>
                    </ul>
                    <p>Antes de confirmar, descarga su registro para entregarle una copia.</p>
                    {bajaError && <p style={{ color: 'var(--color-danger, #ef4444)', margin: 0 }}>{bajaError}</p>}
                </div>
            </Modal>

            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={editingEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                    <div className="form-group full">
                        <label>Nombre Completo</label>
                        <Input
                            value={formData.full_name}
                            onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                            required
                        />
                    </div>
                    {!editingEmployee && (
                        <div className="form-group full">
                            <label>Email Corporativo</label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                required
                            />
                        </div>
                    )}
                    <div className="form-group full">
                        <label>Rol</label>
                        <select
                            className="input-field"
                            value={formData.role}
                            onChange={e => setFormData(prev => ({ ...prev, role: e.target.value, manager_id: '' }))}
                        >
                            <option value="employee">Empleado</option>
                            <option value="manager">Supervisor</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    {isAdmin && formData.role === 'employee' && managers.length > 0 && (
                        <div className="form-group full">
                            <label>Supervisor asignado</label>
                            <select
                                className="input-field"
                                value={formData.manager_id}
                                onChange={e => setFormData(prev => ({ ...prev, manager_id: e.target.value }))}
                            >
                                <option value="">Sin supervisor (gestiona el admin)</option>
                                {managers.map(m => (
                                    <option key={m.id} value={m.id}>{m.full_name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {formError && (
                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-danger, #ef4444)', margin: 0 }}>
                            {formError}
                        </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                        <Button variant="ghost" onClick={closeModal} type="button">Cancelar</Button>
                        <Button type="submit" loading={formLoading}>
                            {editingEmployee ? 'Guardar Cambios' : 'Crear Empleado'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AdminEmployeesPage;
