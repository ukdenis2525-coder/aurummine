import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';

dotenv.config();

const BOT_USERNAME = process.env.BOT_USERNAME || 'AurumMineBot';
const WEBAPP_SHORT_NAME = process.env.WEBAPP_SHORT_NAME || 'app';

const startBot = async () => {
  try {
    const bot = new Bot(process.env.BOT_TOKEN);

    // /start with or without referral parameter
    bot.command('start', async (ctx) => {
      const refParam = ctx.match?.trim();

      if (refParam) {
        const directLink = `https://t.me/${BOT_USERNAME}/${WEBAPP_SHORT_NAME}?startapp=${refParam}`;
        const keyboard = new InlineKeyboard().url('⚡ Open AurumMine', directLink);

        await ctx.reply(
          `⚡ *Welcome to AurumMine!*\n\n` +
          `You've been invited to join the mining community!\n` +
          `Tap the button below to start mining TON.`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
        console.log(`[Bot] Referral start: tg:${ctx.from.id} ref:${refParam}`);
      } else {
        const directLink = `https://t.me/${BOT_USERNAME}/${WEBAPP_SHORT_NAME}`;
        const keyboard = new InlineKeyboard().url('⚡ Open AurumMine', directLink);

        await ctx.reply(
          `⚡ *Welcome to AurumMine!*\n\n` +
          `Your personal TON cloud miner.\n` +
          `Tap the button below to start.`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }
    });

    // Handle errors gracefully
    bot.catch((err) => {
      console.error('[Bot] Error:', err.message);
    });

    // Delete any existing webhook before starting long polling
    await bot.api.deleteWebhook({ drop_pending_updates: true });

    // Start with retry logic
    bot.start({
      onStart: (botInfo) => {
        console.log(`🤖 Bot @${botInfo.username} started (webapp: ${WEBAPP_SHORT_NAME})`);
      },
    });
  } catch (e) {
    console.error('[Bot] Failed to start:', e.message);
    // Don't crash the server if bot fails
  }
};

// Start bot after a small delay to let old instances terminate
setTimeout(startBot, 2000);
