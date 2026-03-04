const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('neon') || process.env.DATABASE_URL.includes('rlwy') || process.env.DATABASE_URL.includes('railway')) ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { query, pool };
