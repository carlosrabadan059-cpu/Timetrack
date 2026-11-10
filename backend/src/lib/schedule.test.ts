import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFichaje, expectedExit, type ScheduleSettings } from './schedule.js';
import { localParts } from './madrid-time.js';

const base: ScheduleSettings = {
  start: '08:00',
  end: '17:00',
  flexEnabled: true,
  flexMinutes: 60,
  exitToleranceMinutes: 15,
  workDays: [1, 2, 3, 4, 5],
  holidays: [],
};

// 2026-11-10 is a Tuesday in CET (UTC+1): 08:40 Madrid = 07:40Z
const tue = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 10, h - 1, m));
};
const hhmm = (d: Date | null) => {
  if (!d) return null;
  const { minutes } = localParts(d);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
const evalAt = (time: string, direction: 'in' | 'out', firstIn: string | null, detailType = 'normal', s = base) =>
  evaluateFichaje({ ts: tue(time), direction, detailType, firstInToday: firstIn ? tue(firstIn) : null, settings: s });

test('salida prevista = entrada + duración oficial', () => {
  assert.equal(hhmm(expectedExit(tue('08:40'), base)), '17:40');
  assert.equal(hhmm(expectedExit(tue('09:20'), base)), '18:20');
});

test('entrada antes del inicio oficial cuenta como inicio', () => {
  assert.equal(hhmm(expectedExit(tue('07:45'), base)), '17:00');
});

test('entrada dentro de la ventana flexible no se marca', () => {
  assert.equal(evalAt('08:00', 'in', null), null);
  assert.equal(evalAt('09:00', 'in', null), null);
  assert.equal(evalAt('07:30', 'in', null), null);
});

test('entrada después de la ventana flexible es tardía', () => {
  assert.equal(evalAt('09:01', 'in', null), 'late_entry');
  assert.equal(evalAt('09:20', 'in', null), 'late_entry');
});

test('sin flexibilidad, la entrada debe ser a la hora oficial', () => {
  const s = { ...base, flexEnabled: false };
  assert.equal(evalAt('08:00', 'in', null, 'normal', s), null);
  assert.equal(evalAt('08:01', 'in', null, 'normal', s), 'late_entry');
});

test('volver de una pausa no es entrada tardía', () => {
  assert.equal(evalAt('15:00', 'in', '08:40'), null);
});

test('salida anticipada respecto a la salida calculada, con tolerancia', () => {
  assert.equal(evalAt('17:20', 'out', '08:40'), 'early_exit'); // prevista 17:40, límite 17:25
  assert.equal(evalAt('17:25', 'out', '08:40'), null);
  assert.equal(evalAt('17:30', 'out', '08:40'), null);
  assert.equal(evalAt('18:30', 'out', '08:40'), null);
});

test('las salidas de pausa nunca se marcan', () => {
  assert.equal(evalAt('14:00', 'out', '08:40', 'comida'), null);
  assert.equal(evalAt('11:00', 'out', '08:40', 'medico'), null);
});

test('fin de semana y festivos sin marcas', () => {
  const sat = new Date(Date.UTC(2026, 10, 14, 9, 30)); // sábado 10:30 Madrid
  assert.equal(evaluateFichaje({ ts: sat, direction: 'in', detailType: 'normal', firstInToday: null, settings: base }), null);
  const holiday = { ...base, holidays: ['2026-11-10'] };
  assert.equal(evalAt('10:00', 'in', null, 'normal', holiday), null);
});

test('horario de verano (CEST): las horas se comparan en hora de Madrid', () => {
  // 2026-07-01 miércoles, UTC+2: 09:30 Madrid = 07:30Z
  const jul = (h: number, m: number) => new Date(Date.UTC(2026, 6, 1, h - 2, m));
  assert.equal(evaluateFichaje({ ts: jul(9, 30), direction: 'in', detailType: 'normal', firstInToday: null, settings: base }), 'late_entry');
  assert.equal(evaluateFichaje({ ts: jul(8, 30), direction: 'in', detailType: 'normal', firstInToday: null, settings: base }), null);
  assert.equal(hhmm(expectedExit(jul(8, 30), base)), '17:30');
});
