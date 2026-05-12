import axios from 'axios';
import { pool } from '../db.js';
import { notifyPurchase, notifyTaskOrder } from './notify.js';

const TONCENTER_API = 'https://toncenter.com/api/v2';
const WALLET_ADDRESS = process.env.PAYMENT_WALLET;
const API_KEY = process.env.TONCENTER_API_KEY || '';

// Check incoming transactions on our wallet
const getTransactions = async () => {
  try {
    const res = await axios.get(`${TONCENTER_API}/getTransactions`, {
      params: {
        address: WALLET_ADDRESS,
        limit: 100,
        api_key: API_KEY
      },
      timeout: 15000
    });
    return res.data?.result || [];
  } catch (e) {
    console.error('TON API error:', e.message);
    return [];
  }
};

export const checkPendingPayments = async () => {
  if (!WALLET_ADDRESS) {
    console.warn('PAYMENT_WALLET not set, skipping payment check');
    return;
  }

  const client = await pool.connect();
  try {
    // Get all pending purchases not expired (both package + task orders)
    const { rows: pending } = await client.query(
      `SELECT pp.*, COALESCE(pkg.power_amount, 0) as power_amount
       FROM pending_purchases pp
       LEFT JOIN power_packages pkg ON pkg.id = pp.package_id
       WHERE pp.status = 'pending' AND pp.expires_at > NOW()`
    );

    if (!pending.length) {
      console.log('No pending purchases to check');
      return;
    }

    console.log(`Checking ${pending.length} pending purchases...`);

    // Get recent transactions from TON
    const txs = await getTransactions();
    if (!txs.length) {
      console.log('No transactions found on wallet');
      return;
    }

    console.log(`Found ${txs.length} transactions on wallet`);

    for (const purchase of pending) {
      // Find tx matching memo and amount
      const match = txs.find(tx => {
        // Skip outgoing transactions
        if (!tx.in_msg || parseInt(tx.in_msg.value || 0) === 0) return false;

        const value = parseInt(tx.in_msg.value || 0) / 1e9;
        const amountMatch = Math.abs(value - parseFloat(purchase.ton_amount)) < 0.01;

        // Try multiple ways to extract the comment/memo
        let comment = '';

        // Method 1: msg_data.text (base64 encoded with op code)
        if (tx.in_msg.msg_data?.['@type'] === 'msg.dataText') {
          comment = tryDecodeBase64Text(tx.in_msg.msg_data.text);
        }
        // Method 2: msg_data.body (raw base64 body)
        else if (tx.in_msg.msg_data?.body) {
          comment = tryDecodeBase64Text(tx.in_msg.msg_data.body);
        }

        // Method 3: message field (plain text in some API versions)
        if (!comment && tx.in_msg.message) {
          comment = tx.in_msg.message.trim();
        }

        // Method 4: msg_data.text as plain string
        if (!comment && typeof tx.in_msg.msg_data?.text === 'string') {
          const raw = tx.in_msg.msg_data.text;
          // If it's already readable, use it
          if (/^[A-Za-z0-9]+$/.test(raw)) {
            comment = raw;
          } else {
            comment = tryDecodeBase64Text(raw);
          }
        }

        const memoMatch = comment.toUpperCase() === purchase.memo.toUpperCase();

        if (amountMatch || memoMatch) {
          console.log(`TX check: value=${value} expected=${purchase.ton_amount} amountMatch=${amountMatch} | comment="${comment}" memo="${purchase.memo}" memoMatch=${memoMatch}`);
        }

        // Match by MEMO (primary) — amount match is secondary confirmation
        return memoMatch && amountMatch;
      });

      if (match) {
        const txHash = match.transaction_id?.hash || match.hash || `manual_${Date.now()}`;
        await completePurchase(client, purchase, txHash);
      }
    }

    // Expire old pending purchases
    await client.query(
      `UPDATE pending_purchases SET status = 'expired'
       WHERE status = 'pending' AND expires_at <= NOW()`
    );

  } catch (e) {
    console.error('checkPendingPayments error:', e.message);
  } finally {
    client.release();
  }
};

// Decode base64-encoded comment (TON uses 4-byte op code prefix for text)
const tryDecodeBase64Text = (encoded) => {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length <= 4) return '';

    // Check if first 4 bytes are text comment op code (0x00000000)
    const opCode = buf.readUInt32BE(0);
    if (opCode === 0) {
      // Standard text comment: skip 4-byte op code
      return buf.slice(4).toString('utf8').replace(/\0/g, '').trim();
    }

    // Try without op code (some wallets don't add it)
    const full = buf.toString('utf8').replace(/\0/g, '').trim();
    if (/^[A-Za-z0-9]+$/.test(full)) return full;

    // With op code skip anyway
    return buf.slice(4).toString('utf8').replace(/\0/g, '').trim();
  } catch {
    return encoded;
  }
};

const completePurchase = async (client, purchase, txHash) => {
  try {
    await client.query('BEGIN');

    // Mark purchase as completed
    await client.query(
      `UPDATE pending_purchases SET status = 'completed', tx_hash = $1 WHERE id = $2`,
      [txHash, purchase.id]
    );

    // ── Task Order Payment ──
    if (purchase.order_data) {
      const od = typeof purchase.order_data === 'string' ? JSON.parse(purchase.order_data) : purchase.order_data;

      // Create task_order record
      await client.query(
        `INSERT INTO task_orders (user_id, type, title, link, price_per_user, reward_power, max_completions, total_paid, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [purchase.user_id, od.type, od.title || '', od.link, od.pricePerUser, od.rewardPower, od.count, od.totalPrice]
      );

      await client.query('COMMIT');
      console.log(`✅ Task order payment completed: user=${purchase.user_id} memo=${purchase.memo} ${od.count}x ${od.type} for ${od.totalPrice} TON`);

      // Notify admins
      try {
        const { rows: uRows } = await pool.query(
          `SELECT tg_id, username, first_name FROM users WHERE id = $1`, [purchase.user_id]
        );
        const u = uRows[0] || {};
        notifyTaskOrder({
          userId: purchase.user_id,
          tgId: u.tg_id,
          username: u.username,
          firstName: u.first_name,
          type: od.type,
          link: od.link,
          count: od.count,
          totalPaid: od.totalPrice,
          memo: purchase.memo,
        });
      } catch (ne) {
        console.error('Notify error (task order):', ne.message);
      }
      return;
    }

    // ── Regular Package Purchase ──
    // Record in purchases table
    await client.query(
      `INSERT INTO purchases (user_id, package_id, power_amount, ton_paid, tx_hash)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tx_hash) DO NOTHING`,
      [purchase.user_id, purchase.package_id, purchase.power_amount, purchase.ton_amount, txHash]
    );

    // Add power to user
    await client.query(
      `UPDATE users SET power = power + $1 WHERE id = $2`,
      [purchase.power_amount, purchase.user_id]
    );

    // Referral commission — use dynamic settings
    const { rows: refRows } = await client.query(
      `SELECT referrer_id FROM referrals WHERE referee_id = $1`, [purchase.user_id]
    );
    if (refRows.length > 0) {
      // Load referral settings from DB
      const { rows: settingsRows } = await client.query(
        `SELECT key, value FROM app_settings WHERE key LIKE 'ref_%' OR key = 'ambassador_commission_pct'`
      );
      const cfg = {};
      for (const r of settingsRows) cfg[r.key] = parseFloat(r.value);
      let commissionPct = (cfg.ref_commission_pct ?? 15) / 100;
      const powerPremium = cfg.ref_power_premium ?? 6000;
      const powerNormal = cfg.ref_power_normal ?? 3000;

      // Check if referrer is an ambassador (has approved channel) → use higher commission
      const { rows: ambRows } = await client.query(
        `SELECT ac.id FROM ambassador_channels ac
         JOIN users u ON u.id = ac.user_id
         WHERE u.id = $1 AND ac.status = 'approved' LIMIT 1`,
        [refRows[0].referrer_id]
      );
      if (ambRows.length > 0 && cfg.ambassador_commission_pct) {
        commissionPct = cfg.ambassador_commission_pct / 100;
      }

      const commission = parseFloat(purchase.ton_amount) * commissionPct;
      await client.query(
        `UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`,
        [commission, refRows[0].referrer_id]
      );
      await client.query(
        `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, ton_amount)
         VALUES ($1, $2, 'commission', $3)`,
        [refRows[0].referrer_id, purchase.user_id, commission]
      );
      await client.query(
        `UPDATE referrals SET is_confirmed = TRUE WHERE referee_id = $1`,
        [purchase.user_id]
      );

      // Power bonus if first purchase (registration reward on activation)
      const { rows: prevReward } = await client.query(
        `SELECT id FROM referral_rewards
         WHERE referrer_id = $1 AND referee_id = $2 AND reward_type = 'power'`,
        [refRows[0].referrer_id, purchase.user_id]
      );
      if (!prevReward.length) {
        const { rows: referee } = await client.query(
          `SELECT is_premium FROM users WHERE id = $1`, [purchase.user_id]
        );
        const powerBonus = referee[0]?.is_premium ? powerPremium : powerNormal;
        await client.query(
          `UPDATE users SET power = power + $1 WHERE id = $2`,
          [powerBonus, refRows[0].referrer_id]
        );
        await client.query(
          `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, power_amount)
           VALUES ($1, $2, 'power', $3)`,
          [refRows[0].referrer_id, purchase.user_id, powerBonus]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Purchase completed: user=${purchase.user_id} memo=${purchase.memo} power=+${purchase.power_amount}`);

    // Notify admins about the purchase
    try {
      const { rows: uRows } = await pool.query(
        `SELECT tg_id, username, first_name FROM users WHERE id = $1`, [purchase.user_id]
      );
      const { rows: pkgRows } = await pool.query(
        `SELECT name FROM power_packages WHERE id = $1`, [purchase.package_id]
      );
      const u = uRows[0] || {};
      notifyPurchase({
        userId: purchase.user_id,
        tgId: u.tg_id,
        username: u.username,
        firstName: u.first_name,
        packageName: pkgRows[0]?.name,
        powerAmount: purchase.power_amount,
        tonPaid: purchase.ton_amount,
        memo: purchase.memo,
      });
    } catch (ne) {
      console.error('Notify error (purchase):', ne.message);
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('completePurchase error:', e.message);
  }
};
