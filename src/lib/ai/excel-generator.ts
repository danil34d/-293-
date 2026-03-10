/**
 * Excel Generator for AI Assistant
 * Creates Excel files from data using ExcelJS
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

/**
 * Generate Excel file from table data
 */
export async function generateExcelTable(params: {
  title: string;
  headers: string[];
  rows: any[][];
  filename?: string;
}): Promise<string> {
  const { title, headers, rows, filename } = params;

  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(title);

  // Add title row
  worksheet.mergeCells('A1', String.fromCharCode(64 + headers.length) + '1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF228BE6' },
  };
  titleCell.font = { ...titleCell.font, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).height = 30;

  // Add headers
  const headerRow = worksheet.getRow(2);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1C7ED6' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  headerRow.height = 25;

  // Add data rows
  rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(rowIndex + 3);
    row.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);

      // Format numbers
      if (typeof value === 'number') {
        cell.value = value;
        cell.numFmt = '#,##0.00';
      } else {
        cell.value = value;
      }

      // Add borders
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      // Alternate row colors
      if (rowIndex % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' },
        };
      }
    });
  });

  // Auto-fit columns
  worksheet.columns.forEach((column, index) => {
    let maxLength = headers[index]?.length || 10;
    rows.forEach(row => {
      const cellValue = String(row[index] || '');
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.min(maxLength + 5, 50);
  });

  // Save file
  const reportsDir = path.join(process.cwd(), 'public', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const fileBasename = filename || `table_${Date.now()}`;
  const filePath = path.join(reportsDir, `${fileBasename}.xlsx`);
  await workbook.xlsx.writeFile(filePath);

  return `/reports/${fileBasename}.xlsx`;
}

/**
 * Generate Excel report from revenue statistics
 */
export async function generateRevenueExcel(params: {
  data: any;
  period: { start: string; end: string };
  filename?: string;
}): Promise<string> {
  const { data, period, filename } = params;

  const headers = ['Сотрудник', 'Кол-во моек', 'Выручка (₽)', 'Средний чек (₽)'];
  const rows = (data.topEmployees || []).map((emp: any) => [
    emp.name,
    emp.washes,
    emp.revenue,
    emp.avgCheck,
  ]);

  // Add summary row
  rows.unshift([
    'ИТОГО',
    data.totalWashes || 0,
    data.totalRevenue || 0,
    data.averageCheck || 0,
  ]);

  return generateExcelTable({
    title: `Отчёт по выручке (${period.start} - ${period.end})`,
    headers,
    rows,
    filename: filename || `revenue_${period.start}_${period.end}_${Date.now()}`,
  });
}

/**
 * Generate Excel report from employee performance data
 */
export async function generateEmployeePerformanceExcel(params: {
  data: any[];
  period: { start: string; end: string };
  filename?: string;
}): Promise<string> {
  const { data, period, filename } = params;

  const headers = [
    'Сотрудник',
    'Моек',
    'Выручка (₽)',
    'Наличные (₽)',
    'Карта (₽)',
    'Перевод (₽)',
    'Средний чек (₽)',
  ];

  const rows = data.map(emp => [
    emp.name,
    emp.washes,
    emp.revenue,
    emp.cash,
    emp.card,
    emp.transfer,
    emp.averageCheck,
  ]);

  return generateExcelTable({
    title: `Производительность сотрудников (${period.start} - ${period.end})`,
    headers,
    rows,
    filename: filename || `employee_performance_${period.start}_${period.end}_${Date.now()}`,
  });
}

/**
 * Generate Excel report from expenses data
 */
export async function generateExpensesExcel(params: {
  data: any;
  period: { start: string; end: string };
  filename?: string;
}): Promise<string> {
  const { data, period, filename } = params;

  const headers = ['Категория', 'Сумма (₽)'];
  const rows = Object.entries(data.byCategory || {}).map(([category, amount]) => [
    category,
    amount,
  ]);

  // Add total row
  rows.push(['ИТОГО', data.totalExpenses || 0]);

  return generateExcelTable({
    title: `Отчёт по расходам (${period.start} - ${period.end})`,
    headers,
    rows,
    filename: filename || `expenses_${period.start}_${period.end}_${Date.now()}`,
  });
}

/**
 * Generate custom Excel from AI-provided data
 */
export async function generateCustomExcel(params: {
  title: string;
  data: Record<string, any>[];
  filename?: string;
}): Promise<string> {
  const { title, data, filename } = params;

  if (!data || data.length === 0) {
    throw new Error('No data provided for Excel generation');
  }

  // Extract headers from first object
  const headers = Object.keys(data[0]);

  // Convert objects to rows
  const rows = data.map(item => headers.map(header => item[header]));

  return generateExcelTable({
    title,
    headers,
    rows,
    filename: filename || `custom_${Date.now()}`,
  });
}
