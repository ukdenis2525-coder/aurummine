import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import miningRoutes from './routes/mining.js';
import shopRoutes from './routes/shop.js';
import withdrawRoutes from './routes/withdraw.js';
import referralRoutes from './routes/referrals.js';
import tasksRoutes from './routes/tasks.js';
import leaderboardRoutes from './routes/leaderboard.js';
import adminRoutes from './routes/admin.js';
import { accrueHashes } from './services/mining.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Cron: accrue hashes every minute
cron.schedule('* * * * *', async () => {
  try {
    await accrueHashes();
  } catch (e) {
    console.error('Cron error:', e.message);
  }
});

app.listen(PORT, () => {
  console.log(`AurumMine backend running on port ${PORT}`);
});
