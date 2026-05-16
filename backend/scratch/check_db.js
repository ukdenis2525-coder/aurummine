import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  try {
    const res = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'user_ips'");
    console.log('TABLE EXISTS:', res.rows[0].count === '1');
    
    if (res.rows[0].count === '0') {
        const res2 = await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_ip'");
        console.log('last_ip column in users:', res2.rows[0].count === '1');
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

check();
