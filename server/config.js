import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export function getConfig(env = process.env) {
  return {
    apiKey: env.OPENAI_API_KEY?.trim() ?? '',
    model: env.OPENAI_MODEL?.trim() || 'gpt-5-mini',
    transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-transcribe',
    port: Number(env.PORT || 5173),
    timeZone: 'Africa/Lagos',
  };
}
