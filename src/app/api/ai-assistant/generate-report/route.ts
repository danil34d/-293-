import { NextRequest, NextResponse } from 'next/server';
import { generateChatPDF, generateAnalysisPDF } from '@/lib/ai/pdf-generator';
import { generateChatDOCX, generateAnalysisDOCX } from '@/lib/ai/docx-generator';
import { getChat, createGeneratedReport } from '@/lib/db/ai-database';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-assistant/generate-report
 * Generate a PDF or DOCX report
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { type, format, chatId, analysisId } = body;

    // Validate format (PDF disabled due to font issues in Next.js)
    if (!['pdf', 'docx'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format. Must be pdf or docx.' },
        { status: 400 }
      );
    }

    // Temporarily disable PDF due to pdfkit font issues in Next.js
    if (format === 'pdf') {
      return NextResponse.json(
        { success: false, error: 'PDF generation temporarily disabled. Please use DOCX format.' },
        { status: 400 }
      );
    }

    // Validate type
    if (!['chat', 'analysis'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be chat or analysis.' },
        { status: 400 }
      );
    }

    let filePath: string;
    let title: string;
    let fileSize: number;

    if (type === 'chat') {
      if (!chatId) {
        return NextResponse.json(
          { success: false, error: 'chatId is required for chat reports' },
          { status: 400 }
        );
      }

      const chat = getChat(chatId);
      if (!chat) {
        return NextResponse.json(
          { success: false, error: 'Chat not found' },
          { status: 404 }
        );
      }

      title = chat.title;

      if (format === 'pdf') {
        filePath = await generateChatPDF(chatId, chat.title);
      } else {
        filePath = await generateChatDOCX(chatId, chat.title);
      }
    } else {
      // type === 'analysis'
      if (!analysisId) {
        return NextResponse.json(
          { success: false, error: 'analysisId is required for analysis reports' },
          { status: 400 }
        );
      }

      title = 'Фоновый анализ';

      if (format === 'pdf') {
        filePath = await generateAnalysisPDF(analysisId);
      } else {
        filePath = await generateAnalysisDOCX(analysisId);
      }
    }

    // Get file size
    const fullPath = path.join(process.cwd(), 'public', filePath.replace(/^\//, ''));
    const stats = fs.statSync(fullPath);
    fileSize = stats.size;

    // Save report info to database
    const report = createGeneratedReport(
      format as 'pdf' | 'docx',
      title,
      filePath,
      {
        chatId: type === 'chat' ? chatId : undefined,
        fileSize,
        parameters: { type, analysisId },
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        reportId: report.id,
        filePath,
        fileSize,
        downloadUrl: filePath,
      },
    });
  } catch (error: any) {
    console.error('[API] Error generating report:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
