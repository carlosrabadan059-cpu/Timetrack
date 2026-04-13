/**
 * Utility functions for Employee Management
 */

// Parse CSV content
export const parseCSV = (content) => {
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Expected headers: nombre, email, password, rol, turno_entrada, turno_salida
    const required = ['nombre', 'email', 'password', 'rol'];
    const missing = required.filter(h => !headers.includes(h));

    if (missing.length > 0) {
        throw new Error(`Faltan columnas requeridas: ${missing.join(', ')}`);
    }

    const results = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());
        if (values.length !== headers.length) {
            errors.push(`Línea ${i + 1}: Número incorrecto de columnas`);
            continue;
        }

        const entry = {};
        headers.forEach((h, index) => {
            entry[h] = values[index];
        });

        // Basic validation
        if (!entry.email || !entry.email.includes('@')) {
            errors.push(`Línea ${i + 1}: Email inválido (${entry.email})`);
            continue;
        }

        // Map to app structure
        results.push({
            id: `imported-${Date.now()}-${i}`,
            email: entry.email,
            password: entry.password, // In a real app complexity check
            user_metadata: {
                full_name: entry.nombre,
                role: entry.rol?.toLowerCase() || 'employee',
            },
            schedule: {
                start: entry.turno_entrada || '09:00',
                end: entry.turno_salida || '18:00',
                type: 'fixed'
            }
        });
    }

    return { results, errors };
};

// Generate initials for avatar
export const getInitials = (name) => {
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
};

export const validateEmployeeForm = (data) => {
    const errors = {};
    if (!data.name || data.name.length < 2) errors.name = 'El nombre es obligatorio';
    if (!data.email || !data.email.includes('@')) errors.email = 'Email inválido';
    if (!data.password || data.password.length < 6) errors.password = 'Mínimo 6 caracteres';
    if (!data.role) errors.role = 'Selecciona un rol';

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};
