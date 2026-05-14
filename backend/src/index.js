import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { rateLimit } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import miningRoutes from './routes/mining.js';
import shopRoutes from './routes/shop.js';
import withdrawRoutes from './routes/withdraw.js';
import referralRoutes from './routes/referrals.js';
import tasksRoutes from './routes/tasks.js';
import leaderboardRoutes from './routes/leaderboard.js';
import adminRoutes, { getAllAdminIds } from './routes/admin.js';
import ambassadorRoutes from './routes/ambassador.js';
import { accrueHashes } from './services/mining.js';
import { checkPendingPayments } from './services/payment.js';
import './bot.js'; // Start Telegram bot

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (nginx) — needed for correct IP detection
app.set('trust proxy', true);

// CORS — configurable via env, defaults to * for Telegram WebApp compatibility
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-init-data', 'x-admin-key', 'x-ref-id']
}));
app.use(express.json());

// Serve uploaded files (ambassador images etc.)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Rate limiters
const generalLimit = rateLimit(100, 60000);   // 100 req/min per IP
const strictLimit = rateLimit(10, 60000);      // 10 req/min per IP
const adminLimit  = rateLimit(80, 60000);      // 80 req/min for admin panel

// Routes
app.use('/api/auth', generalLimit, authRoutes);
app.use('/api/mining', generalLimit, miningRoutes);
app.use('/api/shop', generalLimit, shopRoutes);
app.use('/api/withdraw', strictLimit, withdrawRoutes);
app.use('/api/referrals', generalLimit, referralRoutes);
app.use('/api/tasks', generalLimit, tasksRoutes);
app.use('/api/leaderboard', generalLimit, leaderboardRoutes);
app.use('/api/admin', adminLimit, adminRoutes);
app.use('/api/ambassador', generalLimit, ambassadorRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Cron: accrue hashes every minute
cron.schedule('* * * * *', async () => {
  try {
    await accrueHashes();
  } catch (e) {
    console.error('Mining cron error:', e.message);
  }
});

// Cron: check pending payments every 2 minutes
cron.schedule('*/2 * * * *', async () => {
  try {
    await checkPendingPayments();
  } catch (e) {
    console.error('Payment cron error:', e.message);
  }
});

// Cron: verify ambassador channels every 24h (4:00 AM)
cron.schedule('0 4 * * *', async () => {
  try {
    const { Api } = await import('grammy');
    const tgApi = process.env.BOT_TOKEN ? new Api(process.env.BOT_TOKEN) : null;
    if (!tgApi) return;

    const { rows: channels } = await pool.query(
      `SELECT * FROM ambassador_channels WHERE status = 'approved'`
    );
    console.log(`[Ambassador Cron] Checking ${channels.length} approved channels...`);

    for (const ch of channels) {
      try {
        const chatId = ch.channel_tg_id || `@${ch.channel_username}`;
        const botInfo = await tgApi.getMe();
        const member = await tgApi.getChatMember(chatId, botInfo.id);

        if (!['administrator', 'creator'].includes(member.status)) {
          // Bot is no longer admin — revoke partnership
          await pool.query(
            `UPDATE ambassador_channels SET status = 'rejected' WHERE id = $1`,
            [ch.id]
          );
          console.log(`[Ambassador Cron] ❌ Revoked @${ch.channel_username} — bot not admin`);
        }
      } catch (e) {
        // Channel deleted or bot kicked — revoke
        await pool.query(
          `UPDATE ambassador_channels SET status = 'rejected' WHERE id = $1`,
          [ch.id]
        );
        console.log(`[Ambassador Cron] ❌ Revoked @${ch.channel_username} — ${e.message}`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[Ambassador Cron] Check complete`);
  } catch (e) {
    console.error('Ambassador cron error:', e.message);
  }
});

// Admin: manual payment check trigger
app.post('/api/admin/check-payments', async (req, res) => {
  const key = req.headers['x-admin-key'];
  const initData = req.headers['x-init-data'];
  let auth = key && key === process.env.ADMIN_KEY;
  if (!auth && initData) {
    try {
      const params = new URLSearchParams(initData);
      const u = JSON.parse(params.get('user') || '{}');
      const ids = await getAllAdminIds();
      auth = ids.includes(String(u.id));
    } catch {}
  }
  if (!auth) return res.status(403).json({ error: 'Forbidden' });

  try {
    await checkPendingPayments();
    const { rows } = await pool.query(
      `SELECT id, user_id, memo, ton_amount, status, created_at FROM pending_purchases ORDER BY created_at DESC LIMIT 20`
    );
    res.json({ message: 'Payment check completed', recent_purchases: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, async () => {
  console.log(`AurumMine backend running on port ${PORT}`);
  // Auto-migrate new columns/tables (safe — IF NOT EXISTS)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_blocked BOOLEAN DEFAULT FALSE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ip_blacklist (
        id SERIAL PRIMARY KEY, ip VARCHAR(45) UNIQUE NOT NULL,
        reason VARCHAR(500), created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Partner promo codes
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT FALSE`);
    // Source column for promo_code_uses (distinguish broadcast/ambassador vs purchase)
    await pool.query(`ALTER TABLE promo_code_uses ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'purchase'`);
    // Cache telegram file_id for ambassador images
    await pool.query(`ALTER TABLE ambassador_posts ADD COLUMN IF NOT EXISTS tg_file_id TEXT`);
    // Update unique index to include source
    await pool.query(`DROP INDEX IF EXISTS idx_promo_uses_unique`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_uses_unique_src ON promo_code_uses(promo_id, user_id, source)`);
    console.log('[Auto-migrate] Done');
  } catch (e) { console.error('Auto-migrate error:', e.message); }
});
