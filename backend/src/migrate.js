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

      CREATE TABLE IF NOT EXISTS mining_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        hashes_earned NUMERIC(20,8),
        ton_converted NUMERIC(10,8) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed packages
    await client.query(`
      INSERT INTO power_packages (name, power_amount, price_ton) VALUES
        ('Starter',    10000,   0.10),
        ('Basic',     100000,   0.85),
        ('Advanced',  500000,   3.50),
        ('Pro',      1000000,   6.00)
      ON CONFLICT DO NOTHING;
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
