async function callAnthropicAPI(systemContent, userContent, model = 'claude-3-5-sonnet-20241022', temperature = 0.7, maxTokens = 4096) {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!anthropicApiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': anthropicApiKey
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemContent,
      messages: [
        { role: 'user', content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

export { callAnthropicAPI };
