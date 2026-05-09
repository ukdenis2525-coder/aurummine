import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://aurummine.netlify.app';
const BOT_USERNAME = process.env.BOT_USERNAME || 'AurumMineBot';

// /start with referral parameter
bot.command('start', async (ctx) => {
  const refParam = ctx.match; // text after /start

  const keyboard = new InlineKeyboard();

  if (refParam) {
    // Referral link: open webapp with startapp parameter
    keyboard.webApp('⚡ Open AurumMine', `${WEBAPP_URL}?ref=${refParam}`);

    await ctx.reply(
      `⚡ *Welcome to AurumMine!*\n\n` +
      `You've been invited to join the mining community!\n` +
      `Tap the button below to start mining TON.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  } else {
    // Normal start
    keyboard.webApp('⚡ Open AurumMine', WEBAPP_URL);

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

// Start bot
bot.start({
  onStart: (botInfo) => {
    console.log(`🤖 Bot @${botInfo.username} started`);
  },
});

export default bot;
