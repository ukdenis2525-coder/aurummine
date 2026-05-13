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

app.listen(PORT, () => {
  console.log(`AurumMine backend running on port ${PORT}`);
});
