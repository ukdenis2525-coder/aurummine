import { Api } from 'grammy';
import dotenv from 'dotenv';
dotenv.config();

// Lightweight Telegram API client (no polling, just sendMessage)
const api = process.env.BOT_TOKEN ? new Api(process.env.BOT_TOKEN) : null;

const ADMIN_IDS = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/**
 * Send a message to all admin Telegram accounts.
 * Silently fails — never throws to avoid breaking business logic.
 */
export const notifyAdmins = async (text) => {
  if (!api || !ADMIN_IDS.length) {
    console.warn('[Notify] No BOT_TOKEN or ADMIN_TG_IDS configured, skipping notification');
    return;
  }
  for (const chatId of ADMIN_IDS) {
    try {
      await api.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(`[Notify] Failed to send to ${chatId}:`, e.message);
    }
  }
};

/**
 * Notify admins about a completed purchase (payment confirmed).
 */
export const notifyPurchase = async ({ userId, tgId, username, firstName, packageName, powerAmount, tonPaid, memo }) => {
  const userLabel = username ? `@${username}` : (firstName || `User #${userId}`);
  const text =
    `💰 <b>Новая покупка!</b>\n\n` +
    `👤 ${userLabel} (tg: <code>${tgId || userId}</code>)\n` +
    `📦 Пакет: <b>${packageName || '—'}</b>\n` +
    `⚡ Мощность: +${powerAmount} GH/s\n` +
    `💎 Оплата: ${tonPaid} TON\n` +
    `🔖 Memo: <code>${memo}</code>`;
  await notifyAdmins(text);
};

/**
 * Notify admins about a new withdrawal request.
 */
export const notifyWithdrawal = async ({ userId, tgId, username, firstName, tonAmount, walletAddress }) => {
  const userLabel = username ? `@${username}` : (firstName || `User #${userId}`);
  const text =
    `🏦 <b>Заявка на вывод!</b>\n\n` +
    `👤 ${userLabel} (tg: <code>${tgId || userId}</code>)\n` +
    `💎 Сумма: ${tonAmount} TON\n` +
    `👛 Кошелёк: <code>${walletAddress}</code>`;
  await notifyAdmins(text);
};

/**
 * Notify admins about a new task order (paid, pending moderation).
 */
export const notifyTaskOrder = async ({ userId, tgId, username, firstName, type, link, count, totalPaid, memo }) => {
  const userLabel = username ? `@${username}` : (firstName || `User #${userId}`);
  const typeLabels = { subscribe_channel: '📢 Подписка', start_bot: '🤖 Бот', link: '🔗 Ссылка' };
  const text =
    `📣 <b>Новый заказ рекламы!</b>\n\n` +
    `👤 ${userLabel} (tg: <code>${tgId || userId}</code>)\n` +
    `📋 Тип: <b>${typeLabels[type] || type}</b>\n` +
    `🔗 Ссылка: ${link}\n` +
    `👥 Кол-во: <b>${count}</b> выполнений\n` +
    `💎 Оплата: ${totalPaid} TON\n` +
    `🔖 Memo: <code>${memo}</code>\n\n` +
    `⏳ Ожидает модерации в админке`;
  await notifyAdmins(text);
};
