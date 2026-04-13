import { useState, useMemo } from 'react';
import {
    Search,
    Filter,
    MapPin,
    Smartphone,
    Globe,
    AlertCircle,
    CheckCircle
} from 'lucide-react';
import { Card } from '../../components/ui';
import { MOCK_ATTENDANCE, MOCK_USERS } from '../../lib/mockData';
import { format, parseISO, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import './AdminAttendancePage.css';

const AdminAttendancePage = () => {
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');

    // Filter Logic
    const filteredRecords = useMemo(() => {
        return MOCK_ATTENDANCE.filter(record => {
            const user = MOCK_USERS.find(u => u.id === record.user_id);
            const userName = user?.profile?.name || '';

            // Text Search
            const matchesSearch = userName.toLowerCase().includes(searchTerm.toLowerCase());

            // Type Filter
            const matchesType = typeFilter === 'all' || record.type === typeFilter;

            // Date Filter
            let matchesDate = true;
            if (dateFilter) {
                const recordDate = parseISO(record.timestamp);
                const filterDate = parseISO(dateFilter);
                matchesDate = isSameDay(recordDate, filterDate);
            }

            return matchesSearch && matchesType && matchesDate;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }, [searchTerm, typeFilter, dateFilter]);

    // Helpers
    const getUser = (id) => MOCK_USERS.find(u => u.id === id)?.profile || { name: 'Desconocido', email: '' };

    return (
        <div className="admin-attendance-page">
            <header className="page-header">
                <div>
                    <h1>Listado de Fichajes</h1>
                    <p className="text-muted">Registro completo de entradas y salidas</p>
                </div>
            </header>

            {/* Filters */}
            <Card className="filters-attendance-card" padding="sm">
                <div className="filters-row">
                    <div className="search-group">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Buscar por empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="filter-group">
                        <select
                            className="filter-select"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="all">Todos los tipos</option>
                            <option value="check_in">Entradas</option>
                            <option value="check_out">Salidas</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <input
                            type="date"
                            className="date-filter"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        />
                    </div>
                </div>
            </Card>

            {/* Table */}
            <Card className="table-card" padding="none">
                <div className="attendance-table-container">
                    <table className="attendance-table">
                        <thead>
                            <tr>
                                <th>Fecha / Hora</th>
                                <th>Empleado</th>
                                <th>Tipo</th>
                                <th>Etiqueta</th>
                                <th>Ubicación</th>
                                <th>Dispositivo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.length > 0 ? (
                                filteredRecords.map(record => {
                                    const user = getUser(record.user_id);
                                    return (
                                        <tr key={record.id}>
                                            <td>
                                                <div className="font-medium">
                                                    {format(parseISO(record.timestamp), 'd MMM yyyy', { locale: es })}
                                                </div>
                                                <div className="text-muted text-xs">
                                                    {format(parseISO(record.timestamp), 'HH:mm:ss')}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="attendance-user">{user.name}</div>
                                                <div className="attendance-email">{MOCK_USERS.find(u => u.id === record.user_id)?.email}</div>
                                            </td>
                                            <td>
                                                <span className={`type-indicator ${record.type}`}>
                                                    {record.type === 'check_in' ? 'Entrada' : 'Salida'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-sm capitalize">{record.label || 'Normal'}</span>
                                            </td>
                                            <td>
                                                {record.is_in_zone ? (
                                                    <span className="location-badge in-zone" title="En zona permitida">
                                                        <CheckCircle size={10} /> En Zona
                                                    </span>
                                                ) : (
                                                    <span className="location-badge out-zone" title="Fuera de zona">
                                                        <AlertCircle size={10} /> Fuera de Zona
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1 text-muted text-sm">
                                                    {record.origin === 'mobile' ? <Smartphone size={14} /> : <Globe size={14} />}
                                                    <span className="capitalize">{record.origin || 'Web'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center py-8 text-muted">
                                        No se encontraron registros
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-border-light text-center text-xs text-muted">
                    Mostrando {filteredRecords.length} registros
                </div>
            </Card>
        </div>
    );
};

export default AdminAttendancePage;
