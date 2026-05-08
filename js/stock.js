// js/stock.js

export function getStock()        { return JSON.parse(localStorage.getItem('is') || '{}'); }
export function saveStock(data)   { localStorage.setItem('is', JSON.stringify(data)); }
export function clearStock()      { localStorage.removeItem('is'); }

export function parseStockXLSX(file) {
  return new Promise((resolve, reject) => {
    const doparse = () => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb   = XLSX.read(e.target.result, { type: 'array' });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          // Localizar fila de cabecera buscando "Artículo" y "Cantidad"
          let artIdx = -1, cantIdx = -1, headerRow = -1;
          for (let i = 0; i < rows.length; i++) {
            const cols = rows[i].map(c => String(c).trim());
            const ai   = cols.findIndex(c => c === 'Artículo');
            const ci   = cols.findIndex(c => c === 'Cantidad');
            if (ai >= 0 && ci >= 0) { artIdx = ai; cantIdx = ci; headerRow = i; break; }
          }

          if (headerRow < 0) {
            reject(new Error('No se encontró la cabecera Artículo / Cantidad'));
            return;
          }

          const stock = {};
          for (let i = headerRow + 1; i < rows.length; i++) {
            const ref = String(rows[i][artIdx] || '').trim();
            let qty   = rows[i][cantIdx];
            if (typeof qty === 'string') qty = parseFloat(qty.replace(',', '.'));
            else qty = Number(qty);
            if (ref && !isNaN(qty)) stock[ref] = qty;
          }

          resolve(stock);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    };

    if (window.XLSX) {
      doparse();
    } else {
      const s   = document.createElement('script');
      s.src     = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload  = doparse;
      s.onerror = () => reject(new Error('No se pudo cargar la librería XLSX'));
      document.head.appendChild(s);
    }
  });
}
