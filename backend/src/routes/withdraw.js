import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import { notifyWithdrawal } from '../services/notify.js';

// Load all withdraw settings from app_settings
const getWithdrawSettings = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('min_withdraw_ton', 'withdraw_fee_mode', 'withdraw_fee_fixed', 'withdraw_fee_percent', 'withdraw_fee_hybrid_threshold')`
    );
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return {
      minWithdraw: parseFloat(map.min_withdraw_ton || '0.1'),
      feeMode: map.withdraw_fee_mode || 'none',
      feeFixed: parseFloat(map.withdraw_fee_fixed || '0.01'),
      feePercent: parseFloat(map.withdraw_fee_percent || '5'),
      hybridThreshold: parseFloat(map.withdraw_fee_hybrid_threshold || '1'),
    };
  } catch {
    return { minWithdraw: 0.1, feeMode: 'none', feeFixed: 0.01, feePercent: 5, hybridThreshold: 1 };
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
    // Below threshold → fixed, above → percent
    if (amount <= hybridThreshold) {
      fee = feeFixed;
    } else {
      fee = amount * (feePercent / 100);
    }
  }
  // Fee can't exceed the withdrawal amount
  return Math.min(fee, amount);
};

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { wallet_address, ton_amount } = req.body;
  const user = req.user;

  if (!wallet_address || !ton_amount) {
    return res.status(400).json({ error: 'wallet_address and ton_amount required' });
  }
  // Validate TON wallet address format
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

    // Deduct full amount from user balance
    await client.query(
      `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
      [amount, user.id]
    );

    // Store net amount (what user receives) and fee separately
    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, ton_amount, wallet_address, fee_amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user.id, netAmount, wallet_address, fee]
    );

    await client.query('COMMIT');
    res.json({ success: true, withdrawal: rows[0], fee });

    // Notify admins about the withdrawal request
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
