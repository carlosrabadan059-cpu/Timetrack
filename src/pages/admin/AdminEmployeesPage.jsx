import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, Edit2, Trash, Search } from 'lucide-react';
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

const AdminEmployeesPage = () => {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openActionId, setOpenActionId] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [formData, setFormData] = useState({ full_name: '', email: '', role: 'employee' });
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 50 };
            if (searchTerm) params.search = searchTerm;
            const res = await api.get('/api/users', params);
            setEmployees(res.data ?? []);
            setTotal(res.meta?.total ?? 0);
        } catch {
            // keep existing
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    useEffect(() => {
        const t = setTimeout(loadEmployees, 300);
        return () => clearTimeout(t);
    }, [loadEmployees]);

    const openCreate = () => {
        setEditingEmployee(null);
        setFormData({ full_name: '', email: '', role: 'employee' });
        setFormError('');
        setIsModalOpen(true);
    };

    const openEdit = (emp) => {
        setEditingEmployee(emp);
        setFormData({ full_name: emp.full_name, email: emp.email, role: emp.role });
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
                await api.patch(`/api/users/${editingEmployee.id}`, {
                    full_name: formData.full_name.trim(),
                    role: formData.role,
                });
            } else {
                if (!formData.email.trim()) { setFormError('El email es obligatorio'); return; }
                if (!profile?.company_id) { setFormError('Sin empresa asignada'); return; }
                await api.post('/api/users', {
                    full_name: formData.full_name.trim(),
                    email: formData.email.trim(),
                    company_id: profile.company_id,
                });
            }
            closeModal();
            loadEmployees();
        } catch (err) {
            setFormError(err.message);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeactivate = async (id) => {
        setOpenActionId(null);
        try {
            await api.delete(`/api/users/${id}`);
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
            </div>

            <Card padding="none" className="employees-table-card">
                <div className="table-responsive">
                    <table className="employees-table">
                        <thead>
                            <tr>
                                <th style={{ width: '35%' }}>Empleado</th>
                                <th>Código</th>
                                <th>Rol</th>
                                <th>Sync 2N</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                                        Cargando...
                                    </td>
                                </tr>
                            ) : employees.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
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
                                        <td className="p-4">
                                            <span className={`status-badge ${emp.ac_synced ? 'active' : 'inactive'}`}>
                                                {emp.ac_synced ? 'Synced' : 'Pendiente'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="relative">
                                                <button
                                                    className="employee-action-trigger"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenActionId(openActionId === emp.id ? null : emp.id);
                                                    }}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>
                                                {openActionId === emp.id && (
                                                    <div className="employee-action-menu">
                                                        <button
                                                            className="employee-action-btn"
                                                            onClick={(e) => { e.stopPropagation(); openEdit(emp); }}
                                                        >
                                                            <Edit2 size={16} className="text-muted" /> Editar
                                                        </button>
                                                        <button
                                                            className="employee-action-btn delete"
                                                            onClick={(e) => { e.stopPropagation(); handleDeactivate(emp.id); }}
                                                        >
                                                            <Trash size={16} /> Revocar acceso
                                                        </button>
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
                            onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                        >
                            <option value="employee">Empleado</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
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
