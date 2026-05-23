const { Pool } = require("pg");
const { loadEnv } = require("./load-env");

loadEnv();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5434),
  database: process.env.DB_NAME || "helpdeskflow",
  user: process.env.DB_USER || "helpdeskflow",
  password: process.env.DB_PASSWORD || "helpdeskflow",
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error", error);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function testConnection() {
  const result = await query("SELECT NOW() AS current_time");
  return result.rows[0];
}

module.exports = {
  pool,
  query,
  withTransaction,
  testConnection,
};
