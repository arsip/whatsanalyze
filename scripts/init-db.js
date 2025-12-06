const { initializeDatabase, setupDuckDBConnection } = require('../server/db');

async function init() {
  try {
    // Initialize PostgreSQL schema
    await initializeDatabase();
    console.log('PostgreSQL schema initialized successfully');

    // Setup DuckDB connection
    await setupDuckDBConnection();
    console.log('DuckDB connection setup successfully');

    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

init();
