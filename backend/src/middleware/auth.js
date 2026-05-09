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

    // Get or create user
    let { rows } = await pool.query(
      `SELECT * FROM users WHERE tg_id = $1`, [tgUser.id]
    );

    if (rows.length === 0) {
      const rawRefId = req.headers['x-ref-id'] || null;
      const refId = rawRefId ? parseInt(rawRefId, 10) : null;

      // Verify referrer exists before setting ref_id
      let validRefId = null;
      if (refId && !isNaN(refId)) {
        const { rows: refRows } = await pool.query(
          `SELECT id FROM users WHERE id = $1`, [refId]
        );
        if (refRows.length > 0) validRefId = refId;
      }

      const { rows: newRows } = await pool.query(
        `INSERT INTO users (tg_id, username, first_name, is_premium, ref_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tgUser.id, tgUser.username, tgUser.first_name, tgUser.is_premium || false, validRefId]
      );
      rows = newRows;

      // Process referral
      if (validRefId) {
        await processReferral(validRefId, newRows[0].id);
      }
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
    await pool.query(
      `INSERT INTO referrals (referrer_id, referee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [referrerId, refereeId]
    );
  } catch (e) {
    console.error('Referral error:', e);
  }
};
