import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);

const BOT_USERNAME = process.env.BOT_USERNAME || 'AurumMineBot';
const WEBAPP_SHORT_NAME = process.env.WEBAPP_SHORT_NAME || 'app';

// /start with or without referral parameter
bot.command('start', async (ctx) => {
  const refParam = ctx.match?.trim(); // text after /start

  if (refParam) {
    // Referral: send direct webapp link with startapp param
    // This is the ONLY reliable way to pass start_param to Telegram Mini App
    const directLink = `https://t.me/${BOT_USERNAME}/${WEBAPP_SHORT_NAME}?startapp=${refParam}`;

    const keyboard = new InlineKeyboard()
      .url('⚡ Open AurumMine', directLink);

    await ctx.reply(
      `⚡ *Welcome to AurumMine!*\n\n` +
      `You've been invited to join the mining community!\n` +
      `Tap the button below to start mining TON.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );

    console.log(`[Bot] Referral start: tg:${ctx.from.id} ref:${refParam}`);
  } else {
    // Normal start — direct webapp link without startapp
    const directLink = `https://t.me/${BOT_USERNAME}/${WEBAPP_SHORT_NAME}`;

    const keyboard = new InlineKeyboard()
      .url('⚡ Open AurumMine', directLink);

    await ctx.reply(
      `⚡ *Welcome to AurumMine!*\n\n` +
      `Your personal TON cloud miner.\n` +
      `Tap the button below to start.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }
});

// Handle errors
bot.catch((err) => {
  console.error('[Bot] Error:', err.message);
});

// Start bot
bot.start({
  onStart: (botInfo) => {
    console.log(`🤖 Bot @${botInfo.username} started (webapp: ${WEBAPP_SHORT_NAME})`);
  },
});

export default bot;
