// ============================================================================
//  construir.js — genera TODO a partir de datos_eventos.json (única fuente de datos)
//
//  Flujo:
//    datos_eventos.json ──┬──► eventos_19nov2026.csv   (importable en la app / Excel)
//                         ├──► index.html              (inyecta la "semilla" del 19/11)
//                         └──► registro_temblores.xlsx (resumen + eventos + plantilla + dosis)
//
//  Uso (en esta carpeta, con Node 18+ instalado):
//    npm install          ← una sola vez (descarga exceljs)
//    npm run construir    ← genera CSV + Excel y actualiza la semilla de index.html
//    npm run publicar     ← además crea publica/index.html SIN datos personales (para Render)
//    npm test             ← pruebas de la lógica de la app (parser de WhatsApp, CSV, etc.)
//
//  NOTA sobre la semilla: los datos del 19/11 se inyectan en index.html para que la app
//  arranque con ellos la PRIMERA vez en un dispositivo. Si el navegador ya tiene datos
//  guardados, la semilla NO los pisa (los datos reales de la familia mandan).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const BASE = path.dirname(fileURLToPath(import.meta.url));
const FECHA = '2026-11-19';

// ---------- 1) Leer los datos (edita datos_eventos.json para corregir/agregar eventos) ----------
const { eventos: EVENTS, contexto: CONTEXTO } =
  JSON.parse(fs.readFileSync(path.join(BASE, 'datos_eventos.json'), 'utf8'));

// Regla: todo evento "Fuerte" + "Generalizado" se marca para revisar/guardar video.
for (const e of EVENTS) {
  if (e.intensidad === 'Fuerte' && e.partes.includes('Generalizado')) e.revisar = true;
}

// ---------- 2) Estadísticas del día ----------
const total   = EVENTS.length;
const fuertes = EVENTS.filter(e => e.intensidad === 'Fuerte').map(e => e.hora);
const general = EVENTS.filter(e => e.partes.includes('Generalizado')).map(e => e.hora);
const ojos    = EVENTS.filter(e => e.ojos).length;
const habla   = EVENTS.filter(e => e.habla).map(e => e.hora);
const sutiles = EVENTS.filter(e => e.intensidad === 'Sutil').length;
const porHora = {};
for (const e of EVENTS) {
  const h = parseInt(e.hora.slice(0, 2), 10);
  porHora[h] = (porHora[h] || 0) + 1;
}
const racimo = EVENTS.filter(e => e.hora >= '11:07' && e.hora <= '11:47').length;
// Frecuencia media del día (eventos/hora sobre la ventana primer→último evento)
const minsDia = EVENTS.map(e => { const [h, m] = e.hora.split(':').map(Number); return h * 60 + m; }).sort((a, b) => a - b);
const ventanaMin = minsDia[minsDia.length - 1] - minsDia[0] + 1;
const tasaDia = EVENTS.length / (ventanaMin / 60);
const fmtHM = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const ventanaStr = fmtHM(minsDia[0]) + '–' + fmtHM(minsDia[minsDia.length - 1] + 1);

// ---------- 3) CSV (mismo formato que exporta la app: separador ";", BOM para Excel en español) ----------
const COLS = ['id','fecha','hora','hora_fin','duracion','tipo','partes','lado','intensidad','estado',
              'ojos','habla','varios','revisar','observador','fuente','nota'];
const escCsv = v => {
  v = v == null ? '' : String(v);
  return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};
const filaCsv = e => [e.id, e.fecha, e.hora, e.horaFin, e.dur, e.tipo, e.partes.join(','),
  e.lado, e.intensidad, e.estado, e.ojos ? 'sí' : '', e.habla ? 'sí' : '',
  e.varios ? 'sí' : '', e.revisar ? 'sí' : '', e.obs, e.fuente, e.nota];

const csv = '﻿' + COLS.join(';') + '\n' +
  EVENTS.map(e => filaCsv(e).map(escCsv).join(';')).join('\n') + '\n';
fs.writeFileSync(path.join(BASE, 'eventos_19nov2026.csv'), csv, 'utf8');
console.log('CSV creado: eventos_19nov2026.csv');

// ---------- 4) Inyectar la semilla en index.html (entre marcadores, re-ejecutable) ----------
const htmlPath = path.join(BASE, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const seedJson = JSON.stringify({ eventos: EVENTS, contexto: CONTEXTO });
const MARCA = /\/\*SEED-INICIO\*\/[\s\S]*?\/\*SEED-FIN\*\//;
if (MARCA.test(html)) {
  html = html.replace(MARCA, () => `/*SEED-INICIO*/${seedJson}/*SEED-FIN*/`);
} else if (html.includes('"__SEED__"')) {
  html = html.replace('"__SEED__"', () => seedJson);
} else {
  // primera vez: envolver la línea `const SEED = ...;` existente con marcadores
  html = html.replace(/^const SEED = (.*);$/m, () => `const SEED = /*SEED-INICIO*/${seedJson}/*SEED-FIN*/;`);
}
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Semilla inyectada en index.html');

// ---------- 5) Excel con ExcelJS ----------
// Paleta y ayudantes de estilo (ARGB: los primeros 2 dígitos son opacidad)
const C = { teal:'FF0F766E', teal2:'FF14B8A6', red:'FFDC2626', redBg:'FFFEE2E2',
            ambBg:'FFFEF3C7', gray:'FF64748B', line:'FFE2E8F0', white:'FFFFFFFF', amber:'FFB45309' };
const relleno = argb => ({ type:'pattern', pattern:'solid', fgColor:{ argb } });
const bordeFino = { bottom:{ style:'thin', color:{ argb:C.line } } };
const CABECERA = { font:{ bold:true, color:{ argb:C.white }, size:11 }, fill:relleno(C.teal),
                   alignment:{ wrapText:true, vertical:'middle' } };

const HEADERS = ['Fecha','Hora','Hora fin','Duración aprox.','Tipo','Partes','Lado','Intensidad',
                 'Estado','Ojos abiertos','Habla','Varios seguidos','Revisar video','Nota','Observador','Fuente'];
const ANCHOS  = [11, 7, 8, 13, 10, 22, 13, 10, 10, 9, 7, 9, 9, 60, 12, 22];
const DURL = { '':'', '<5s':'<5 s', '5-15s':'5–15 s', '15-30s':'15–30 s', '30-60s':'30–60 s',
               '1-2min':'1–2 min', '2-5min':'2–5 min', '>5min':'>5 min ⚠️' };

// Hoja de eventos (sirve tanto para los datos reales como para la plantilla vacía)
function hojaEventos(wb, nombre, filas, esPlantilla = false) {
  const ws = wb.addWorksheet(nombre, { views:[{ state:'frozen', xSplit:2, ySplit:1 }] });
  ws.getRow(1).values = HEADERS;
  ws.getRow(1).height = 30;
  ws.getRow(1).eachCell(c => Object.assign(c, CABECERA));
  ANCHOS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const n = esPlantilla ? 150 : filas.length;
  for (let r = 2; r <= n + 1; r++) {
    for (let c = 1; c <= 16; c++) {
      const cell = ws.getCell(r, c);
      cell.border = bordeFino;
      cell.alignment = { wrapText:true, vertical:'top' };
    }
    if (!esPlantilla) {
      const e = filas[r - 2];
      ws.getRow(r).values = [e.fecha, e.hora, e.horaFin, DURL[e.dur] || e.dur, e.tipo,
        e.partes.join(', '), e.lado, e.intensidad, e.estado,
        e.ojos ? 'sí' : '', e.habla ? 'sí' : '', e.varios ? 'sí' : '', e.revisar ? 'sí' : '',
        e.nota, e.obs, e.fuente];
      if (e.intensidad === 'Fuerte') {
        for (let c = 1; c <= 16; c++) ws.getCell(r, c).fill = relleno(C.redBg);
        ws.getCell(r, 8).font = { bold:true, color:{ argb:C.red } };
      }
      if (e.revisar) {
        ws.getCell(r, 13).fill = relleno(C.ambBg);
        ws.getCell(r, 13).font = { bold:true, color:{ argb:C.amber } };
      }
      if (e.intensidad === 'Sutil') ws.getCell(r, 8).font = { color:{ argb:C.gray } };
    }
  }
  if (!esPlantilla) {
    ws.autoFilter = `A1:P${filas.length + 1}`;
  } else {
    // Listas desplegables para registrar a mano
    const listas = { E:'"Temblor,Sacudida,Otro"', G:'"Izquierdo,Derecho,Ambos,Un lado (s/e)"',
      H:'"Sutil,Leve,Fuerte"', I:'"Dormida,Despierta,No sé"',
      D:'"<5 s,5–15 s,15–30 s,30–60 s,1–2 min,2–5 min,>5 min,No sé"' };
    for (const [col, formula] of Object.entries(listas))
      for (let r = 2; r <= 151; r++)
        ws.getCell(`${col}${r}`).dataValidation = { type:'list', allowBlank:true, formulae:[formula] };
    for (const col of ['J','K','L','M'])
      for (let r = 2; r <= 151; r++)
        ws.getCell(`${col}${r}`).dataValidation = { type:'list', allowBlank:true, formulae:['"sí,no"'] };
    // Fila completa en rojo cuando Intensidad = "Fuerte"
    ws.addConditionalFormatting({
      ref:'A2:P151',
      rules:[{ type:'expression', priority:1, formulae:['$H2="Fuerte"'],
               style:{ fill:{ type:'pattern', pattern:'solid', bgColor:{ argb:C.redBg } } } }]
    });
  }
  return ws;
}

async function construirExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Registro familiar';
  wb.title = 'Registro de movimientos — 19 nov 2026';
  wb.calcProperties.fullCalcOnLoad = true; // que Excel recalcule las fórmulas de dosis al abrir

  // ----- Hoja 1: Resumen -----
  const ws = wb.addWorksheet('Resumen 19-nov', { views:[{ showGridLines:false }] });
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = 'Registro de movimientos — jueves 19 de noviembre de 2026';
  ws.getCell('A1').font = { bold:true, size:15, color:{ argb:C.teal } };
  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = 'Niña de 3 años · Keppra (levetiracetam): inicio 0.2 mL, aumento semanal, actual 0.4 mL (confirmar tomas/día) · Registro por cámara (Dianita), enviado por WhatsApp el 20/11';
  ws.getCell('A2').font = { size:10, color:{ argb:C.gray } };

  const stats = [
    ['Total de eventos', `${total}  (45 si 11:40–41 es continuación de 11:39)`],
    ['Ventana de registro', '8:05 – 14:30  (6 h 25 min)'],
    ['Frecuencia media', `≈${tasaDia.toFixed(1)} eventos/hora (ventana ${ventanaStr}, primer→último evento)`],
    ['Fuertes', `${fuertes.length}  (${fuertes.join(', ')})`],
    ['Generalizados', `${general.length}  (${general.join(', ')})`],
    ['Con apertura de ojos', `${ojos}`],
    ['Con habla / vocalización', `${habla.length}  (${habla.join(', ')})`],
    ['Sutiles (solo hora, cámara)', `${sutiles}`],
    ['Despiertos', '0 registrados (estado "dormida" asumido; confirmar)'],
    ['Racimo más denso', `11:07 – 11:47 → ${racimo} eventos en 40 minutos`],
    ['Ventanas de varios minutos', '11:40–41 · 11:44–47 · 12:07–08 (¿evento único o varios? revisar video)'],
  ];
  let r = 4;
  for (const [k, v] of stats) {
    ws.getCell(r, 1).value = k; ws.getCell(r, 1).font = { bold:true };
    ws.mergeCells(r, 2, r, 9);
    ws.getCell(r, 2).value = v; ws.getCell(r, 2).alignment = { wrapText:true };
    if (k === 'Fuertes' || k === 'Racimo más denso')
      for (let c = 1; c <= 9; c++) ws.getCell(r, c).fill = relleno(C.redBg);
    r++;
  }
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= 9; c++) ws.getColumn(c).width = 11;

  // Frecuencia por hora con barras de texto (cada █ = 1 evento).
  // El gráfico interactivo "de verdad" está en la app (pestaña Historial).
  const hr = r + 1;
  ws.getRow(hr).values = ['Hora', 'Eventos', 'Barras'];
  ws.getRow(hr).eachCell(c => Object.assign(c, CABECERA));
  let i = 1;
  for (const h of Object.keys(porHora).map(Number).sort((a, b) => a - b)) {
    ws.getCell(hr + i, 1).value = `${h}:00`;
    ws.getCell(hr + i, 2).value = porHora[h];
    ws.getCell(hr + i, 3).value = '█'.repeat(porHora[h]);
    ws.getCell(hr + i, 3).font = { bold:true, color:{ argb:C.teal2 } };
    i++;
  }
  let r2 = hr + i + 1;
  ws.mergeCells(r2, 1, r2, 9);
  ws.getCell(r2, 1).value = 'Cada █ = 1 evento. Para el gráfico interactivo y el informe imprimible, usar la app (Historial).';
  ws.getCell(r2, 1).font = { size:9, color:{ argb:C.gray } };

  r2 += 2;
  ws.getCell(r2, 1).value = 'Puntos para comentar con el neurólogo (pronto, sin esperar la próxima cita)';
  ws.getCell(r2, 1).font = { bold:true, color:{ argb:C.red }, size:12 };
  const puntos = [
    '• Desde el inicio de Keppra: más frecuencia y extensión a nuevas partes (brazos, hombros, espalda, cara, pecho).',
    '• Ahora también despierta (antes solo dormida); la niña lo describe: "me tembló la pierna".',
    '• Racimos: varios eventos por minuto (p. ej. 11:07–11:47) y ventanas de varios minutos por confirmar en video.',
    '• Mal dormir, ojeras, llanto/irritabilidad: pueden ser efecto conductual del fármaco, pero el cambio de patrón motor debe evaluarse.',
    '• Escalada de dosis semanal: anotar fechas y mL (hoja "Dosis y contexto") para correlacionar con la frecuencia.',
    '• Llevar videos de los eventos marcados 🎥 (9:17, 11:08, 11:30 y la ventana 11:44–47).',
  ];
  for (const p of puntos) {
    r2++; ws.mergeCells(r2, 1, r2, 9);
    ws.getCell(r2, 1).value = p; ws.getCell(r2, 1).alignment = { wrapText:true };
    ws.getRow(r2).height = 28;
  }
  r2 += 2;
  ws.getCell(r2, 1).value = 'Aclaraciones del registro (confirmar)';
  ws.getCell(r2, 1).font = { bold:true, size:12 };
  const aclar = [
    '• 11:08 / 11:09: es el mismo evento; la hora se corrigió a 11:08 en un mensaje posterior — confirmar en video.',
    '• 11:40–41 (habla y abre los ojos) podría ser continuación del evento fuerte de 11:39, no un evento nuevo.',
    '• 9:32 aparece fuera de orden en el mensaje original (entre 9:17 y 9:23) — confirmar hora.',
    '• "Solo hora" = movimiento sutil captado por cámara, sin detalle (14 en el día).',
    '• Duración exacta no registrada en eventos de segundos: es esperable; importan más frecuencia, racimos y partes del cuerpo.',
    '• Intensidad vacía = no indicada en el mensaje (no se asumió).',
  ];
  for (const p of aclar) {
    r2++; ws.mergeCells(r2, 1, r2, 9);
    ws.getCell(r2, 1).value = p; ws.getCell(r2, 1).alignment = { wrapText:true };
    ws.getCell(r2, 1).font = { size:10, color:{ argb:C.gray } };
    ws.getRow(r2).height = 26;
  }

  // ----- Hojas 2 y 3: eventos reales + plantilla -----
  hojaEventos(wb, 'Eventos 19-nov', EVENTS);
  hojaEventos(wb, 'Plantilla eventos', [], true);

  // ----- Hoja 4: Dosis y contexto -----
  const wd = wb.addWorksheet('Dosis y contexto', { views:[{ state:'frozen', ySplit:8, showGridLines:false }] });
  wd.mergeCells('A1:H1');
  wd.getCell('A1').value = 'Dosis de Keppra y contexto diario';
  wd.getCell('A1').font = { bold:true, size:15, color:{ argb:C.teal } };
  wd.getCell('A3').value = 'Concentración (mg/mL):'; wd.getCell('A3').font = { bold:true };
  wd.getCell('B3').fill = relleno(C.ambBg); wd.getCell('B3').border = bordeFino;
  wd.getCell('C3').value = '← completar de la etiqueta del frasco'; wd.getCell('C3').font = { size:10, color:{ argb:C.gray } };
  wd.getCell('A4').value = 'Peso (kg):'; wd.getCell('A4').font = { bold:true };
  wd.getCell('B4').fill = relleno(C.ambBg); wd.getCell('B4').border = bordeFino;
  wd.getCell('A5').value = 'Pauta referida:'; wd.getCell('A5').font = { bold:true };
  wd.mergeCells('B5:H5');
  wd.getCell('B5').value = 'inicio 0.2 mL → aumento cada semana → actual 0.4 mL. Confirmar fechas de cada aumento y tomas/día con el médico.';
  wd.getCell('B5').alignment = { wrapText:true }; wd.getCell('B5').font = { size:10 };
  wd.mergeCells('A6:H6');
  wd.getCell('A6').value = 'No cambiar ni suspender la dosis sin indicación médica. Anoten cada día (o al menos cada cambio) para comparar con la frecuencia de eventos.';
  wd.getCell('A6').font = { size:10, color:{ argb:C.red } }; wd.getCell('A6').alignment = { wrapText:true };
  wd.getRow(8).values = ['Fecha','mL por toma','Tomas/día','mg/día','mg/kg/día','Horas de sueño','Ánimo/irritabilidad (1–5)','Notas'];
  wd.getRow(8).height = 30;
  wd.getRow(8).eachCell(c => Object.assign(c, CABECERA));
  [12, 12, 10, 10, 11, 14, 20, 60].forEach((w, i) => { wd.getColumn(i + 1).width = w; });
  for (let rr = 9; rr <= 40; rr++) {
    for (let c = 1; c <= 8; c++) wd.getCell(rr, c).border = bordeFino;
    // Fórmulas: mg/día = mL × tomas × concentración ; mg/kg/día = mg/día ÷ peso
    wd.getCell(rr, 4).value = { formula:`IF(OR(B${rr}="",C${rr}="",$B$3=""),"",B${rr}*C${rr}*$B$3)`, result:'' };
    wd.getCell(rr, 5).value = { formula:`IF(OR(D${rr}="",$B$4=""),"",D${rr}/$B$4)`, result:'' };
    wd.getCell(rr, 5).numFmt = '0.0';
    wd.getCell(`G${rr}`).dataValidation = { type:'list', allowBlank:true, formulae:['"1,2,3,4,5"'] };
  }
  wd.getCell(9, 1).value = FECHA;
  wd.getCell(9, 8).value = 'Día del registro por cámara (46 eventos). mL de ese día por confirmar.';
  wd.getCell(9, 8).alignment = { wrapText:true };

  // ----- Hoja 5: Instrucciones -----
  const wi = wb.addWorksheet('Instrucciones', { views:[{ showGridLines:false }] });
  wi.getColumn(1).width = 118;
  const lineas = [
    ['T', 'Cómo usar este registro (familia + médico)'],
    ['S', '1) La app (index.html) — registro diario'],
    ['N', '• Abrir index.html en el navegador del celular (funciona sin internet). En computadora también sirve.'],
    ['N', '• Un toque al botón "REGISTRAR AHORA" = hora exacta guardada. Los detalles (parte del cuerpo, lado, intensidad, ojos abiertos…) son opcionales.'],
    ['N', '• Para eventos de segundos NO hace falta duración exacta: usar rangos (<5 s, 5–15 s…) o dejar vacío. Importan más la frecuencia, los racimos y las partes del cuerpo.'],
    ['N', '• Si en un minuto hay varios movimientos: marcar "Varios seguidos". Los eventos fuertes generalizados se marcan solos con 🎥 (revisar/guardar video).'],
    ['N', '• Si está despierta: anotar lo que la niña diga ("me tembló la pierna") en la nota.'],
    ['N', '• Pestaña 📈 Frecuencia (lo que pide el neurólogo): eventos por día, por hora y por semana (lunes a domingo, con tendencia semana a semana), horas pico y frecuencia por parte del cuerpo / intensidad / estado. Botones para enviar por WhatsApp o imprimir el informe.'],
    ['N', '• Para que "eventos/hora" sea exacto, indiquen el horario observado en Historial → Contexto del día → "Observado desde/hasta".'],
    ['S', '2) Trabajo en familia'],
    ['N', '• Opción A: todos anotan en un solo teléfono (el que mira la cámara).'],
    ['N', '• Opción B: cada quien en su celular (elegir su nombre de observador). Al final del día cada uno exporta CSV (pestaña Más) y una persona importa los CSV de los demás: se combinan sin duplicar.'],
    ['N', '• Opción C: seguir anotando por WhatsApp y pegar los mensajes en "Pegar lista (modo WhatsApp)" (pestaña Más). Revisar la vista previa antes de confirmar (sobre todo horas de la tarde: 1:04 → 13:04).'],
    ['S', '3) Este Excel'],
    ['N', '• "Resumen 19-nov": el día ya digitalizado, con barras por hora y puntos para el médico.'],
    ['N', '• "Eventos 19-nov": los 46 eventos con notas y dudas marcadas. Filas rojas = fuertes; celda amarilla = revisar video.'],
    ['N', '• "Plantilla eventos": para registrar a mano si no hay teléfono (listas desplegables). Se puede imprimir.'],
    ['N', '• "Dosis y contexto": completar concentración del frasco (mg/mL) y peso; anotar mL por toma y tomas/día cada día. Calcula mg/día y mg/kg/día.'],
    ['N', '• El CSV (eventos_19nov2026.csv) se puede importar en la app o abrir en Excel.'],
    ['S', '4) Videos (muy útiles para el neurólogo)'],
    ['N', '• Luz encendida, cara y cuerpo completos; narrar en voz alta lo que se ve; grabar hasta que termine y cómo queda después.'],
    ['N', '• Sincronizar el reloj de la cámara con el celular (suelen diferir) y anotar la hora de cada video.'],
    ['S', '5) ⚠️ Seguridad (importante)'],
    ['R', '• Urgencias / llamar a emergencias si: un evento dura más de 5 minutos; varios eventos seguidos sin recuperarse entre ellos; dificultad para respirar o labios morados; no responde o no despierta como siempre; se lastima.'],
    ['R', '• Avisar al neurólogo PRONTO (sin esperar la próxima cita) por el cambio de patrón: más frecuentes, nuevas partes del cuerpo y episodios despierta. No todo puede atribuirse al medicamento.'],
    ['R', '• La irritabilidad, el llanto y el mal dormir sí son efectos conocidos de Keppra en niños, pero el médico debe evaluar el conjunto. NO suspender ni bajar la dosis por su cuenta.'],
    ['S', '6) Para la cita'],
    ['N', '• Llevar: informe impreso (app → Historial → "Informe médico") o este Excel + CSV actualizado + videos de los eventos 🎥 + registro de dosis y sueño.'],
  ];
  let rl = 1;
  for (const [tipo, texto] of lineas) {
    const c = wi.getCell(rl, 1);
    c.value = texto; c.alignment = { wrapText:true };
    if (tipo === 'T') { c.font = { bold:true, size:15, color:{ argb:C.teal } }; wi.getRow(rl).height = 26; }
    else if (tipo === 'S') { c.font = { bold:true, size:12, color:{ argb:C.teal } }; wi.getRow(rl).height = 24; }
    else if (tipo === 'R') { c.font = { size:11, color:{ argb:C.red } }; wi.getRow(rl).height = 42; }
    else { c.font = { size:11 }; wi.getRow(rl).height = 30; }
    rl++;
  }

  const xlsxPath = path.join(BASE, 'registro_temblores.xlsx');
  await wb.xlsx.writeFile(xlsxPath);
  console.log('Excel creado: registro_temblores.xlsx');

  // Verificación: reabrir el archivo y contar
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(xlsxPath);
  console.log('  Hojas:', check.worksheets.map(w => w.name).join(', '));
  console.log('  Filas de eventos:', check.getWorksheet('Eventos 19-nov').rowCount - 1);
}

// ---------- 6) Versión pública para Render (SIN datos personales) ----------
function versionPublica() {
  let pub = fs.readFileSync(htmlPath, 'utf8');
  // Semilla vacía: la app pública arranca sin los eventos de la niña
  pub = pub.replace(MARCA, () => '/*SEED-INICIO*/{"eventos":[],"contexto":{}}/*SEED-FIN*/');
  // Observadores por defecto genéricos (en vez de "Dianita")
  const antes = "observadores:['Dianita','Familiar 2','Familiar 3'],obsActivo:'Dianita'";
  const despues = "observadores:['Mamá','Papá','Otro'],obsActivo:'Mamá'";
  if (pub.includes(antes)) pub = pub.replace(antes, () => despues);
  else console.warn('⚠️ No encontré los observadores por defecto; revisa publica/index.html a mano.');
  fs.mkdirSync(path.join(BASE, 'publica'), { recursive:true });
  fs.writeFileSync(path.join(BASE, 'publica/index.html'), pub, 'utf8');
  // Copiar también los archivos de la PWA (manifest, service worker, íconos)
  const pwa = ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'icon-maskable-512.png'];
  for (const f of pwa) { const src = path.join(BASE, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(BASE, 'publica', f));
    else console.warn('⚠️ Falta ' + f + ' — corre: node generar_iconos.js'); }
  console.log('publica/ creado (SIN datos personales, con PWA) — listo para subir a Render/GitHub Pages.');
}

// ---------- Ejecución ----------
await construirExcel();
if (process.argv.includes('--publicar')) versionPublica();
console.log(`\nEventos: ${total} | fuertes ${fuertes.length} | generalizados ${general.length} | ojos ${ojos} | sutiles ${sutiles} | racimo 11:07-11:47: ${racimo}`);
console.log('Por hora:', porHora);
