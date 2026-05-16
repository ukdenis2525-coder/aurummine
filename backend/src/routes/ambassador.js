import { Router } from 'express';
import { Api, InputFile } from 'grammy';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAllAdminIds } from './admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tgApi = process.env.BOT_TOKEN ? new Api(process.env.BOT_TOKEN) : null;

const router = Router();

// ── Multer config: save images to uploads/ambassador/ ──
const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'ambassador');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    const ext = path.extname(file.originalname).toLowerCase();
    const isExtAllowed = allowedExts.includes(ext);
    const isMimeAllowed = allowedMimes.includes(file.mimetype);

    if (isExtAllowed && isMimeAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

// ── Helper: check if user is admin ──
const isAdmin = async (req) => {
  const initData = req.headers['x-init-data'];
  if (!initData) return false;
  try {
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    if (!userParam) return false;
    const tgUser = JSON.parse(userParam);
    const adminIds = await getAllAdminIds();
    return adminIds.includes(String(tgUser.id));
  } catch { return false; }
};

// ── Admin middleware for ambassador admin routes ──
const ambassadorAdminMiddleware = async (req, res, next) => {
  if (await isAdmin(req)) return next();

  // Also check x-admin-key
  const key = req.headers['x-admin-key'];
  if (key && key === process.env.ADMIN_KEY) return next();

  return res.status(403).json({ error: 'Forbidden' });
};

// ══════════════════════════════════════════════════
// USER-FACING ROUTES (require auth)
// ══════════════════════════════════════════════════

// Check visibility + public settings
router.get('/visibility', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('ambassador_visibility', 'ambassador_min_subscribers', 'ambassador_commission_pct')`
    );
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      visibility: parseInt(s.ambassador_visibility || '0'),
      min_subscribers: parseInt(s.ambassador_min_subscribers || '1000'),
      commission_pct: parseInt(s.ambassador_commission_pct || '25'),
    });
  } catch (e) {
    res.json({ visibility: 0, min_subscribers: 1000, commission_pct: 25 });
  }
});

// Apply for partnership
router.post('/apply', authMiddleware, async (req, res) => {
  const { channel_username } = req.body;
  const userId = req.user.id;

  if (!channel_username) {
    return res.status(400).json({ error: 'channel_username required' });
  }

  // Clean up username (remove @ and https://t.me/)
  let cleanUsername = channel_username.trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');

  if (!cleanUsername) {
    return res.status(400).json({ error: 'Invalid channel username' });
  }

  try {
    // Check if channel already submitted by this user
    const { rows: existing } = await pool.query(
      `SELECT id FROM ambassador_channels WHERE user_id = $1 AND channel_username = $2`,
      [userId, cleanUsername]
    );
    if (existing.length) {
      return res.status(400).json({ error: 'Channel already submitted' });
    }

    // Try to get channel info from Telegram
    let channelTitle = cleanUsername;
    let channelTgId = null;
    let subscribersCount = 0;

    if (tgApi) {
      try {
        const chat = await tgApi.getChat(`@${cleanUsername}`);
        channelTitle = chat.title || cleanUsername;
        channelTgId = String(chat.id);

        // Get member count
        try {
          const count = await tgApi.getChatMemberCount(chat.id);
          subscribersCount = count;
        } catch (e) {}

        // Check if bot is admin
        try {
          const botInfo = await tgApi.getMe();
          const member = await tgApi.getChatMember(chat.id, botInfo.id);
          if (!['administrator', 'creator'].includes(member.status)) {
            return res.status(400).json({
              error: 'Bot is not an admin of this channel. Add the bot as admin first!'
            });
          }
          // Check post permissions
          if (member.status === 'administrator' && !member.can_post_messages) {
            return res.status(400).json({
              error: 'Bot does not have permission to post messages. Enable "Post Messages" for the bot!'
            });
          }
        } catch (e) {
          return res.status(400).json({
            error: 'Cannot verify bot admin status. Make sure bot is added as admin to the channel.'
          });
        }
      } catch (e) {
        return res.status(400).json({
          error: 'Channel not found or is private. Use a public channel username.'
        });
      }
    }

    // Check minimum subscribers (from admin settings)
    let minSubs = 1000;
    try {
      const { rows: msRows } = await pool.query(
        `SELECT value FROM app_settings WHERE key = 'ambassador_min_subscribers'`
      );
      if (msRows.length) minSubs = parseInt(msRows[0].value) || 1000;
    } catch (e) {}

    if (subscribersCount < minSubs) {
      return res.status(400).json({
        error: `Channel has ${subscribersCount} subscribers. Minimum ${minSubs} required.`
      });
    }

    // Insert application
    const { rows } = await pool.query(
      `INSERT INTO ambassador_channels (user_id, channel_tg_id, channel_username, channel_title, subscribers_count, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [userId, channelTgId, cleanUsername, channelTitle, subscribersCount]
    );

    res.json({ success: true, channel: rows[0] });
  } catch (e) {
    console.error('[Ambassador] Apply error:', e.message);
    res.status(500).json({ error: 'Application failed' });
  }
});

// Get my channels
router.get('/my-channels', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ambassador_channels WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

// List all approved ambassadors (public — for users to see promo codes)
router.get('/list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ac.channel_username, ac.channel_title, ac.subscribers_count,
              u.username, u.first_name,
              pc.code AS promo_code, pc.discount_pct
       FROM ambassador_channels ac
       JOIN users u ON u.id = ac.user_id
       LEFT JOIN promo_code_uses pcu ON pcu.user_id = ac.user_id AND pcu.source = 'ambassador'
       LEFT JOIN promo_codes pc ON pc.id = pcu.promo_id AND pc.is_active = TRUE
       WHERE ac.status = 'approved'
       ORDER BY ac.subscribers_count DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Cancel own partnership
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM ambassador_channels WHERE user_id = $1 AND status IN ('approved', 'pending')`,
      [req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'No active partnership found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to cancel partnership' });
  }
});

// ══════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════

// Get all channel applications
router.get('/admin/channels', ambassadorAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ac.*, u.tg_id, u.username, u.first_name
       FROM ambassador_channels ac
       JOIN users u ON u.id = ac.user_id
       ORDER BY ac.created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

// Approve channel
router.post('/admin/channels/:id/approve', ambassadorAdminMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE ambassador_channels SET status = 'approved' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to approve' });
  }
});

// Reject channel
router.post('/admin/channels/:id/reject', ambassadorAdminMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE ambassador_channels SET status = 'rejected' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reject' });
  }
});

// Delete channel
router.delete('/admin/channels/:id', ambassadorAdminMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM ambassador_channels WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ── Posts Management ──

// List all posts
router.get('/admin/posts', ambassadorAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ambassador_posts ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Create post with image
router.post('/admin/posts', ambassadorAdminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, text } = req.body;
    if (!title && !text) {
      return res.status(400).json({ error: 'Title or text required' });
    }

    const imagePath = req.file ? `/uploads/ambassador/${req.file.filename}` : null;

    const { rows } = await pool.query(
      `INSERT INTO ambassador_posts (title, text, image_path, status)
       VALUES ($1, $2, $3, 'draft') RETURNING *`,
      [title || '', text || '', imagePath]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error('[Ambassador] Create post error:', e.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
router.put('/admin/posts/:id', ambassadorAdminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, text } = req.body;
    const postId = req.params.id;

    // If new image uploaded, delete old one
    if (req.file) {
      const { rows: old } = await pool.query(
        `SELECT image_path FROM ambassador_posts WHERE id = $1`, [postId]
      );
      if (old.length && old[0].image_path) {
        const oldPath = path.join(__dirname, '..', '..', old[0].image_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    const imagePath = req.file ? `/uploads/ambassador/${req.file.filename}` : undefined;

    let query, params;
    if (imagePath) {
      query = `UPDATE ambassador_posts SET title = $1, text = $2, image_path = $3 WHERE id = $4 RETURNING *`;
      params = [title || '', text || '', imagePath, postId];
    } else {
      query = `UPDATE ambassador_posts SET title = $1, text = $2 WHERE id = $3 RETURNING *`;
      params = [title || '', text || '', postId];
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/admin/posts/:id', ambassadorAdminMiddleware, async (req, res) => {
  try {
    // Delete image file
    const { rows } = await pool.query(
      `SELECT image_path FROM ambassador_posts WHERE id = $1`, [req.params.id]
    );
    if (rows.length && rows[0].image_path) {
      const filePath = path.join(__dirname, '..', '..', rows[0].image_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query(`DELETE FROM ambassador_posts WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Publish post to all approved channels
router.post('/admin/posts/:id/publish', ambassadorAdminMiddleware, async (req, res) => {
  if (!tgApi) return res.status(500).json({ error: 'BOT_TOKEN not configured' });

  try {
    const postId = req.params.id;
    const { rows: posts } = await pool.query(
      `SELECT * FROM ambassador_posts WHERE id = $1`, [postId]
    );
    if (!posts.length) return res.status(404).json({ error: 'Post not found' });

    const post = posts[0];

    // Get all approved channels
    const { rows: channels } = await pool.query(
      `SELECT * FROM ambassador_channels WHERE status = 'approved'`
    );

    if (!channels.length) {
      return res.status(400).json({ error: 'No approved channels to publish to' });
    }

    let sent = 0, failed = 0;
    const errors = [];

    for (const channel of channels) {
      try {
        const chatId = channel.channel_tg_id || `@${channel.channel_username}`;

        // Get channel owner's tg_id for personalized referral link
        let ownerTgId = '';
        try {
          const { rows: ownerRows } = await pool.query(
            `SELECT u.tg_id FROM users u WHERE u.id = $1`, [channel.user_id]
          );
          if (ownerRows.length) ownerTgId = ownerRows[0].tg_id;
        } catch (e) {}

        const botUser = process.env.BOT_USERNAME || 'AurumMiBot';
        const webApp = process.env.WEBAPP_SHORT_NAME || 'app';
        const refLink = ownerTgId
          ? `https://t.me/${botUser}/${webApp}?startapp=${ownerTgId}`
          : `https://t.me/${botUser}/${webApp}`;

        // Replace placeholders in text
        let caption = [post.title, post.text].filter(Boolean).join('\n\n');
        caption = caption.replace(/\{REF_LINK\}/gi, refLink);
        caption = caption.replace(/\{REF_CODE\}/gi, ownerTgId || '');

        // Replace {promo} with unused partner promo code for this channel owner
        if (caption.includes('{promo}')) {
          try {
            const { rows: promos } = await pool.query(
              `SELECT pc.id, pc.code, pc.discount_pct, pc.max_uses, pc.used_count 
               FROM promo_codes pc
               WHERE pc.is_partner = TRUE AND pc.is_active = TRUE 
               AND (pc.max_uses = 0 OR pc.used_count < pc.max_uses)
               AND (pc.expires_at IS NULL OR pc.expires_at > NOW())
               AND NOT EXISTS (SELECT 1 FROM promo_code_uses pcu WHERE pcu.promo_id = pc.id AND pcu.user_id = $1)
               ORDER BY pc.id ASC LIMIT 1`,
              [channel.user_id]
            );
            if (promos.length) {
              const promo = promos[0];
              const promoText = `🎁 Промокод на покупку -${promo.discount_pct}%: <b>${promo.code}</b>`;
              caption = caption.replace('{promo}', promoText);
              // Record distribution (not actual usage — doesn't count toward max_uses)
              await pool.query(
                `INSERT INTO promo_code_uses (promo_id, user_id, source) VALUES ($1, $2, 'ambassador') ON CONFLICT DO NOTHING`,
                [promo.id, channel.user_id]
              );
            } else {
              caption = caption.replace('{promo}', '');
            }
          } catch (promoErr) {
            caption = caption.replace('{promo}', '');
            console.error('[Ambassador] Promo assignment error:', promoErr.message);
          }
        }

        // Inline button with referral link
        const replyMarkup = {
          inline_keyboard: [[
            { text: '🚀 Открыть', url: refLink }
          ]]
        };

        if (post.image_path) {
          const imagePath = path.join(__dirname, '..', '..', post.image_path);
          const fileExists = fs.existsSync(imagePath);

          // Use cached telegram file_id if local file is gone (e.g. after redeploy)
          let photoSource = null;
          if (fileExists) {
            photoSource = new InputFile(imagePath);
          } else if (post.tg_file_id) {
            photoSource = post.tg_file_id;
          }

          if (photoSource) {
            const result = await tgApi.sendPhoto(chatId, photoSource, {
              caption: caption || undefined,
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            });
            // Cache telegram file_id for future use (after redeploy)
            if (!post.tg_file_id && result?.photo?.length) {
              const fileId = result.photo[result.photo.length - 1].file_id;
              post.tg_file_id = fileId;
              try {
                await pool.query(
                  `ALTER TABLE ambassador_posts ADD COLUMN IF NOT EXISTS tg_file_id TEXT`
                );
                await pool.query(
                  `UPDATE ambassador_posts SET tg_file_id = $1 WHERE id = $2`,
                  [fileId, post.id]
                );
              } catch (e) {}
            }
          } else {
            if (caption) {
              await tgApi.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: replyMarkup });
            }
          }
        } else {
          if (caption) {
            await tgApi.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: replyMarkup });
          }
        }
        sent++;
      } catch (e) {
        failed++;
        errors.push(`@${channel.channel_username}: ${e.message}`);
      }

      // Rate limit
      if ((sent + failed) % 20 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Update post status
    await pool.query(
      `UPDATE ambassador_posts SET status = 'published', published_at = NOW() WHERE id = $1`,
      [postId]
    );

    res.json({
      success: true,
      total: channels.length,
      sent,
      failed,
      errors: errors.slice(0, 10), // Return first 10 errors
    });
  } catch (e) {
    console.error('[Ambassador] Publish error:', e.message);
    res.status(500).json({ error: 'Publish failed: ' + e.message });
  }
});

// ── Visibility Settings ──

// Get settings
router.get('/admin/settings', ambassadorAdminMiddleware, async (req, res) => {
  try {
    const { rows: settingsRows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('ambassador_visibility', 'ambassador_commission_pct', 'ref_commission_pct', 'ambassador_min_subscribers')`
    );
    const s = {};
    for (const r of settingsRows) s[r.key] = r.value;
    const visibility = parseInt(s.ambassador_visibility || '0');
    const commission_pct = parseFloat(s.ambassador_commission_pct || '25');
    const standard_commission_pct = parseFloat(s.ref_commission_pct || '15');
    const min_subscribers = parseInt(s.ambassador_min_subscribers || '1000');

    // Stats
    const [totalChannels, approvedChannels, pendingChannels, totalPosts] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c FROM ambassador_channels`),
      pool.query(`SELECT COUNT(*) as c FROM ambassador_channels WHERE status = 'approved'`),
      pool.query(`SELECT COUNT(*) as c FROM ambassador_channels WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) as c FROM ambassador_posts`),
    ]);

    res.json({
      visibility,
      commission_pct,
      standard_commission_pct,
      min_subscribers,
      stats: {
        total_channels: parseInt(totalChannels.rows[0].c),
        approved_channels: parseInt(approvedChannels.rows[0].c),
        pending_channels: parseInt(pendingChannels.rows[0].c),
        total_posts: parseInt(totalPosts.rows[0].c),
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Update visibility: 0=hidden, 1=all see, 2=admin only
router.post('/admin/settings', ambassadorAdminMiddleware, async (req, res) => {
  const { visibility, commission_pct, min_subscribers } = req.body;
  try {
    if (visibility !== undefined && [0, 1, 2].includes(visibility)) {
      await pool.query(
        `INSERT INTO app_settings (key, value, label) VALUES ('ambassador_visibility', $1, 'Видимость раздела Амбассадор')
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [String(visibility)]
      );
    }
    if (commission_pct !== undefined && commission_pct >= 0 && commission_pct <= 100) {
      await pool.query(
        `INSERT INTO app_settings (key, value, label) VALUES ('ambassador_commission_pct', $1, 'Комиссия амбассадора (%)')
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [String(commission_pct)]
      );
    }
    if (min_subscribers !== undefined && min_subscribers >= 0) {
      await pool.query(
        `INSERT INTO app_settings (key, value, label) VALUES ('ambassador_min_subscribers', $1, 'Мин. подписчиков для амбассадора')
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [String(min_subscribers)]
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

export default router;
