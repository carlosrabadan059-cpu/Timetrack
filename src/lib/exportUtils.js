
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Generate PDF Report
 * @param {string} title Report Title
 * @param {Array} columns Column headers
 * @param {Array} rows Data rows
 * @param {string} fileName Filename without extension
 */
// Helper to force download with correct filename
const downloadFile = (blob, fileName, extension) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fullFileName = `${fileName}.${extension}`;
    console.log('Descargando archivo:', fullFileName); // Debug
    link.download = fullFileName; // Direct property assignment
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

/**
 * Generate PDF Report
 * @param {string} title Report Title
 * @param {Array} columns Column headers
 * @param {Array} rows Data rows
 * @param {string} fileName Filename without extension
 */
export const generatePDF = (title, columns, rows, fileName) => {
    if (!rows || rows.length === 0) {
        alert('No data to export');
        return;
    }
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text(title, 14, 22);

    // Date
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, 14, 30);

    // Table
    doc.autoTable({
        head: [columns],
        body: rows,
        startY: 40,
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 }
    });

    // Output as Blob and download
    const pdfBlob = doc.output('blob');
    downloadFile(pdfBlob, fileName, 'pdf');
};

/**
 * Generate Excel File
 * @param {Array} data Array of objects to export
 * @param {string} fileName Filename without extension
 */
export const generateExcel = (data, fileName) => {
    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");

    // Write to buffer and create blob
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    downloadFile(blob, fileName, 'xlsx');
};

/**
 * Generate CSV File
 * @param {Array} data Array of objects to export
 * @param {string} fileName Filename without extension
 */
export const generateCSV = (data, fileName) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const csvOutput = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });

    downloadFile(blob, fileName, 'csv');
};
