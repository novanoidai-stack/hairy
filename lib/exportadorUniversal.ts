/**
 * Exportador Universal Mecha CRM
 * Permite descargar registros, auditorías, citas, clientes y fichajes en formatos CSV/JSON/PDF.
 */

export function descargarCSV(filename: string, rows: Record<string, any>[]): void {
  if (!rows || rows.length === 0) return;

  const keys = Object.keys(rows[0]);
  const header = keys.join(',') + '\n';
  
  const body = rows.map(r => {
    return keys.map(k => {
      let val = r[k];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'object') val = JSON.stringify(val);
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',');
  }).join('\n');

  const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function descargarJSON(filename: string, data: any): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
