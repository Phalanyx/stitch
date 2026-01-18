
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const hasGemini = Boolean(process.env.GEMINI_API_KEY);
const hasCerebras = Boolean(
  process.env.CEREBRAS_API_KEY ||
  process.env.CEREBRAS_API_KEY_1 ||
  process.env.CEREBRAS_API_KEY_2
);

console.log('Gemini Key Present:', hasGemini);
console.log('Cerebras Key Present:', hasCerebras);
console.log('CEREBRAS_API_KEY_1:', process.env.CEREBRAS_API_KEY_1 ? 'Present' : 'Missing');
console.log('CEREBRAS_API_KEY_2:', process.env.CEREBRAS_API_KEY_2 ? 'Present' : 'Missing');

function getFallbackProvider(primary: string): string | null {
  if (primary === 'gemini' && hasCerebras) return 'cerebras';
  if (primary === 'cerebras' && hasGemini) return 'gemini';
  return null;
}

console.log('Fallback for gemini:', getFallbackProvider('gemini'));
