/**
 * DOCX Report Generator
 * Generates DOCX reports from chat conversations and analysis results
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
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
 * Parse inline markdown (bold, italic) into TextRuns
 */
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('**') && part.endsWith('**')) {
      // Bold text
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      // Italic text
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else {
      // Plain text
      runs.push(new TextRun({ text: part }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: text })];
}

/**
 * Convert markdown text to DOCX paragraphs with proper formatting
 */
function markdownToDocxParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
      continue;
    }

    // Heading (## or ###)
    if (trimmed.startsWith('###')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^###\s*/, ''),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }
    if (trimmed.startsWith('##')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^##\s*/, ''),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
        })
      );
      continue;
    }

    // Bullet list (- or • or *)
    if (trimmed.match(/^[-•*]\s/)) {
      const bulletText = trimmed.replace(/^[-•*]\s*/, '');
      const textRuns = parseInlineMarkdown(bulletText);
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '• ' }), ...textRuns],
          spacing: { after: 50 },
        })
      );
      continue;
    }

    // Emoji indicators (🔴, ⚠️, ✅)
    if (trimmed.match(/^[🔴⚠️✅]/)) {
      const textRuns = parseInlineMarkdown(trimmed);
      paragraphs.push(
        new Paragraph({
          children: textRuns,
          spacing: { after: 100 },
        })
      );
      continue;
    }

    // Parse inline markdown (bold, italic)
    const textRuns = parseInlineMarkdown(trimmed);
    paragraphs.push(
      new Paragraph({
        children: textRuns,
        spacing: { after: 100 },
      })
    );
  }

  return paragraphs;
}

/**
 * Generate DOCX report from chat conversation
 */
export async function generateChatDOCX(chatId: string, chatTitle: string): Promise<string> {
  try {
    const messages = getMessages(chatId);
    const timestamp = Date.now();
    const filename = `chat_${chatId}_${timestamp}.docx`;
    const filepath = path.join(REPORTS_DIR, filename);

    const sections: Paragraph[] = [];

    // Title
    sections.push(
      new Paragraph({
        text: chatTitle || 'Отчёт AI Помощника',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      })
    );

    // Date
    sections.push(
      new Paragraph({
        text: `Дата создания: ${new Date().toLocaleDateString('ru-RU')}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Messages
    messages.forEach((msg, index) => {
      if (msg.role !== 'system') {
        // Role header
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: msg.role === 'user' ? 'Вопрос:' : 'Ответ:',
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );

        // Message content with markdown parsing
        const contentParagraphs = markdownToDocxParagraphs(msg.content);
        sections.push(...contentParagraphs);

        // Separator
        if (index < messages.length - 1) {
          sections.push(
            new Paragraph({
              text: '―'.repeat(50),
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 100 },
            })
          );
        }
      }
    });

    // Footer
    sections.push(
      new Paragraph({
        text: `Сгенерировано AI Помощником • ${new Date().toLocaleString('ru-RU')}`,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
      })
    );

    const doc = new Document({
      sections: [{ children: sections }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);

    return `/reports/${filename}`;
  } catch (error) {
    throw error;
  }
}

/**
 * Generate DOCX report from background analysis
 */
export async function generateAnalysisDOCX(analysisId: string): Promise<string> {
  try {
    const analysis = getBackgroundAnalysis(analysisId);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    const timestamp = Date.now();
    const filename = `analysis_${analysisId}_${timestamp}.docx`;
    const filepath = path.join(REPORTS_DIR, filename);

    const sections: Paragraph[] = [];

    // Title
    sections.push(
      new Paragraph({
        text: getAnalysisTitle(analysis.type),
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      })
    );

    // Date
    sections.push(
      new Paragraph({
        text: `Дата: ${new Date(analysis.created_at).toLocaleString('ru-RU')}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Content
    if (analysis.result_data) {
      const data = typeof analysis.result_data === 'string' ? JSON.parse(analysis.result_data) : analysis.result_data;

      if (data.summary) {
        sections.push(
          new Paragraph({
            text: 'Сводка:',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          })
        );
        // Parse markdown in summary
        const summaryParagraphs = markdownToDocxParagraphs(data.summary);
        sections.push(...summaryParagraphs);
        sections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }

      if (data.analysis) {
        sections.push(
          new Paragraph({
            text: 'Анализ:',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          })
        );
        // Parse markdown in analysis
        const analysisParagraphs = markdownToDocxParagraphs(data.analysis);
        sections.push(...analysisParagraphs);
        sections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }

      if (data.anomalies) {
        sections.push(
          new Paragraph({
            text: 'Обнаруженные аномалии:',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          })
        );
        // Parse markdown in anomalies
        const anomaliesParagraphs = markdownToDocxParagraphs(data.anomalies);
        sections.push(...anomaliesParagraphs);
        sections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }

      // Data summary
      if (data.revenue) {
        sections.push(
          new Paragraph({
            text: 'Данные по выручке:',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );
        sections.push(
          new Paragraph({
            text: `• Общая выручка: ${data.revenue.totalRevenue?.toFixed(2) || 'N/A'} руб`,
          })
        );
        sections.push(
          new Paragraph({
            text: `• Количество моек: ${data.revenue.totalWashes || 'N/A'}`,
          })
        );
        sections.push(
          new Paragraph({
            text: `• Средний чек: ${data.revenue.averageCheck?.toFixed(2) || 'N/A'} руб`,
            spacing: { after: 200 },
          })
        );
      }
    }

    // Footer
    sections.push(
      new Paragraph({
        text: `Сгенерировано AI Помощником • ${new Date().toLocaleString('ru-RU')}`,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
      })
    );

    const doc = new Document({
      sections: [{ children: sections }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);

    return `/reports/${filename}`;
  } catch (error) {
    throw error;
  }
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

/**
 * Generate custom DOCX document from title and markdown content
 * Used by AI to create documents directly from chat
 */
export async function generateCustomDOCX(params: {
  title: string;
  content: string;
  filename?: string;
}): Promise<string> {
  try {
    const { title, content, filename } = params;

    const timestamp = Date.now();
    const fileBasename = filename || `document_${timestamp}`;
    const filepath = path.join(REPORTS_DIR, `${fileBasename}.docx`);

    const sections: Paragraph[] = [];

    // Title
    sections.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Parse markdown content into paragraphs
    const contentParagraphs = markdownToDocxParagraphs(content);
    sections.push(...contentParagraphs);

    // Footer
    sections.push(
      new Paragraph({
        text: `Сгенерировано AI Помощником • ${new Date().toLocaleString('ru-RU')}`,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
      })
    );

    const doc = new Document({
      sections: [{ children: sections }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);

    return `/reports/${fileBasename}.docx`;
  } catch (error) {
    throw error;
  }
}
