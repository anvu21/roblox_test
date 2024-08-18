const { Pool } = require('pg');

const pools = {};

function getPool(gameName) {
  const dbName = gameName ? gameName : process.env.DB_NAME;
  if (!pools[dbName]) {
    pools[dbName] = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: dbName,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });
  }
  return pools[dbName];
}

module.exports = { getPool };