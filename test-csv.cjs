const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');

global.formatDateBR = (v) => String(v);
global.formatCurrency = (v) => String(v);
global.getStatusPagamentoLabel = (v) => String(v);
global.linhasDetalhadasGerencial = [
  { solicitacaoData: '2026-04-01', competencia: '04/2026', ano: '2026', processoId: '1', termo: 'A', destino: 'B', entidade: 'C', categoria: 'D', municipio: 'E', estado: 'F', status: 'pago', valor: 10 }
];

global.escapeCsvValue = function escapeCsvValue(value) {
  const raw = String(value ?? '')
  if (!raw.includes(';') && !raw.includes('"') && !raw.includes('\n') && !raw.includes('\r')) {
    return raw
  }
  return '"' + raw.replace(/"/g, '""') + '"'
}

let tryBlockMatch = code.match(/function handleExportarGerencialCsv\(\) \{[\s\S]*?try \{([\s\S]*?)\} catch/);
if (!tryBlockMatch) {
  console.log("Could not find try block");
  process.exit(1);
}
let tryBlock = tryBlockMatch[1];

try {
  global.Blob = class Blob { constructor(c, o) { this.c = c; this.o = o; } };
  global.URL = { createObjectURL: () => 'blob:url', revokeObjectURL: () => {} };
  global.document = { createElement: () => ({ click: () => {}, remove: () => {} }), body: { appendChild: () => {} } };
  global.toast = { success: () => {} };
  
  eval(tryBlock);
  console.log('SUCCESS!');
} catch (e) {
  console.error('ERROR IN TRY BLOCK:', e);
}
