/**
 * PDF Report Generator
 * Generates PDF reports from chat conversations and analysis results
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { getMessages } from '@/lib/db/ai-database';
import { getBackgroundAnalysis } from '@/lib/db/ai-database';

const REPORTS_DIR = path.join(process.cwd(), 'public', 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Generate PDF report from chat conversation
 */
export async function generateChatPDF(chatId: string, chatTitle: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const messages = getMessages(chatId);
      const timestamp = Date.now();
      const filename = `chat_${chatId}_${timestamp}.pdf`;
      const filepath = path.join(REPORTS_DIR, filename);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Title
      doc.fontSize(24).text(chatTitle || 'Отчёт AI Помощника', { align: 'center' });
      doc.moveDown();

      // Date
      doc.fontSize(10).text(`Дата создания: ${new Date().toLocaleDateString('ru-RU')}`, { align: 'center' });
      doc.moveDown(2);

      // Messages
      messages.forEach((msg, index) => {
        if (msg.role !== 'system') {
          doc.fontSize(12).text(msg.role === 'user' ? 'Вопрос:' : 'Ответ:', { continued: false });
          doc.fontSize(10).text(msg.content, { align: 'justify' });
          doc.moveDown();

          if (index < messages.length - 1) {
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
          }
        }
      });

      // Footer
      doc.fontSize(8).text(`Сгенерировано AI Помощником • ${new Date().toLocaleString('ru-RU')}`, 50, doc.page.height - 50, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        resolve(`/reports/${filename}`);
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate PDF report from background analysis
 */
export async function generateAnalysisPDF(analysisId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const analysis = getBackgroundAnalysis(analysisId);
      if (!analysis) {
        reject(new Error('Analysis not found'));
        return;
      }

      const timestamp = Date.now();
      const filename = `analysis_${analysisId}_${timestamp}.pdf`;
      const filepath = path.join(REPORTS_DIR, filename);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Title
      doc.fontSize(24).text(getAnalysisTitle(analysis.type), { align: 'center' });
      doc.moveDown();

      // Date
      doc.fontSize(10).text(`Дата: ${new Date(analysis.created_at).toLocaleString('ru-RU')}`, { align: 'center' });
      doc.moveDown(2);

      // Content
      if (analysis.result_data) {
        const data = typeof analysis.result_data === 'string' ? JSON.parse(analysis.result_data) : analysis.result_data;

        if (data.summary) {
          doc.fontSize(14).text('Сводка:');
          doc.fontSize(10).text(data.summary, { align: 'justify' });
          doc.moveDown(2);
        }

        if (data.analysis) {
          doc.fontSize(14).text('Анализ:');
          doc.fontSize(10).text(data.analysis, { align: 'justify' });
          doc.moveDown(2);
        }

        if (data.anomalies) {
          doc.fontSize(14).text('Обнаруженные аномалии:');
          doc.fontSize(10).text(data.anomalies, { align: 'justify' });
          doc.moveDown(2);
        }

        // Data tables (simplified for PDF)
        if (data.revenue) {
          doc.fontSize(12).text('Данные по выручке:');
          doc.fontSize(9);
          doc.text(`Общая выручка: ${data.revenue.totalRevenue?.toFixed(2) || 'N/A'} руб`);
          doc.text(`Количество моек: ${data.revenue.totalWashes || 'N/A'}`);
          doc.text(`Средний чек: ${data.revenue.averageCheck?.toFixed(2) || 'N/A'} руб`);
          doc.moveDown();
        }
      }

      // Footer
      doc.fontSize(8).text(`Сгенерировано AI Помощником • ${new Date().toLocaleString('ru-RU')}`, 50, doc.page.height - 50, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        resolve(`/reports/${filename}`);
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

function getAnalysisTitle(type: string): string {
  switch (type) {
    case 'daily_summary':
      return 'Ежедневный отчёт';
    case 'employee_performance':
      return 'Анализ производительности сотрудников';
    case 'anomaly_detection':
      return 'Обнаружение аномалий';
    default:
      return 'Отчёт';
  }
}
