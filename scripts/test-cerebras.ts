
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testCerebras() {
  const apiKey = process.env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY_1 || process.env.CEREBRAS_API_KEY_2;
  const model = 'zai-glm-4.6';

  console.log('Testing Cerebras with:');
  console.log('API Key present:', Boolean(apiKey));
  console.log('Model:', model);

  if (!apiKey) {
    console.error('No API key found');
    return;
  }

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello, are you working?' }],
      }),
    });

    if (!response.ok) {
      console.error('Response status:', response.status);
      console.error('Response text:', await response.text());
    } else {
      const data = await response.json();
      console.log('Success!', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testCerebras();
