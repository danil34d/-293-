
/**
 * @fileoverview This is the main entry point for the Genkit AI functionality.
 * It initializes the Genkit instance with the necessary plugins.
 *
 * Note: 'use server' removed (Phase 23) — этот файл экспортирует const ai (объект),
 * что несовместимо с 'use server'. Server-only гарантируется тем, что файл импортируется
 * только из server-action ai/flows/* и API routes (никогда из client components).
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import 'dotenv/config';

// Initialize Genkit with the Google AI plugin.
// This will be used by all flows in the application.
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
      apiVersion: 'v1beta',
    }),
  ],
});
