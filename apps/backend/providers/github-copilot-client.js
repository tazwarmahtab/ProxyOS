async function callGitHubCopilotAPI(systemContent, userContent, model = 'gpt-4o', temperature = 0.7, maxTokens = 4096) {
  const githubCopilotToken = process.env.GITHUB_COPILOT_TOKEN;
  
  if (!githubCopilotToken) {
    throw new Error('GitHub Copilot token not configured');
  }

  // First, exchange GitHub token for Copilot access token
  const tokenResponse = await fetch('https://api.github.com/copilot_internal/v2/token', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${githubCopilotToken}`
    }
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`GitHub Copilot token exchange failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const copilotToken = tokenData.token;
  
  // Derive API base URL from token
  let apiBaseUrl = 'https://api.individual.githubcopilot.com';
  const tokenMatch = copilotToken.match(/(?:^|;)\s*proxy-ep=([^;\s]+)/i);
  if (tokenMatch) {
    const proxyEp = tokenMatch[1].trim();
    const host = proxyEp.replace(/^https?:\/\//, '').replace(/^proxy\./i, 'api.');
    apiBaseUrl = `https://${host}`;
  }

  // Call Copilot API
  const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${copilotToken}`,
      'User-Agent': 'GitHubCopilotChat/0.26.7'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub Copilot API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export { callGitHubCopilotAPI };
