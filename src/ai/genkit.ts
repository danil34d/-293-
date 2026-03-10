
'use server';
/**
 * @fileoverview This is the main entry point for the Genkit AI functionality.
 * It initializes the Genkit instance with the necessary plugins.
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
