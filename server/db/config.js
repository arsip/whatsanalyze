const config = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'whatsanalyze',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  },
  duckdb: {
    database: process.env.DUCKDB_PATH || './data/whatsanalyze.db'
  }
};

module.exports = config;
