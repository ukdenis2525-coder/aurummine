import crypto from 'crypto';
import { pool } from '../db.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const initData = req.headers['x-init-data'];
    if (!initData) return res.status(401).json({ error: 'No init data' });

    // Parse initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Validate Telegram signature
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (process.env.NODE_ENV === 'production' && expectedHash !== hash) {
      return res.status(401).json({ error: 'Invalid hash' });
    }

    const userParam = params.get('user');
    if (!userParam) return res.status(401).json({ error: 'No user data' });

    const tgUser = JSON.parse(userParam);

    // Extract referral tg_id from multiple sources (most reliable first):
    // 1. start_param from signed initData (from Telegram directly)
    // 2. x-ref-id header (from frontend)
    const startParam = params.get('start_param') || req.headers['x-ref-id'] || null;
    const refTgId = startParam ? parseInt(startParam, 10) : null;

    console.log(`[Auth] tg:${tgUser.id} | start_param: ${params.get('start_param')} | x-ref-id: ${req.headers['x-ref-id']} | refTgId: ${refTgId}`);

    // Get or create user
    let { rows } = await pool.query(
      `SELECT * FROM users WHERE tg_id = $1`, [tgUser.id]
    );

    if (rows.length === 0) {
      // New user — lookup referrer by tg_id
      let referrerId = null;
      if (refTgId && !isNaN(refTgId) && refTgId !== tgUser.id) {
        const { rows: refRows } = await pool.query(
          `SELECT id FROM users WHERE tg_id = $1`, [refTgId]
        );
        if (refRows.length > 0) referrerId = refRows[0].id;
      }

      const { rows: newRows } = await pool.query(
        `INSERT INTO users (tg_id, username, first_name, is_premium, ref_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tgUser.id, tgUser.username, tgUser.first_name, tgUser.is_premium || false, referrerId]
      );
      rows = newRows;

      if (referrerId) {
        await processReferral(referrerId, newRows[0].id);
        console.log(`✅ Referral created: referrer=${referrerId} (tg:${refTgId}) → new user=${newRows[0].id} (tg:${tgUser.id})`);
      } else if (refTgId) {
        console.log(`⚠️ Referrer tg:${refTgId} not found in DB`);
      }
    } else {
      // Existing user — late referral (if no referrer yet)
      const existingUser = rows[0];
      if (refTgId && !isNaN(refTgId) && refTgId !== tgUser.id && !existingUser.ref_id) {
        const { rows: refRows } = await pool.query(
          `SELECT id FROM users WHERE tg_id = $1`, [refTgId]
        );
        if (refRows.length > 0) {
          const referrerId = refRows[0].id;
          await pool.query(`UPDATE users SET ref_id = $1 WHERE id = $2`, [referrerId, existingUser.id]);
          await processReferral(referrerId, existingUser.id);
          rows[0].ref_id = referrerId;
          console.log(`✅ Late referral: referrer=${referrerId} (tg:${refTgId}) → existing user=${existingUser.id}`);
        }
      }

      // Update user info (name/username might change)
      if (tgUser.username !== existingUser.username || tgUser.first_name !== existingUser.first_name) {
        await pool.query(
          `UPDATE users SET username = $1, first_name = $2, is_premium = $3 WHERE id = $4`,
          [tgUser.username, tgUser.first_name, tgUser.is_premium || false, existingUser.id]
        );
        rows[0].username = tgUser.username;
        rows[0].first_name = tgUser.first_name;
      }
    }

    // Silent block
    if (rows[0].is_blocked) {
      return res.status(403).json({ error: 'Service temporarily unavailable' });
    }

    req.user = rows[0];
    next();
  } catch (e) {
    console.error('Auth error:', e);
    res.status(401).json({ error: 'Auth failed' });
  }
};

const processReferral = async (referrerId, refereeId) => {
  try {
    // Create referral as PENDING (is_confirmed = false)
    // Reward will be given when referee watches first ad (becomes active)
    await pool.query(
      `INSERT INTO referrals (referrer_id, referee_id, is_confirmed) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING`,
      [referrerId, refereeId]
    );
  } catch (e) {
    console.error('Referral error:', e);
  }
};


