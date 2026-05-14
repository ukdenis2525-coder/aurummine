import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import { notifyWithdrawal } from '../services/notify.js';

// All withdraw setting keys
const WS_KEYS = [
  'min_withdraw_ton', 'withdraw_fee_mode', 'withdraw_fee_fixed',
  'withdraw_fee_percent', 'withdraw_fee_hybrid_threshold',
  'withdraw_processing_hours', 'withdraw_require_deposit',
  'withdraw_check_bot', 'withdraw_check_multi'
];

// Load all withdraw settings from app_settings
const getWithdrawSettings = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key = ANY($1)`, [WS_KEYS]
    );
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return {
      minWithdraw: parseFloat(map.min_withdraw_ton || '0.1'),
      feeMode: map.withdraw_fee_mode || 'none',
      feeFixed: parseFloat(map.withdraw_fee_fixed || '0.01'),
      feePercent: parseFloat(map.withdraw_fee_percent || '5'),
      hybridThreshold: parseFloat(map.withdraw_fee_hybrid_threshold || '1'),
      requireDeposit: map.withdraw_require_deposit === '1',
      checkBot: map.withdraw_check_bot === '1',
      checkMulti: map.withdraw_check_multi === '1',
    };
  } catch {
    return {
      minWithdraw: 0.1, feeMode: 'none', feeFixed: 0.01, feePercent: 5,
      hybridThreshold: 1, requireDeposit: false, checkBot: false, checkMulti: false,
    };
  }
};

// Calculate fee based on mode
const calcFee = (amount, settings) => {
  const { feeMode, feeFixed, feePercent, hybridThreshold } = settings;
  let fee = 0;
  if (feeMode === 'fixed') {
    fee = feeFixed;
  } else if (feeMode === 'percent') {
    fee = amount * (feePercent / 100);
  } else if (feeMode === 'hybrid') {
    if (amount <= hybridThreshold) {
      fee = feeFixed;
    } else {
      fee = amount * (feePercent / 100);
    }
  }
  return Math.min(fee, amount);
};

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { wallet_address, ton_amount } = req.body;
  const user = req.user;

  if (!wallet_address || !ton_amount) {
    return res.status(400).json({ error: 'wallet_address and ton_amount required' });
  }
  const addr = wallet_address.trim();
  if (addr.length < 48 || !/^(UQ|EQ|0:|kQ|Ef)/.test(addr)) {
    return res.status(400).json({ error: 'Invalid TON wallet address' });
  }

  const settings = await getWithdrawSettings();
  const amount = parseFloat(ton_amount);

  if (amount < settings.minWithdraw) {
    return res.status(400).json({ error: `Minimum withdrawal: ${settings.minWithdraw} TON` });
  }
  if (parseFloat(user.ton_balance) < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // ── Hidden checks (generic error to not reveal reason) ──

  // 1. Require deposit — user must have at least 1 completed purchase
  if (settings.requireDeposit) {
    const { rows: purchases } = await pool.query(
      `SELECT id FROM purchases WHERE user_id = $1 LIMIT 1`, [user.id]
    );
    if (purchases.length === 0) {
      return res.status(400).json({ error: 'Withdrawal temporarily unavailable' });
    }
  }

  // 2. Bot check — block if user flagged as bot
  if (settings.checkBot) {
    if (user.bot_blocked) {
      return res.status(400).json({ error: 'Withdrawal temporarily unavailable' });
    }
  }

  // 3. Multi-account check — block if same IP has multiple users
  if (settings.checkMulti) {
    if (user.last_ip) {
      const { rows: ipUsers } = await pool.query(
        `SELECT DISTINCT user_id FROM user_ips WHERE ip = $1`, [user.last_ip]
      );
      if (ipUsers.length > 1) {
        return res.status(400).json({ error: 'Withdrawal temporarily unavailable' });
      }
    }
  }

  // Calculate fee
  const fee = parseFloat(calcFee(amount, settings).toFixed(8));
  const netAmount = parseFloat((amount - fee).toFixed(8));

  if (netAmount <= 0) {
    return res.status(400).json({ error: 'Amount too small after fee deduction' });
  }

  // Check for existing pending withdrawal
  const { rows: pending } = await pool.query(
    `SELECT id FROM withdrawals WHERE user_id = $1 AND status = 'pending'`, [user.id]
  );
  if (pending.length > 0) {
    return res.status(400).json({ error: 'You already have a pending withdrawal' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
      [amount, user.id]
    );

    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, ton_amount, wallet_address, fee_amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user.id, netAmount, wallet_address, fee]
    );

    await client.query('COMMIT');
    res.json({ success: true, withdrawal: rows[0], fee });

    notifyWithdrawal({
      userId: user.id,
      tgId: user.tg_id,
      username: user.username,
      firstName: user.first_name,
      tonAmount: netAmount,
      walletAddress: wallet_address,
    }).catch(e => console.error('Notify error (withdrawal):', e.message));
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Withdrawal failed' });
  } finally {
    client.release();
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
});

export default router;
