
'use server';
/**
 * @fileoverview This file is used for development purposes in Genkit.
 * It's the entry point for the Genkit development server.
 *
 * To run the Genkit development server:
 * npx genkit dev
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import 'dotenv/config';

import './flows/generate-performance-report';

genkit({
  plugins: [
    googleAI({
      apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
      apiVersion: 'v1beta',
    }),
  ],
});
