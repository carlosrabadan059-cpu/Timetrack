import { useState } from 'react';
import {
    Plus,
    Upload,
    MoreVertical,
    Edit2,
    Trash,
    Search,
    Clock,
    Calendar,
    Store
} from 'lucide-react';
import { Card, Button, Modal, Input } from '../../components/ui';
import { MOCK_USERS } from '../../lib/mockData';
import { getInitials, validateEmployeeForm, parseCSV } from '../../lib/employeeUtils';
import './AdminEmployeesPage.css';

// Mock Branches for Dropdown (Should match Settings)
const BRANCHES = [
    { id: 1, name: 'Sede Central' },
    { id: 2, name: 'Delegación Norte' }
];

const AdminEmployeesPage = () => {
    // State
    const [employees, setEmployees] = useState(MOCK_USERS);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [openActionId, setOpenActionId] = useState(null);
    const [editingId, setEditingId] = useState(null); // ID of employee being edited

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        branchId: '1', // Default to HQ
        startHour: '09:00',
        endHour: '18:00',
        workDays: ['L', 'M', 'X', 'J', 'V']
    });
    const [formErrors, setFormErrors] = useState({});

    // Filter Logic
    const filteredEmployees = employees.filter(emp =>
        emp.profile.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handlers
    const handleCreateSubmit = (e) => {
        e.preventDefault();
        const { isValid, errors } = validateEmployeeForm(formData);

        if (!isValid) {
            setFormErrors(errors);
            return;
        }

        if (editingId) {
            // Update existing employee
            setEmployees(prev => prev.map(emp => {
                if (emp.id === editingId) {
                    return {
                        ...emp,
                        email: formData.email,
                        role: formData.role,
                        profile: {
                            ...emp.profile, // Keep avatar
                            name: formData.name,
                            branchId: parseInt(formData.branchId),
                            schedule: {
                                start: formData.startHour,
                                end: formData.endHour,
                                days: formData.workDays
                            }
                        }
                    };
                }
                return emp;
            }));
        } else {
            // Create New
            const newEmployee = {
                id: `new-${Date.now()}`,
                email: formData.email,
                role: formData.role,
                profile: {
                    name: formData.name,
                    avatar: null,
                    branchId: parseInt(formData.branchId),
                    schedule: {
                        start: formData.startHour,
                        end: formData.endHour,
                        days: formData.workDays
                    }
                },
                status: 'active'
            };
            setEmployees([newEmployee, ...employees]);
        }

        closeModal();
    };

    const closeModal = () => {
        setIsCreateModalOpen(false);
        setEditingId(null);
        setFormData({
            name: '', email: '', password: '', role: 'employee', branchId: '1',
            startHour: '09:00', endHour: '18:00', workDays: ['L', 'M', 'X', 'J', 'V']
        });
        setFormErrors({});
    };

    const handleEditClick = (emp) => {
        setEditingId(emp.id);
        setFormData({
            name: emp.profile.name,
            email: emp.email,
            password: '', // Don't show password
            role: emp.role,
            branchId: emp.profile.branchId?.toString() || '1',
            startHour: emp.profile.schedule?.start || '09:00',
            endHour: emp.profile.schedule?.end || '18:00',
            workDays: emp.profile.schedule?.days || ['L', 'M', 'X', 'J', 'V']
        });
        setIsCreateModalOpen(true);
        setOpenActionId(null);
    };

    const handleDeactivate = (id) => {
        if (window.confirm('¿Seguro que quieres desactivar a este empleado?')) {
            setEmployees(prev => prev.map(emp =>
                emp.id === id ? { ...emp, status: 'inactive' } : emp
            ));
        }
        setOpenActionId(null);
    };

    const handleImportFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const { results, errors } = parseCSV(event.target.result);
                if (errors.length > 0) {
                    alert(`Errores:\n${errors.join('\n')}`);
                }

                const newEmployees = results.map(r => ({
                    id: r.id,
                    email: r.email,
                    role: r.user_metadata.role,
                    profile: {
                        name: r.user_metadata.full_name,
                        branchId: 1, // Default imported to HQ for now
                        schedule: r.schedule
                    },
                    status: 'active'
                }));

                setEmployees([...newEmployees, ...employees]);
                setIsImportModalOpen(false);
                alert(`Se han importado ${newEmployees.length} empleados correctamente.`);
            } catch (err) {
                alert('Error al procesar archivo: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const toggleDay = (day) => {
        setFormData(prev => ({
            ...prev,
            workDays: prev.workDays.includes(day)
                ? prev.workDays.filter(d => d !== day)
                : [...prev.workDays, day]
        }));
    };

    const getBranchName = (id) => {
        if (!id) return 'Sede Central'; // Default legacy
        const branch = BRANCHES.find(b => b.id === id);
        return branch ? branch.name : 'Desconocida';
    };

    return (
        <div className="admin-employees-page">
            <header className="page-header">
                <div>
                    <h1>Gestión de Empleados</h1>
                    <p className="text-muted">Administra usuarios, turnos y sucursales</p>
                </div>
                <div className="page-actions">
                    <Button variant="outline" onClick={() => setIsImportModalOpen(true)} icon={Upload}>
                        Importar CSV
                    </Button>
                    <Button onClick={() => setIsCreateModalOpen(true)} icon={Plus}>
                        Nuevo Empleado
                    </Button>
                </div>
            </header>

            {/* Actions Toolbar */}
            <div className="employees-toolbar">
                <div className="search-container">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar empleado por nombre, email o rol..."
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="toolbar-actions">
                    {/* Future: Filters here */}
                </div>
            </div>

            {/* Table */}
            <Card padding="none" className="employees-table-card">
                <div className="table-responsive">
                    <table className="employees-table">
                        <thead>
                            <tr>
                                <th style={{ width: '30%' }}>Empleado</th>
                                <th>Rol</th>
                                <th>Sede</th>
                                <th>Horario</th>
                                <th>Estado</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.map((emp) => (
                                <tr key={emp.id} className="border-b border-border-light last:border-0 hover:bg-bg-secondary/50 transition-colors">
                                    <td className="p-4">
                                        <div className="employee-cell">
                                            <div className="employee-avatar">
                                                {getInitials(emp.profile?.name || 'User')}
                                            </div>
                                            <div className="employee-info">
                                                <span className="employee-name">{emp.profile?.name}</span>
                                                <span className="employee-email">{emp.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`role-badge ${emp.role}`}>
                                            {emp.role === 'admin' ? 'Administrador' : 'Empleado'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Store size={14} className="text-muted" />
                                            <span>{getBranchName(emp.profile?.branchId)}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1 text-muted text-xs">
                                            <div className="flex items-center gap-1">
                                                <Clock size={12} />
                                                {emp.profile?.schedule?.start || '09:00'} - {emp.profile?.schedule?.end || '18:00'}
                                            </div>
                                            {emp.profile?.schedule?.days && (
                                                <div className="flex items-center gap-1">
                                                    <Calendar size={12} />
                                                    {emp.profile.schedule.days.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`status-badge ${emp.status || 'active'}`}>
                                            {emp.status || 'Active'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="relative">
                                            <button
                                                className="employee-action-trigger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenActionId(openActionId === emp.id ? null : emp.id)
                                                }}
                                            >
                                                <MoreVertical size={18} />
                                            </button>

                                            {openActionId === emp.id && (
                                                <div className="employee-action-menu">
                                                    <button
                                                        className="employee-action-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEditClick(emp);
                                                        }}
                                                    >
                                                        <Edit2 size={16} className="text-muted" /> Editar
                                                    </button>
                                                    <button
                                                        className="employee-action-btn delete"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeactivate(emp.id);
                                                        }}
                                                    >
                                                        <Trash size={16} /> Borrar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                isOpen={isCreateModalOpen}
                onClose={closeModal}
                title={editingId ? "Editar Empleado" : "Nuevo Empleado"}
            >
                <form onSubmit={handleCreateSubmit} className="mt-4">
                    <div className="form-grid">
                        <div className="form-group full">
                            <label>Nombre Completo</label>
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                error={formErrors.name}
                            />
                        </div>
                        <div className="form-group">
                            <label>Email Corporativo</label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                error={formErrors.email}
                            />
                        </div>
                        <div className="form-group">
                            <label>Contraseña (Provisional)</label>
                            <Input
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                error={formErrors.password}
                            />
                        </div>
                        <div className="form-group">
                            <label>Rol</label>
                            <select
                                className="input-field"
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                            >
                                <option value="employee">Empleado</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div className="form-group full">
                            <label>Sede / Delegación</label>
                            <select
                                className="input-field"
                                value={formData.branchId}
                                onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                            >
                                {BRANCHES.map(branch => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-border-light pt-6 mt-2 mb-4">
                        <h4 className="form-section-title">Configuración de Turno</h4>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Hora Entrada</label>
                                <Input
                                    type="time"
                                    value={formData.startHour}
                                    onChange={e => setFormData({ ...formData, startHour: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Hora Salida</label>
                                <Input
                                    type="time"
                                    value={formData.endHour}
                                    onChange={e => setFormData({ ...formData, endHour: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Días Laborables</label>
                            <div className="week-selector">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => (
                                    <div
                                        key={day}
                                        className={`day-checkbox ${formData.workDays.includes(day) ? 'selected' : ''}`}
                                        onClick={() => toggleDay(day)}
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button variant="ghost" onClick={closeModal} type="button">Cancelar</Button>
                        <Button type="submit">{editingId ? 'Guardar Cambios' : 'Crear Empleado'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Import Modal */}
            <Modal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                title="Importación Masiva (CSV)"
            >
                <div className="mt-4">
                    <p className="text-sm text-muted mb-4">
                        Sube un archivo CSV con las columnas: <code>nombre, email, password, rol, sucursal_id, turno_entrada, turno_salida</code>.
                    </p>

                    <div className="import-area relative">
                        <input
                            type="file"
                            accept=".csv"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleImportFile}
                        />
                        <div className="pointer-events-none">
                            <Upload className="mx-auto mb-2 text-primary" size={32} />
                            <p className="font-medium">Arrastra tu archivo aquí</p>
                            <p className="text-xs text-muted mt-1">o haz clic para seleccionar</p>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>Cerrar</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminEmployeesPage;
