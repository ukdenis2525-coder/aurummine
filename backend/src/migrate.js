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

    console.log('Migration complete');
  } catch (e) {
    console.error('Migration error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
};

migrate();
