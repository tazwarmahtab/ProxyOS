import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PROXYOS_BACKEND_URL = process.env.PROXYOS_BACKEND_URL || 'http://proxyos-backend:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[Telegram Adapter] TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');
const bot = new Bot(TELEGRAM_BOT_TOKEN);

const pendingContexts = new Map();

async function sendToProxyOS(rawInput, channelUserId, chatId, threadTs = null) {
  const replyMetadata = {
    chat_id: chatId
  };
  if (threadTs) {
    replyMetadata.thread_ts = threadTs;
  }

  const response = await fetch(`${PROXYOS_BACKEND_URL}/api/inbound-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw_input: rawInput,
      channel: 'telegram',
      channel_user_id: String(channelUserId),
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

bot.on('message:text', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const threadTs = ctx.message?.message_thread_id;
  const text = ctx.message?.text;

  if (!userId || !chatId || !text) return;

  if (text.startsWith('/')) return;

  try {
    await ctx.replyWithChatAction('typing');

    const result = await sendToProxyOS(text, userId, chatId, threadTs);

    if (!result.context_id) {
      await ctx.reply('Sorry, I could not process your request. Please try again.');
      return;
    }

    const finalResult = await pollForResult(result.context_id);

    if (!finalResult || !finalResult.aggregated_text) {
      await ctx.reply('Your request is being processed. I\'ll notify you when it\'s complete.');
      return;
    }

    let replyText = finalResult.aggregated_text;
    
    if (replyText.length > 4000) {
      replyText = replyText.substring(0, 3950) + '\n\n... (truncated)';
    }

    const replyOptions = {};
    if (threadTs) {
      replyOptions.message_thread_id = threadTs;
    }

    await ctx.reply(replyText, replyOptions);
    await markDeliverySent(result.context_id);

  } catch (err) {
    console.error('[Telegram Adapter] Error:', err.message);
    await ctx.reply('An error occurred while processing your request. Please try again later.');
  }
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Hello! I\'m your ProxyOS assistant.\n\n' +
    'Send me any message and I\'ll delegate it to my AI agents (Minion, Scout, Sage) ' +
    'to research, code, analyze, or strategize for you.\n\n' +
    'Commands:\n' +
    '/start - Show this message\n' +
    '/help - Get help'
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'ProxyOS AI Office Assistant\n\n' +
    'I have three specialized agents:\n\n' +
    '• Minion: Coding, deployment, APIs, GitHub\n' +
    '• Scout: Research, market analysis, finding info\n' +
    '• Sage: Strategy, QA, reviews, validation\n\n' +
    'Just send me a message describing what you need, and I\'ll route it to the right agent(s).'
  );
});

bot.catch((err) => {
  console.error('[Telegram Adapter] Bot error:', err);
});

console.log('[Telegram Adapter] Starting bot...');
bot.start();

process.on('SIGINT', () => {
  console.log('[Telegram Adapter] Shutting down...');
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Telegram Adapter] Shutting down...');
  bot.stop();
  process.exit(0);
});
