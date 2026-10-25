export function toCsv(rows: (string | number)[][]): string {
  const escapeCell = (cell: string | number) => {
    const str = String(cell);
    if (/[",\n;]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return rows.map((row) => row.map(escapeCell).join(";")).join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  // BOM pre správne zobrazenie diakritiky v Exceli.
  const blob = new Blob(["﻿" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
