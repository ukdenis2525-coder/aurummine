import { pool } from './db.js';

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        tg_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        power NUMERIC(20,2) DEFAULT 0,
        hashes NUMERIC(20,8) DEFAULT 0,
        ton_balance NUMERIC(20,8) DEFAULT 0,
        ref_id INTEGER REFERENCES users(id),
        is_premium BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE,
        last_accrue_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS power_packages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        power_amount NUMERIC(20,2) NOT NULL,
        price_ton NUMERIC(10,4) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        package_id INTEGER REFERENCES power_packages(id),
        power_amount NUMERIC(20,2),
        ton_paid NUMERIC(10,4),
        tx_hash VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        ton_amount NUMERIC(10,8),
        wallet_address VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        tx_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER REFERENCES users(id),
        referee_id INTEGER REFERENCES users(id) UNIQUE,
        is_confirmed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS referral_rewards (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER REFERENCES users(id),
        referee_id INTEGER REFERENCES users(id),
        reward_type VARCHAR(20),
        power_amount NUMERIC(20,2) DEFAULT 0,
        ton_amount NUMERIC(10,8) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        reward_power NUMERIC(20,2),
        type VARCHAR(50),
        link VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS user_tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        task_id INTEGER REFERENCES tasks(id),
        completed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, task_id)
      );

      CREATE TABLE IF NOT EXISTS task_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        link VARCHAR(500) NOT NULL,
        price_per_user NUMERIC(10,4) NOT NULL,
        reward_power NUMERIC(20,2) NOT NULL,
        max_completions INTEGER NOT NULL,
        completed_count INTEGER DEFAULT 0,
        total_paid NUMERIC(10,4) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        task_id INTEGER REFERENCES tasks(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mining_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        hashes_earned NUMERIC(20,8),
        ton_converted NUMERIC(10,8) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pending_purchases (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        package_id INTEGER REFERENCES power_packages(id),
        memo VARCHAR(32) UNIQUE NOT NULL,
        ton_amount NUMERIC(10,4) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        expires_at TIMESTAMP NOT NULL,
        tx_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        label VARCHAR(255)
      );
    `);

    // Add indexes for performance
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_power_packages_name ON power_packages(name);
      CREATE INDEX IF NOT EXISTS idx_pending_purchases_status ON pending_purchases(status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_users_power ON users(power DESC) WHERE power > 0;
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
      CREATE INDEX IF NOT EXISTS idx_mining_log_user ON mining_log(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_task_orders_status ON task_orders(status);
    `);

    // Add is_blocked column if not exists (for existing DBs)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
    `);

    // Add visibility column to tasks (admin = only admins see, all = everyone)
    await client.query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'all';
    `);

    // Add advertiser fields to tasks
    await client.query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS creator_id INTEGER REFERENCES users(id);
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_completions INTEGER;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_count INTEGER DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS order_id INTEGER;
    `);

    // Add order_data to pending_purchases (for task order payments)
    await client.query(`
      ALTER TABLE pending_purchases ALTER COLUMN package_id DROP NOT NULL;
      ALTER TABLE pending_purchases ADD COLUMN IF NOT EXISTS order_data JSONB;
    `);

    // Seed packages
    await client.query(`
      INSERT INTO power_packages (name, power_amount, price_ton) VALUES
        ('Starter',    10000,   0.10),
        ('Basic',     100000,   0.85),
        ('Advanced',  500000,   3.50),
        ('Pro',      1000000,   6.00)
      ON CONFLICT (name) DO NOTHING;
    `);

    // Seed referral & ad settings
    await client.query(`
      INSERT INTO app_settings (key, value, label) VALUES
        ('ref_power_premium', '6000', 'Power за Premium реферала'),
        ('ref_power_normal',  '3000', 'Power за обычного реферала'),
        ('ref_commission_pct', '15',  'Комиссия с покупок (%)'),
        ('ad_reward_power',   '500',  'Power за просмотр рекламы'),
        ('ad_cooldown_seconds', '60', 'Кулдаун между рекламами (сек)'),
        ('ad_daily_limit',    '50',   'Лимит просмотров в день'),
        ('monetag_reward_power', '5', 'Power за просмотр Monetag'),
        ('order_price_subscribe', '0.01', 'Цена за 1 подписку (TON)'),
        ('order_price_start_bot', '0.008', 'Цена за 1 запуск бота (TON)'),
        ('order_price_link',   '0.005', 'Цена за 1 переход (TON)'),
        ('order_reward_subscribe', '500', 'Награда юзеру за подписку (POWER)'),
        ('order_reward_start_bot', '300', 'Награда юзеру за запуск бота (POWER)'),
        ('order_reward_link',   '200', 'Награда юзеру за переход (POWER)')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Admins table — dynamic admin list managed from admin panel
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        tg_id BIGINT UNIQUE NOT NULL,
        label VARCHAR(255),
        permissions TEXT DEFAULT '[]',
        added_by BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add permissions column if not exists (for existing DBs)
    await client.query(`
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '[]';
    `);

    // Multi-account detection: track user IPs
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_ips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ip VARCHAR(45) NOT NULL,
        user_agent_hash VARCHAR(64),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_ips_ip ON user_ips(ip);
      CREATE INDEX IF NOT EXISTS idx_user_ips_user ON user_ips(user_id);
    `);

    // Multi-account ignore list (whitelisted IPs for withdrawals)
    await client.query(`
      CREATE TABLE IF NOT EXISTS multi_ignore (
        id SERIAL PRIMARY KEY,
        ip VARCHAR(45) UNIQUE NOT NULL,
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add last_ip to users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip VARCHAR(45);
    `);

    // Add last_seen_at for online tracking
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
    `);

    // Add ads_watched counter
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ads_watched INTEGER DEFAULT 0;
    `);

    // Add bot_blocked — auto-detected when broadcast fails (user blocked bot / deactivated)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_blocked BOOLEAN DEFAULT FALSE;
    `);

    // IP Blacklist — block new accounts from banned IPs
    await client.query(`
      CREATE TABLE IF NOT EXISTS ip_blacklist (
        id SERIAL PRIMARY KEY,
        ip VARCHAR(45) UNIQUE NOT NULL,
        reason VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON ip_blacklist(ip);
    `);

    // ── Ambassador / Partnership tables ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS ambassador_channels (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        channel_tg_id VARCHAR(64),
        channel_username VARCHAR(255) NOT NULL,
        channel_title VARCHAR(500),
        subscribers_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ambassador_channels_user ON ambassador_channels(user_id);
      CREATE INDEX IF NOT EXISTS idx_ambassador_channels_status ON ambassador_channels(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ambassador_posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500),
        text TEXT,
        image_path VARCHAR(500),
        status VARCHAR(20) DEFAULT 'draft',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed ambassador settings
    await client.query(`
      INSERT INTO app_settings (key, value, label) VALUES
        ('ambassador_visibility', '0', 'Видимость раздела Амбассадор (0=скрыт, 1=все, 2=только админ)'),
        ('ambassador_commission_pct', '25', 'Комиссия амбассадора от покупок рефералов (%)')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Seed withdrawal settings
    await client.query(`
      INSERT INTO app_settings (key, value, label) VALUES
        ('min_withdraw_ton', '0.1', 'Минимальная сумма вывода (TON)'),
        ('withdraw_fee_mode', 'none', 'Режим комиссии (none/fixed/percent/hybrid)'),
        ('withdraw_fee_fixed', '0.01', 'Фиксированная комиссия (TON)'),
        ('withdraw_fee_percent', '5', 'Процентная комиссия (%)'),
        ('withdraw_fee_hybrid_threshold', '1', 'Порог гибрида (TON) — ниже фикс, выше процент'),
        ('withdraw_processing_hours', '1-24', 'Время обработки вывода (текст)'),
        ('withdraw_require_deposit', '0', 'Требовать покупку пакета для вывода (0/1)'),
        ('withdraw_check_bot', '0', 'Блокировать вывод для ботов (0/1)'),
        ('withdraw_check_multi', '0', 'Блокировать вывод для мультиаккаунтов (0/1)')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Add fee_amount column to withdrawals
    await client.query(`
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10,8) DEFAULT 0;
    `);

    // ── Promo codes ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_pct INTEGER DEFAULT 0,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS promo_code_uses (
        id SERIAL PRIMARY KEY,
        promo_id INTEGER REFERENCES promo_codes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        source VARCHAR(20) DEFAULT 'purchase',
        used_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_uses_unique ON promo_code_uses(promo_id, user_id);
    `);

    // Add source column if not exists
    await client.query(`
      ALTER TABLE promo_code_uses ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'purchase';
    `);

    // Drop old unique index and create new one that allows same promo for same user with different sources
    await client.query(`
      DROP INDEX IF EXISTS idx_promo_uses_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_uses_unique_src ON promo_code_uses(promo_id, user_id, source);
    `);

    // ── Partner flag for promo codes (for broadcast auto-insert) ──
    await client.query(`
      ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT FALSE;
    `);

    // ── Admin Activity Log ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_activity_log (
        id SERIAL PRIMARY KEY,
        admin_tg_id VARCHAR(50) NOT NULL,
        admin_name VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_activity_tg ON admin_activity_log(admin_tg_id);
    `);

    console.log('Migration complete');
  } catch (e) {
    console.error('Migration error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
};

migrate();
