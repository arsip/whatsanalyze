const { Pool } = require('pg');
const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// PostgreSQL connection pool
const pgPool = new Pool(config.postgres);

// Initialize DuckDB
const db = new duckdb.Database(config.duckdb.database);

// Initialize schema
async function initializeDatabase() {
  try {
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pgPool.query(schemaSQL);
    console.log('PostgreSQL schema initialized successfully');
  } catch (error) {
    console.error('Error initializing PostgreSQL schema:', error);
    throw error;
  }
}

// Store WhatsApp chat data
async function storeWhatsAppChat(chatData) {
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    // Insert conversation
    const conversationResult = await client.query(
      `INSERT INTO conversations (chat_name, first_message_date, last_message_date)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        chatData.chatName || 'Unnamed Chat',
        chatData.messages[0]?.date,
        chatData.messages[chatData.messages.length - 1]?.date
      ]
    );

    const conversationId = conversationResult.rows[0].id;

    // Insert messages
    for (const message of chatData.messages) {
      await client.query(
        `INSERT INTO messages
         (conversation_id, author, message_text, message_date, has_media, media_type, location_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          conversationId,
          message.author,
          message.message,
          message.date,
          message.hasMedia || false,
          message.mediaType,
          message.location ? JSON.stringify(message.location) : null
        ]
      );
    }

    // Insert and update participants
    const participants = new Map();
    for (const message of chatData.messages) {
      if (!participants.has(message.author)) {
        participants.set(message.author, {
          messageCount: 1,
          firstMessage: message.date,
          lastMessage: message.date
        });
      } else {
        const participant = participants.get(message.author);
        participant.messageCount++;
        participant.lastMessage = message.date;
      }
    }

    for (const [author, data] of participants) {
      await client.query(
        `INSERT INTO participants
         (conversation_id, participant_name, message_count, first_message_date, last_message_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          conversationId,
          author,
          data.messageCount,
          data.firstMessage,
          data.lastMessage
        ]
      );
    }

    await client.query('COMMIT');
    return conversationId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Setup DuckDB connection to PostgreSQL
async function setupDuckDBConnection() {
  return new Promise((resolve, reject) => {
    db.all(
      `INSTALL postgres;
       LOAD postgres;
       CREATE OR REPLACE VIEW wa_messages AS
       SELECT * FROM postgres_scan(
         '${config.postgres.host}',
         ${config.postgres.port},
         '${config.postgres.database}',
         'messages',
         '${config.postgres.user}',
         '${config.postgres.password}'
       );
       CREATE OR REPLACE VIEW wa_conversations AS
       SELECT * FROM postgres_scan(
         '${config.postgres.host}',
         ${config.postgres.port},
         '${config.postgres.database}',
         'conversations',
         '${config.postgres.user}',
         '${config.postgres.password}'
       );
       CREATE OR REPLACE VIEW wa_participants AS
       SELECT * FROM postgres_scan(
         '${config.postgres.host}',
         ${config.postgres.port},
         '${config.postgres.database}',
         'participants',
         '${config.postgres.user}',
         '${config.postgres.password}'
       );`,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = {
  pgPool,
  db,
  initializeDatabase,
  storeWhatsAppChat,
  setupDuckDBConnection
};
