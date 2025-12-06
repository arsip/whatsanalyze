const { db } = require('./index');

// Helper function to run DuckDB queries
function runQuery(query) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Analysis functions
const analysis = {
  // Get message count by participant
  async getMessageCountByParticipant(conversationId) {
    const query = `
      SELECT
        participant_name,
        message_count,
        first_message_date,
        last_message_date
      FROM wa_participants
      WHERE conversation_id = ${conversationId}
      ORDER BY message_count DESC;
    `;
    return runQuery(query);
  },

  // Get message frequency by hour
  async getMessageFrequencyByHour(conversationId) {
    const query = `
      SELECT
        EXTRACT(HOUR FROM message_date) as hour,
        COUNT(*) as message_count
      FROM wa_messages
      WHERE conversation_id = ${conversationId}
      GROUP BY hour
      ORDER BY hour;
    `;
    return runQuery(query);
  },

  // Get message frequency by day of week
  async getMessageFrequencyByDayOfWeek(conversationId) {
    const query = `
      SELECT
        EXTRACT(DOW FROM message_date) as day_of_week,
        COUNT(*) as message_count
      FROM wa_messages
      WHERE conversation_id = ${conversationId}
      GROUP BY day_of_week
      ORDER BY day_of_week;
    `;
    return runQuery(query);
  },

  // Get message frequency over time
  async getMessageFrequencyOverTime(conversationId, interval = 'day') {
    const query = `
      SELECT
        DATE_TRUNC('${interval}', message_date) as period,
        COUNT(*) as message_count
      FROM wa_messages
      WHERE conversation_id = ${conversationId}
      GROUP BY period
      ORDER BY period;
    `;
    return runQuery(query);
  },

  // Get most active days
  async getMostActiveDays(conversationId, limit = 10) {
    const query = `
      SELECT
        DATE(message_date) as date,
        COUNT(*) as message_count
      FROM wa_messages
      WHERE conversation_id = ${conversationId}
      GROUP BY date
      ORDER BY message_count DESC
      LIMIT ${limit};
    `;
    return runQuery(query);
  },

  // Get conversation summary
  async getConversationSummary(conversationId) {
    const query = `
      SELECT
        c.chat_name,
        c.first_message_date,
        c.last_message_date,
        COUNT(DISTINCT m.author) as participant_count,
        COUNT(m.id) as total_messages,
        COUNT(CASE WHEN m.has_media THEN 1 END) as media_count
      FROM wa_conversations c
      JOIN wa_messages m ON c.id = m.conversation_id
      WHERE c.id = ${conversationId}
      GROUP BY c.id, c.chat_name, c.first_message_date, c.last_message_date;
    `;
    return runQuery(query);
  },

  // Get media statistics
  async getMediaStatistics(conversationId) {
    const query = `
      SELECT
        media_type,
        COUNT(*) as count
      FROM wa_messages
      WHERE conversation_id = ${conversationId}
        AND has_media = true
      GROUP BY media_type
      ORDER BY count DESC;
    `;
    return runQuery(query);
  },

  // Get conversation list
  async getConversationList() {
    const query = `
      SELECT
        c.id,
        c.chat_name,
        c.first_message_date,
        c.last_message_date,
        COUNT(m.id) as message_count
      FROM wa_conversations c
      JOIN wa_messages m ON c.id = m.conversation_id
      GROUP BY c.id, c.chat_name, c.first_message_date, c.last_message_date
      ORDER BY c.last_message_date DESC;
    `;
    return runQuery(query);
  }
};

module.exports = analysis;
