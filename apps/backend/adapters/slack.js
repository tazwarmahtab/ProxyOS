import { App } from '@slack/bolt';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const PROXYOS_BACKEND_URL = process.env.PROXYOS_BACKEND_URL || 'http://proxyos-backend:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET) {
  console.error('[Slack Adapter] SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');

const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: !!SLACK_APP_TOKEN,
  appToken: SLACK_APP_TOKEN
});

async function sendToProxyOS(rawInput, channelUserId, channelId, threadTs = null) {
  const replyMetadata = {
    channel_id: channelId
  };
  if (threadTs) {
    replyMetadata.thread_ts = threadTs;
  }

  const response = await fetch(`${PROXYOS_BACKEND_URL}/api/inbound-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw_input: rawInput,
      channel: 'slack',
      channel_user_id: channelUserId,
      reply_metadata: replyMetadata
    })
  });

  if (!response.ok) {
    throw new Error(`ProxyOS returned ${response.status}`);
  }

  return response.json();
}

async function pollForResult(contextId, maxAttempts = 60, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${PROXYOS_BACKEND_URL}/api/context/${contextId}/result`);
    
    if (response.status === 202) {
      await new Promise(r => setTimeout(r, intervalMs));
      continue;
    }

    if (response.ok) {
      return response.json();
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  return null;
}

async function markDeliverySent(contextId) {
  await supabase
    .from('outbound_deliveries')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('context_id', contextId)
    .eq('status', 'pending');
}

app.message(async ({ message, say, client }) => {
  if (message.subtype || !message.text) return;

  const userId = message.user;
  const channelId = message.channel;
  const threadTs = message.thread_ts || message.ts;
  const text = message.text;

  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: message.ts,
      name: 'thinking_face'
    });

    const result = await sendToProxyOS(text, userId, channelId, threadTs);

    if (!result.context_id) {
      await say({
        text: 'Sorry, I could not process your request. Please try again.',
        thread_ts: threadTs
      });
      return;
    }

    const finalResult = await pollForResult(result.context_id);

    if (!finalResult || !finalResult.aggregated_text) {
      await say({
        text: 'Your request is being processed. I\'ll notify you when it\'s complete.',
        thread_ts: threadTs
      });
      return;
    }

    let replyText = finalResult.aggregated_text;
    
    if (replyText.length > 3500) {
      replyText = replyText.substring(0, 3450) + '\n\n... (truncated)';
    }

    await say({
      text: replyText,
      thread_ts: threadTs
    });

    await markDeliverySent(result.context_id);

    await client.reactions.remove({
      channel: channelId,
      timestamp: message.ts,
      name: 'thinking_face'
    });

  } catch (err) {
    console.error('[Slack Adapter] Error:', err.message);
    await say({
      text: 'An error occurred while processing your request. Please try again later.',
      thread_ts: threadTs
    });
  }
});

app.command('/proxyos', async ({ command, ack, respond }) => {
  await ack();

  const text = command.text;
  const userId = command.user_id;
  const channelId = command.channel_id;

  if (!text) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: /proxyos <your request>\n\nExample: /proxyos research best practices for Node.js deployment'
    });
    return;
  }

  try {
    const result = await sendToProxyOS(text, userId, channelId);

    if (!result.context_id) {
      await respond({
        response_type: 'ephemeral',
        text: 'Sorry, I could not process your request. Please try again.'
      });
      return;
    }

    const finalResult = await pollForResult(result.context_id);

    if (!finalResult || !finalResult.aggregated_text) {
      await respond({
        response_type: 'ephemeral',
        text: 'Your request is being processed. Please wait...'
      });
      return;
    }

    let replyText = finalResult.aggregated_text;
    
    if (replyText.length > 3500) {
      replyText = replyText.substring(0, 3450) + '\n\n... (truncated)';
    }

    await respond({
      response_type: 'in_channel',
      text: replyText
    });

    await markDeliverySent(result.context_id);

  } catch (err) {
    console.error('[Slack Adapter] Error:', err.message);
    await respond({
      response_type: 'ephemeral',
      text: 'An error occurred while processing your request. Please try again later.'
    });
  }
});

app.event('app_mention', async ({ event, say }) => {
  const userId = event.user;
  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!text) {
    await say({
      text: 'Hello! How can I help you today?',
      thread_ts: threadTs
    });
    return;
  }

  try {
    const result = await sendToProxyOS(text, userId, channelId, threadTs);

    if (!result.context_id) {
      await say({
        text: 'Sorry, I could not process your request. Please try again.',
        thread_ts: threadTs
      });
      return;
    }

    const finalResult = await pollForResult(result.context_id);

    if (!finalResult || !finalResult.aggregated_text) {
      await say({
        text: 'Your request is being processed. I\'ll notify you when it\'s complete.',
        thread_ts: threadTs
      });
      return;
    }

    let replyText = finalResult.aggregated_text;
    
    if (replyText.length > 3500) {
      replyText = replyText.substring(0, 3450) + '\n\n... (truncated)';
    }

    await say({
      text: replyText,
      thread_ts: threadTs
    });

    await markDeliverySent(result.context_id);

  } catch (err) {
    console.error('[Slack Adapter] Error:', err.message);
    await say({
      text: 'An error occurred while processing your request. Please try again later.',
      thread_ts: threadTs
    });
  }
});

(async () => {
  console.log('[Slack Adapter] Starting app...');
  await app.start();
  console.log('[Slack Adapter] Bot is running!');
})();

process.on('SIGINT', async () => {
  console.log('[Slack Adapter] Shutting down...');
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Slack Adapter] Shutting down...');
  await app.stop();
  process.exit(0);
});
