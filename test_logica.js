import fs from 'node:fs';
const html = fs.readFileSync('index.html', 'utf8');

// 1) Syntax check del script completo
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no se encontró el script'); process.exit(1); }
fs.writeFileSync('/tmp/app_script.js', m[1]);

// 2) Extraer lógica pura y probarla
const logic = m[1].split('/*LOGIC-START*/')[1].split('/*LOGIC-END*/')[0];
const L = new Function(logic + '; return {parseLista, toCSV, parseCSV, statsDia, resumenDia, newEv, normalizeEv, aMin, frecDia, frecGlobal, resumenFrecuencia, fmtTasa, lunesDe, isoWeek, etiquetaSemana, frecSemanas};')();
const seed = JSON.parse(fs.readFileSync('datos_eventos.json', 'utf8'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL:', msg); } }

// stats del día semilla
const st = L.statsDia(seed.eventos);
ok(st.total === 46, 'total 46, got ' + st.total);
ok(st.fuertes === 6, 'fuertes 6, got ' + st.fuertes);
ok(st.general === 5, 'general 5, got ' + st.general);
ok(st.ojos === 9, 'ojos 9, got ' + st.ojos);
ok(st.sutiles === 14, 'sutiles 14, got ' + st.sutiles);
ok(st.despierta === 0, 'despierta 0');
ok(st.porHora[9] === 14 && st.porHora[11] === 13, 'por hora 9h=14, 11h=13');
ok(st.horaMin === '08:05' && st.horaMax === '14:30', 'ventana 08:05–14:30');

// CSV roundtrip
const csv = L.toCSV(seed.eventos);
const back = L.parseCSV(csv);
ok(back.length === 46, 'csv roundtrip 46, got ' + back.length);
const e25 = back.find(e => e.id === 'seed19_25');
ok(e25 && e25.hora === '11:08' && e25.revisar && e25.intensidad === 'Fuerte' && e25.partes.includes('Generalizado'), 'evento 11:08 roundtrip');
const e36 = back.find(e => e.id === 'seed19_36');
ok(e36 && e36.horaFin === '11:47' && e36.varios && e36.dur === '2-5min', 'evento 11:44–47 roundtrip');
ok(back.every(e => e.fecha === '2026-11-19'), 'fechas roundtrip');

// Parser modo WhatsApp con la transcripción REAL
const raw = fs.readFileSync('test_transcript.txt', 'utf8');
const parsed = L.parseLista(raw, '2026-11-19', 'Dianita', 'Dormida');
ok(parsed.length === 47, 'parser 47 eventos (46 + duplicado 11:09), got ' + parsed.length);
const at = h => parsed.filter(e => e.hora === h);
ok(at('08:06')[0] && at('08:06')[0].lado === 'Izquierdo', 'continuación "Izquierda" → lado');
ok(at('08:11')[0] && at('08:11')[0].partes.includes('Mano'), '"8;11mano" parseado');
ok(at('08:40')[0] && at('08:40')[0].tipo === 'Sacudida', '"Como sacudida" → tipo');
ok(at('09:27')[0] && at('09:27')[0].partes.includes('Pecho') && at('09:27')[0].ojos, '"pecho tambien" + ojos → 9:27');
ok(at('09:41')[0] && at('09:41')[0].partes.includes('Generalizado'), '"fnral" → generalizado');
ok(at('10:58')[0] && at('10:58')[0].ojos, '"abrió los ojos" → 10:58');
ok(at('11:31')[0] && at('11:31')[0].ojos, '"luego abre los ojos" → 11:31');
ok(at('09:50')[0] && at('09:50')[0].partes.includes('Generalizado'), '"gneral" → generalizado');
ok(at('11:09')[0] && at('11:09')[0].revisar && at('11:09')[0].intensidad === 'Fuerte', '"Revisar nuevamente... fuerte" → 11:09');
ok(at('11:08')[0] && at('11:08')[0].revisar, '11:08 marcado revisar');
ok(at('11:40')[0] && at('11:40')[0].horaFin === '11:41', 'rango 11:40-41');
ok(at('11:44')[0] && at('11:44')[0].horaFin === '11:47', 'rango 11:44-47');
ok(at('12:07')[0] && at('12:07')[0].horaFin === '12:08' && at('12:07')[0].ojos, 'rango 12:07-08 + ojito');
ok(at('11:43')[0] && at('11:43')[0].ojos, '"Abre los ojos también" → 11:43');
ok(at('13:04').length === 1 && at('13:24').length === 1 && at('13:29').length === 1 && at('14:30').length === 1, 'PM inferido 13:04/13:24/13:29/14:30');
ok(at('13:24')[0] && at('13:24')[0].partes.includes('Mano'), '"Mano" → 13:24');
ok(at('09:44')[0] && at('09:44')[0].intensidad === 'Sutil', 'solo hora → Sutil');
ok(at('11:39')[0] && at('11:39')[0].habla && at('11:39')[0].intensidad === 'Fuerte', '11:39 fuerte y habla');
ok(at('11:28').length === 2, 'dos eventos a las 11:28');

// normalizeEv: fuerte+generalizado → revisar
const ne = L.normalizeEv(L.newEv('2026-11-20', '10:00', 'X', 'Despierta'));
ne.intensidad = 'Fuerte'; ne.partes = ['Generalizado'];
L.normalizeEv(ne);
ok(ne.revisar === true, 'auto revisar en fuerte generalizado');

// resumen WhatsApp
const txt = L.resumenDia('2026-11-19', seed.eventos, seed.contexto['2026-11-19'], '');
ok(txt.includes('Total: 46 eventos'), 'resumen total');
ok(txt.includes('🎥 Revisar/guardar video: 09:17, 11:08, 11:30, 11:44'), 'resumen videos: ' + (txt.match(/Revisar.*$/m) || [''])[0]);

// ---- Frecuencia (lo que pide el neurólogo) ----
ok(L.aMin('08:05') === 485 && L.aMin('14:30') === 870, 'aMin convierte HH:MM a minutos');
const fd = L.frecDia(seed.eventos, {});
ok(fd.total === 46 && fd.ventana === '08:05–14:31', 'frecDia ventana primer→último+1: ' + fd.ventana);
ok(Math.abs(fd.tasa - 7.15) < 0.01, 'frecDia tasa ≈7.15/h, got ' + fd.tasa);
ok(fd.obsReal === false, 'frecDia sin horario observado → obsReal false');
ok(Math.abs(fd.intervalo - 8.5556) < 0.01, 'frecDia intervalo medio ≈8.56 min, got ' + fd.intervalo);
const fdObs = L.frecDia(seed.eventos, { obsDesde: '08:00', obsHasta: '14:30' });
ok(fdObs.obsReal === true && fdObs.ventana === '08:00–14:30', 'frecDia con horario observado');
ok(Math.abs(fdObs.tasa - 7.077) < 0.01, 'frecDia tasa observada ≈7.08/h, got ' + fdObs.tasa);
const g = L.frecGlobal(seed.eventos, seed.contexto);
ok(g.dias === 1 && g.total === 46 && g.promDia === 46, 'frecGlobal 1 día, 46 eventos');
ok(g.fuertes === 6 && g.general === 5 && g.despierta === 0, 'frecGlobal fuertes/general/despierta');
ok(g.tendencia === null, 'frecGlobal sin tendencia con 1 día');
ok(g.porHora[9] === 14 && g.porHora[11] === 13, 'frecGlobal horas pico agregadas');
ok(g.porParte['Generalizado'] === 5 && g.porParte['Cara'] === 7, 'frecGlobal por parte: ' + JSON.stringify(g.porParte));
ok(g.porInt['Fuerte'] === 6 && g.porInt['Sutil'] === 14 && g.porInt['(sin indicar)'] === 26, 'frecGlobal por intensidad');
ok(g.porEstado['Dormida'] === 46, 'frecGlobal por estado');
const rf = L.resumenFrecuencia(g, '');
ok(rf.includes('FRECUENCIA') && rf.includes('eventos/hora') && rf.includes('19/11 · 46'), 'resumenFrecuencia texto');
// tendencia con un segundo día sintético (menos eventos → baisse)
const evs2 = seed.eventos.slice();
for (let i = 0; i < 10; i++) { const tm = i * 10; const hh = 8 + Math.floor(tm / 60), mm = tm % 60;
  evs2.push(L.newEv('2026-11-20', String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), 'X', 'Dormida')); }
const g2 = L.frecGlobal(evs2, seed.contexto);
ok(g2.dias === 2 && g2.tendencia && g2.tendencia.cambioPct < 0, 'frecGlobal tendencia negativa con 2º día más leve: ' + (g2.tendencia && g2.tendencia.cambioPct.toFixed(1)));

// ---- Frecuencia por semana ----
ok(L.lunesDe('2026-11-19') === '2026-11-16', 'lunesDe jueves 19 → lunes 16');
ok(L.lunesDe('2026-11-22') === '2026-11-16', 'lunesDe domingo 22 → mismo lunes 16');
ok(L.lunesDe('2026-11-23') === '2026-11-23', 'lunesDe lunes 23 → sí mismo');
ok(L.isoWeek('2026-01-01') === 1, 'isoWeek 1-ene-2026 = 1');
ok(L.isoWeek('2026-11-16') === L.isoWeek('2026-11-19') && L.isoWeek('2026-11-19') === L.isoWeek('2026-11-22'), 'isoWeek consistente lun–dom');
const sem = L.frecSemanas(seed.eventos, seed.contexto);
ok(sem.length === 1 && sem[0].lunes === '2026-11-16', 'frecSemanas 1 semana (lunes 16)');
ok(sem[0].diasRegistrados === 1 && sem[0].total === 46 && sem[0].fuertes === 6, 'frecSemanas totales semana 1');
ok(Math.abs(sem[0].promDia - 46) < 0.01 && Math.abs(sem[0].tasa - 7.15) < 0.01, 'frecSemanas promDia/tasa semana 1');
ok(sem[0].iso === L.isoWeek('2026-11-19') && sem[0].etiqueta === '16/11 al 22/11', 'frecSemanas iso/etiqueta: ' + sem[0].etiqueta);
const evs3 = seed.eventos.slice();
for (const f of ['2026-11-23', '2026-11-24']) for (let i = 0; i < 5; i++) { const tm = i * 30; const hh = 9 + Math.floor(tm / 60), mm = tm % 60;
  evs3.push(L.newEv(f, String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), 'X', 'Dormida')); }
const sem2 = L.frecSemanas(evs3, seed.contexto);
ok(sem2.length === 2 && sem2[1].lunes === '2026-11-23', 'frecSemanas 2 semanas');
ok(sem2[1].diasRegistrados === 2 && sem2[1].total === 10, 'frecSemanas semana 2: 2 días, 10 eventos');
ok(sem2[1].cambioPct != null && sem2[1].cambioPct < 0, 'frecSemanas Δ% negativo vs semana 1: ' + (sem2[1].cambioPct != null ? sem2[1].cambioPct.toFixed(1) : 'null'));
const rf2 = L.resumenFrecuencia(L.frecGlobal(evs3, seed.contexto), '', sem2);
ok(rf2.includes('Por semana') && rf2.includes('S' + sem2[0].iso), 'resumenFrecuencia incluye semanas');

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
console.log('\n--- Ejemplo de resumen WhatsApp (primeras 12 líneas) ---');
console.log(txt.split('\n').slice(0, 12).join('\n'));
