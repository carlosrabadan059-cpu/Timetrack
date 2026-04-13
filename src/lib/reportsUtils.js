import { differenceInHours, parseISO, isSameDay, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { MOCK_ATTENDANCE, MOCK_USERS } from './mockData';

/**
 * Calculate stats for a given period and employee filter
 */
export const calculatePeriodStats = (startDate, endDate, employeeId = 'all') => {
    // 1. Filter attendance records
    console.log('Calculating stats:', { startDate, endDate, employeeId });
    if (!MOCK_ATTENDANCE) {
        console.error('MOCK_ATTENDANCE is undefined!');
        return { totalHours: 0, overtimeHours: 0, absenteeism: 0, punctuality: 0 };
    }
    const relevantRecords = MOCK_ATTENDANCE.filter(record => {
        if (!record || !record.timestamp) return false;
        try {
            const recordDate = parseISO(record.timestamp);
            const inDateRange = isWithinInterval(recordDate, { start: startDate, end: endDate });
            const matchesEmployee = employeeId === 'all' || record.user_id === employeeId;
            return inDateRange && matchesEmployee;
        } catch (e) {
            console.error('Error parsing record:', record, e);
            return false;
        }
    });

    // 2. Calculate Total Hours
    let totalSeconds = 0;

    // Group by day/user to calculate fully paired sessions
    // For simplicity in this mock, we'll just sum up "in" to "out" pairs if possible
    // or just use a helper if we had one. 
    // Let's use a simplified approach: Iterate and find pairs.
    const sortedRecords = [...relevantRecords].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Basic calculation loop
    let tempIn = {};

    sortedRecords.forEach(record => {
        if (record.type === 'check_in') {
            tempIn[record.user_id] = record.timestamp;
        } else if (record.type === 'check_out' && tempIn[record.user_id]) {
            const start = parseISO(tempIn[record.user_id]);
            const end = parseISO(record.timestamp);
            const diff = (end - start) / 1000; // seconds
            totalSeconds += diff;
            delete tempIn[record.user_id];
        }
    });

    const totalHours = totalSeconds / 3600;

    // 3. Estimate Overtime (Dummy logic: anything > 160h/month global is overtime, just for demo)
    // Or better: > 8h per day per person.
    let overtimeSeconds = 0;
    // We would need to group by day and user to do this accurately.
    // Skipping complex overtime logic for MVP, returning a placeholder calculation
    const estimatedOvertime = totalHours * 0.05; // 5% is overtime

    // 4. Absenteeism (Mocked based on "incidences" count if we had them linked, or just random)
    const absenteeismRate = 2.5; // %

    return {
        totalHours: Math.round(totalHours),
        overtimeHours: Math.round(estimatedOvertime),
        absenteeism: absenteeismRate,
        punctuality: 96 // %
    };
};

/**
 * Generate chart data: Hours per day
 */
export const generateChartData = (startDate, endDate, employeeId = 'all') => {
    // Generate array of days between start and end
    const days = [];
    let current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        // Mock random data for the chart to look nice since our mock DB is sparse
        const dayLabel = current.getDate();
        const baseHours = employeeId === 'all' ? 40 : 8; // Scale based on selection
        const variance = Math.random() * (baseHours * 0.2);

        days.push({
            name: `${dayLabel}`,
            hours: Math.round((baseHours - 1 + Math.random() * 2) * 10) / 10, // 7-9h or 35-45h
        });
        current.setDate(current.getDate() + 1);
    }
    return days;
};

/**
 * Get Table Data
 */
export const getReportTableData = (startDate, endDate, employeeId = 'all') => {
    // Filter records
    const records = MOCK_ATTENDANCE.filter(r => {
        const d = parseISO(r.timestamp);
        return isWithinInterval(d, { start: startDate, end: endDate }) &&
            (employeeId === 'all' || r.user_id === employeeId);
    });

    // We simply return the raw records enriched with user names for the list view
    return records.map(r => {
        const user = MOCK_USERS.find(u => u.id === r.user_id);
        return {
            id: r.id,
            user_id: r.user_id,
            userName: user?.profile?.name || 'Unknown',
            date: r.timestamp,
            type: r.type,
            device: r.device || 'Web'
        };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
};
