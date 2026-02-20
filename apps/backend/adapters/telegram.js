import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PROXYOS_BACKEND_URL = process.env.PROXYOS_BACKEND_URL || 'https://taz7770-proxyos-backend.hf.space';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TELEGRAM_RATE_LIMIT = parseInt(process.env.TELEGRAM_RATE_LIMIT || '20');
const TELEGRAM_GROUPS_ENABLED = process.env.TELEGRAM_GROUPS_ENABLED === 'true';
const TELEGRAM_GROUP_MENTION_ONLY = process.env.TELEGRAM_GROUP_MENTION_ONLY === 'true';
const TELEGRAM_ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(id => id.trim()).map(id => id.trim());
const TELEGRAM_ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter(id => id.trim()).map(id => id.trim());

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[Telegram Adapter] TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');
const bot = new Bot(TELEGRAM_BOT_TOKEN);

const pendingContexts = new Map();
const userProviders = new Map();
const userContexts = new Map();
const userMessageCounts = new Map();

setInterval(() => {
  userMessageCounts.clear();
}, 60000);

function isAdmin(userId) {
  return TELEGRAM_ADMIN_USERS.includes(String(userId));
}

async function sendToProxyOS(rawInput, channelUserId, chatId, threadTs = null, selectedProvider = null) {
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
      reply_metadata: replyMetadata,
      provider: selectedProvider
    })
  });

  if (!response.ok) {
    throw new Error(`ProxyOS returned ${response.status}`);
  }

  return response.json();
}

async function pollForResult(contextId, maxAttempts = 60, intervalMs = 2000) {
  const startTime = Date.now();
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${PROXYOS_BACKEND_URL}/api/context/${contextId}/result`);

      if (response.status === 202) {
        await new Promise(r => setTimeout(r, intervalMs));
        continue;
      }

      if (response.ok) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Telegram Adapter] Result ready for ${contextId} after ${elapsed}s`);
        return response.json();
      }

      console.warn(`[Telegram Adapter] Unexpected status ${response.status} for ${contextId}`);
      await new Promise(r => setTimeout(r, intervalMs));
    } catch (fetchError) {
      console.error(`[Telegram Adapter] Poll error for ${contextId}:`, fetchError.message);
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.warn(`[Telegram Adapter] Polling timed out for ${contextId} after ${elapsed}s (${maxAttempts} attempts)`);
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
  const userIdStr = String(userId);

  if (!userId || !chatId || !text) return;

  // Check allowed users
  if (TELEGRAM_ALLOWED_USERS.length > 0 && !TELEGRAM_ALLOWED_USERS.includes(userIdStr)) {
    console.log(`[Telegram Adapter] Unauthorized user: ${userId}`);
    return;
  }

  // Rate limiting
  const now = Date.now();
  let userData = userMessageCounts.get(userIdStr) || { count: 0, resetTime: now + 60000 };
  
  if (now > userData.resetTime) {
    userData = { count: 0, resetTime: now + 60000 };
  }
  
  userData.count++;
  userMessageCounts.set(userIdStr, userData);
  
  if (userData.count > TELEGRAM_RATE_LIMIT) {
    await ctx.reply('⚠️ Rate limit exceeded. Please wait a moment.');
    return;
  }

  // Group chat handling
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  
  if (isGroup) {
    if (!TELEGRAM_GROUPS_ENABLED) {
      return;
    }
    
    if (TELEGRAM_GROUP_MENTION_ONLY) {
      const botUsername = (await ctx.bot.api.getMe()).username;
      const mention = `@${botUsername}`;
      
      if (!text.toLowerCase().includes(mention.toLowerCase())) {
        return;
      }
    }
  }

  if (text.startsWith('/')) return;

  try {
    await ctx.replyWithChatAction('typing');

    const selectedProvider = userProviders.get(String(chatId));
    const key = `${chatId}:${userId}`;
    const userContext = userContexts.get(key);

    const result = await sendToProxyOS(text, userId, chatId, threadTs, selectedProvider);

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
    '👋 Hello! I\'m your ProxyOS assistant.\n\n' +
    'Send me any message and I\'ll delegate it to my AI agents (Minion, Scout, Sage) ' +
    'to research, code, analyze, or strategize for you.\n\n' +
    'Commands:\n' +
    '/start - Show this message\n' +
    '/help - Get help\n' +
    '/provider - Set LLM provider\n' +
    '/providers - Show provider status\n' +
    '/reset - Clear conversation history\n' +
    '/settings - Show your settings'
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '🤖 ProxyOS AI Office Assistant\n\n' +
    'I have three specialized agents:\n\n' +
    '• Minion: Coding, deployment, APIs, GitHub\n' +
    '• Scout: Research, market analysis, finding info\n' +
    '• Sage: Strategy, QA, reviews, validation\n\n' +
    'Available providers:\n' +
    '• nvidia - NVIDIA GLM-5 (fast, recommended)\n' +
    '• groq - Groq Llama (fast, free tier)\n' +
    '• bonsai - Frontier models for free (Claude, GPT-5)\n' +
    '• zai - Z.ai GLM-4 (free)\n' +
    '• github-copilot - GitHub Copilot\n' +
    '• opencode - OpenCode (experimental)\n' +
    '• openrouter - OpenRouter (multi-model)\n' +
    '• anthropic - Anthropic Claude\n\n' +
    'Just send me a message describing what you need!'
  );
});

bot.command('provider', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chatId = String(ctx.chat.id);
  
  if (args.length === 0) {
    const current = userProviders.get(chatId) || 'nvidia';
    await ctx.reply(
      `Current provider: ${current}\n\n` +
      'Available providers:\n' +
      '• nvidia - NVIDIA GLM-5 (fast, recommended)\n' +
      '• groq - Groq Llama (fast, free tier)\n' +
      '• bonsai - Frontier models for free (Claude, GPT-5)\n' +
      '• zai - Z.ai GLM-4 (free)\n' +
      '• github-copilot - GitHub Copilot\n' +
      '• opencode - OpenCode (experimental)\n' +
      '• openrouter - OpenRouter (multi-model)\n' +
      '• anthropic - Anthropic Claude\n\n' +
      'Use: /provider <name> to switch'
    );
    return;
  }

  const provider = args[0].toLowerCase();
  const validProviders = ['nvidia', 'groq', 'bonsai', 'zai', 'github-copilot', 'opencode', 'openrouter', 'anthropic'];
  
  if (!validProviders.includes(provider)) {
    await ctx.reply(`Invalid provider: ${provider}\nValid: ${validProviders.join(', ')}`);
    return;
  }
  
  userProviders.set(chatId, provider);
  await ctx.reply(`Provider set to: ${provider}`);
});

bot.command('providers', async (ctx) => {
  try {
    const response = await fetch(`${PROXYOS_BACKEND_URL}/api/providers`);
    const data = await response.json();

    let message = '🔌 *Available Providers:*\n\n';
    for (const p of data.providers) {
      const status = p.healthy ? '✅' : '❌';
      const enabled = p.enabled ? '' : ' (disabled)';
      const free = p.free ? ' (free)' : '';
      message += `${status} *${p.name}*${enabled}${free}\n`;
      message += `   Priority: ${p.priority} | Model: ${p.model || 'default'}\n`;
      message += `   Circuit: ${p.circuitBreaker?.state || 'CLOSED'}\n\n`;
    }

    if (data.fallback) {
      message += `🔄 *Fallback:* OpenClaw Cloud\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Telegram Adapter] Failed to fetch providers:', error.message);
    await ctx.reply('Could not fetch provider status. Try again later.');
  }
});

bot.command('reset', async (ctx) => {
  const userId = String(ctx.from?.id);
  const chatId = String(ctx.chat.id);
  const key = `${chatId}:${userId}`;
  
  // Clear from in-memory storage
  userContexts.delete(key);
  userProviders.delete(chatId);
  
  // Try to clear from Supabase if table exists
  if (supabase) {
    try {
      await supabase
        .from('user_contexts')
        .delete()
        .eq('user_id', key);
    } catch (e) {
      // Table might not exist, ignore
    }
  }
  
  await ctx.reply('✅ Conversation history cleared. Starting fresh!');
});

bot.command('settings', async (ctx) => {
  const userId = String(ctx.from?.id);
  const chatId = String(ctx.chat.id);
  const key = `${chatId}:${userId}`;
  
  const currentProvider = userProviders.get(chatId) || 'nvidia';
  const context = userContexts.get(key);
  const messageCount = context?.messages?.length || 0;
  
  await ctx.reply(
    `⚙️ *Your Settings*\n\n` +
    `Provider: \`${currentProvider}\`\n` +
    `Messages in context: ${messageCount}\n\n` +
    `Available providers:\n` +
    `• nvidia - Fast, recommended\n` +
    `• groq - Fast, free tier\n` +
    `• bonsai - Free frontier models\n` +
    `• zai - Free\n` +
    `• github-copilot - GitHub Copilot\n` +
    `• opencode - Experimental\n` +
    `• openrouter - Multi-model\n` +
    `• anthropic - Claude\n\n` +
    `Change with: /provider <name>`,
    { parse_mode: 'Markdown' }
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
