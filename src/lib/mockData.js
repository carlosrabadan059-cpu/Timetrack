/**
 * Mock Data Service
 * Temporary data layer until Supabase is configured
 */

// Mock Users
export const MOCK_USERS = [
    {
        id: 'user-1',
        email: 'empleado@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-1',
            name: 'Josema',
            role: 'employee',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z'
        }
    },
    {
        id: 'user-2',
        email: 'admin@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-2',
            name: 'Carlos Admin',
            role: 'admin',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z'
        }
    },
    {
        id: 'user-3',
        email: 'maria@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-3',
            name: 'María García',
            role: 'employee',
            is_active: true,
            created_at: '2026-01-05T00:00:00Z',
            work_schedule: {
                start: '09:00',
                end: '15:00', // Reduced schedule
                days: [1, 2, 3, 4, 5]
            }
        }
    },
    {
        id: 'user-4',
        email: 'pedro@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-4',
            name: 'Pedro López',
            role: 'employee',
            is_active: true,
            created_at: '2026-01-10T00:00:00Z'
        }
    },
    {
        id: 'user-5',
        email: 'laura@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-5',
            name: 'Laura Martínez',
            role: 'employee',
            is_active: true,
            created_at: '2026-01-02T00:00:00Z'
        }
    },
    {
        id: 'user-6',
        email: 'david@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-6',
            name: 'David Ruiz',
            role: 'employee',
            is_active: true,
            created_at: '2026-01-02T00:00:00Z'
        }
    },
    {
        id: 'user-7',
        email: 'sofia@timetrack.com',
        password: '123456',
        profile: {
            id: 'user-7',
            name: 'Sofía Chen',
            role: 'employee',
            is_active: true,
            created_at: '2026-01-02T00:00:00Z'
        }
    }
];

// Generate attendance entries for the current week
const generateWeeklyAttendance = (userId) => {
    const entries = [];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday

    for (let i = 0; i < 5; i++) { // Mon-Fri
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);

        if (day <= today) {
            // Check if day is before Jan 31, if so, skip (handled by January generator)
            // But we want to ensure "Today" (feb) is covered.
            // Simplified: Generate current week always. Duplicates shouldn't happen if dates distinct.

            // Entry - morning
            entries.push({
                id: `entry-${userId}-curr-${i}-1`,
                user_id: userId,
                type: 'check_in',
                label: 'normal',
                timestamp: new Date(day.setHours(9, Math.floor(Math.random() * 15), 0)).toISOString(),
                origin: 'web',
                is_in_zone: Math.random() > 0.1,
                location: { lat: 40.4168, lng: -3.7038 }
            });

            // Exit - lunch
            entries.push({
                id: `entry-${userId}-curr-${i}-2`,
                user_id: userId,
                type: 'check_out',
                label: 'comida',
                timestamp: new Date(day.setHours(14, Math.floor(Math.random() * 15), 0)).toISOString(),
                origin: 'web',
                is_in_zone: true,
                location: { lat: 40.4168, lng: -3.7038 }
            });

            // Entry - afternoon
            entries.push({
                id: `entry-${userId}-curr-${i}-3`,
                user_id: userId,
                type: 'check_in',
                label: 'normal',
                timestamp: new Date(day.setHours(15, Math.floor(Math.random() * 15), 0)).toISOString(),
                origin: 'web',
                is_in_zone: true,
                location: { lat: 40.4168, lng: -3.7038 }
            });

            // Exit - end of day relative to today
            if (day.toDateString() !== today.toDateString() || today.getHours() >= 18) {
                entries.push({
                    id: `entry-${userId}-curr-${i}-4`,
                    user_id: userId,
                    type: 'check_out',
                    label: 'normal',
                    timestamp: new Date(day.setHours(18, Math.floor(Math.random() * 30), 0)).toISOString(),
                    origin: 'web',
                    is_in_zone: true,
                    location: { lat: 40.4168, lng: -3.7038 }
                });
            }
        }
    }
    return entries;
};

// Generate attendance entries for January 2026
const generateJanuaryAttendance = (userId) => {
    const entries = [];
    // January 2026
    const startObj = new Date('2026-01-01T00:00:00');
    const endObj = new Date('2026-01-31T23:59:59');

    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
        // Skip weekends (0=Sun, 6=Sat)
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const dayStr = d.toISOString().split('T')[0];

        // Random variations
        const startHour = 8;
        const startMin = Math.floor(Math.random() * 30); // 08:00 - 08:30

        const lunchStartHour = 14;
        const lunchStartMin = Math.floor(Math.random() * 15);

        const lunchEndHour = 15;
        const lunchEndMin = Math.floor(Math.random() * 15);

        const endHour = 17;
        const endMin = 30 + Math.floor(Math.random() * 30); // 17:30 - 18:00

        // Morning In
        entries.push({
            id: `entry-${userId}-jan-${d.getDate()}-1`,
            user_id: userId,
            type: 'check_in',
            label: 'normal',
            timestamp: new Date(`${dayStr}T${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });

        // Lunch Out
        entries.push({
            id: `entry-${userId}-jan-${d.getDate()}-2`,
            user_id: userId,
            type: 'check_out',
            label: 'comida',
            timestamp: new Date(`${dayStr}T${lunchStartHour.toString().padStart(2, '0')}:${lunchStartMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });

        // Afternoon In
        entries.push({
            id: `entry-${userId}-jan-${d.getDate()}-3`,
            user_id: userId,
            type: 'check_in',
            label: 'normal',
            timestamp: new Date(`${dayStr}T${lunchEndHour.toString().padStart(2, '0')}:${lunchEndMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });

        // Day Out
        entries.push({
            id: `entry-${userId}-jan-${d.getDate()}-4`,
            user_id: userId,
            type: 'check_out',
            label: 'normal',
            timestamp: new Date(`${dayStr}T${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });
    }
    return entries;
};

// Generate attendance entries for February 2026
const generateFebruaryAttendance = (userId) => {
    const entries = [];
    // February 2026
    const startObj = new Date('2026-02-01T00:00:00');
    // Ensure accurate end date (Feb 28 in 2026)
    const endObj = new Date('2026-02-28T23:59:59');

    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
        // Skip weekends (0=Sun, 6=Sat)
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const dayStr = d.toISOString().split('T')[0];

        // Random variations
        const startHour = 8;
        const startMin = Math.floor(Math.random() * 30); // 08:00 - 08:30

        const lunchStartHour = 14;
        const lunchStartMin = Math.floor(Math.random() * 15);

        const lunchEndHour = 15;
        const lunchEndMin = Math.floor(Math.random() * 15);

        const endHour = 17;
        const endMin = 30 + Math.floor(Math.random() * 30); // 17:30 - 18:00

        // Morning In
        entries.push({
            id: `entry-${userId}-feb-${d.getDate()}-1`,
            user_id: userId,
            type: 'check_in',
            label: 'normal',
            timestamp: new Date(`${dayStr}T${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });

        // Lunch Out
        entries.push({
            id: `entry-${userId}-feb-${d.getDate()}-2`,
            user_id: userId,
            type: 'check_out',
            label: 'comida',
            timestamp: new Date(`${dayStr}T${lunchStartHour.toString().padStart(2, '0')}:${lunchStartMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });

        // Afternoon In
        entries.push({
            id: `entry-${userId}-feb-${d.getDate()}-3`,
            user_id: userId,
            type: 'check_in',
            label: 'normal',
            timestamp: new Date(`${dayStr}T${lunchEndHour.toString().padStart(2, '0')}:${lunchEndMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });

        // Day Out
        entries.push({
            id: `entry-${userId}-feb-${d.getDate()}-4`,
            user_id: userId,
            type: 'check_out',
            label: 'normal',
            timestamp: new Date(`${dayStr}T${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`).toISOString(),
            origin: 'web',
            is_in_zone: true,
            location: { lat: 40.4168, lng: -3.7038 }
        });
    }
    return entries;
};

// Generate entries for all employees
const employeeIds = ['user-1', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7'];
export const MOCK_ATTENDANCE = [
    ...employeeIds.flatMap(id => generateWeeklyAttendance(id)),
    ...employeeIds.flatMap(id => generateJanuaryAttendance(id)),
    ...employeeIds.flatMap(id => generateFebruaryAttendance(id))
];

// Mock Correction Requests
export const MOCK_CORRECTIONS = [
    {
        id: 'corr-1',
        user_id: 'user-3',
        entry_id: 'entry-user-3-0-1',
        original_timestamp: '2026-01-27T09:15:00Z',
        proposed_timestamp: '2026-01-27T08:45:00Z',
        reason: 'olvido_fichaje',
        comment: 'Olvidé fichar al llegar, estaba en una reunión urgente',
        status: 'pending',
        admin_comment: null,
        created_at: '2026-01-27T10:00:00Z'
    },
    {
        id: 'corr-2',
        user_id: 'user-4',
        entry_id: 'entry-user-4-1-4',
        original_timestamp: '2026-01-28T18:00:00Z',
        proposed_timestamp: '2026-01-28T19:30:00Z',
        reason: 'hora_incorrecta',
        comment: 'Me quedé trabajando hasta las 19:30 pero fichó automáticamente',
        status: 'approved',
        admin_id: 'user-2',
        admin_comment: 'Verificado con registro de acceso',
        created_at: '2026-01-28T20:00:00Z',
        resolved_at: '2026-01-29T09:00:00Z'
    }
];

// Mock Incidents
export const MOCK_INCIDENTS = [
    {
        id: 'inc-1',
        user_id: 'user-1',
        type: 'medico',
        description: 'Cita médica programada',
        start_time: '2026-01-27T10:00:00Z',
        end_time: '2026-01-27T12:00:00Z',
        status: 'approved',
        created_at: '2026-01-25T08:00:00Z'
    }
];

// Company settings
export const MOCK_SETTINGS = {
    company_name: 'TimeTrack Demo',
    company_location: {
        lat: 40.4168,
        lng: -3.7038,
        address: 'Puerta del Sol, Madrid'
    },
    allowed_radius: 250, // meters
    timezone: 'Europe/Madrid',
    work_schedule: {
        start: '08:00',
        end: '17:30', // Updated to request
        flexibility_minutes: 60, // 1 hour flexibility
        days: [1, 2, 3, 4, 5] // Monday to Friday
    }
};

// Helper to calculate hours worked
export const calculateHoursWorked = (entries, userId) => {
    const userEntries = entries.filter(e => e.user_id === userId);
    let totalMinutes = 0;
    let lastCheckIn = null;

    const sortedEntries = [...userEntries].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
    );

    for (const entry of sortedEntries) {
        if (entry.type === 'check_in') {
            lastCheckIn = new Date(entry.timestamp);
        } else if (entry.type === 'check_out' && lastCheckIn) {
            const checkOut = new Date(entry.timestamp);
            totalMinutes += (checkOut - lastCheckIn) / 1000 / 60;
            lastCheckIn = null;
        }
    }

    // If currently checked in, count until now
    if (lastCheckIn) {
        totalMinutes += (new Date() - lastCheckIn) / 1000 / 60;
    }

    return {
        hours: Math.floor(totalMinutes / 60),
        minutes: Math.round(totalMinutes % 60),
        totalMinutes
    };
};

// Get current status of user
export const getCurrentStatus = (entries, userId) => {
    const userEntries = entries.filter(e => e.user_id === userId);
    const sortedEntries = [...userEntries].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    const lastEntry = sortedEntries[0];

    if (!lastEntry) {
        return { status: 'out', label: 'Fuera de jornada' };
    }

    if (lastEntry.type === 'check_in') {
        return { status: 'in', label: 'En jornada', since: lastEntry.timestamp };
    }

    return { status: 'out', label: 'Fuera de jornada' };
};

// Get weekly hours breakdown
export const getWeeklyHours = (entries, userId) => {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1);

    return days.slice(0, 5).map((day, index) => {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + index);

        const dayEntries = entries.filter(e => {
            const entryDate = new Date(e.timestamp);
            return e.user_id === userId &&
                entryDate.toDateString() === date.toDateString();
        });

        const { totalMinutes } = calculateHoursWorked(dayEntries, userId);

        return {
            day,
            hours: Math.round(totalMinutes / 60 * 10) / 10,
            date: date.toISOString()
        };
    });
};
