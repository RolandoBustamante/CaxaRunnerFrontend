import XLSX from "xlsx-js-style";

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFFFF" } },
  fill: { fgColor: { rgb: "FF1F4E79" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};
const ZEBRA_STYLE = { fill: { fgColor: { rgb: "FFF2F6FA" } } };
const MONEY_HEADER = /total|monto|precio|descuento/i;

function columnWidth(header, rows) {
  const longest = rows.reduce((max, row) => Math.max(max, String(row[header] ?? "").length), header.length);
  return { wch: Math.min(42, longest + 2) };
}

// ponytail: sin fila congelada, la libreria no escribe <pane>; autofiltro cubre el caso
export function downloadExcel(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const sheet = XLSX.utils.json_to_sheet(rows);

  sheet["!cols"] = headers.map((header) => columnWidth(header, rows));
  sheet["!rows"] = [{ hpt: 24 }];
  sheet["!autofilter"] = { ref: sheet["!ref"] };

  headers.forEach((header, col) => {
    const isMoney = MONEY_HEADER.test(header);
    for (let row = 0; row <= rows.length; row++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;
      if (row === 0) cell.s = HEADER_STYLE;
      else if (row % 2 === 0) cell.s = ZEBRA_STYLE;
      if (isMoney && cell.t === "n") cell.z = "#,##0.00";
    }
  });

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Datos");
  XLSX.writeFile(book, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
