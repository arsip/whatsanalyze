import * as duckdb from '@duckdb/duckdb-wasm';
import { expose } from 'comlink';

// Initialize DuckDB
async function initDuckDB() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  return db;
}

// DuckDB operations
const duckDBOps = {
  async createTables() {
    const db = await initDuckDB();
    const conn = await db.connect();

    // Enhanced messages table with more analytics columns
    await conn.query(`
      CREATE TABLE messages (
        id INTEGER,
        author VARCHAR,
        message_text TEXT,
        message_date TIMESTAMP,
        has_media BOOLEAN,
        media_type VARCHAR,
        location_data JSON,
        word_count INTEGER GENERATED ALWAYS AS (
          REGEXP_COUNT(TRIM(REGEXP_REPLACE(message_text, '<[^>]+>', '')), '\\s+') + 1
        ) STORED,
        hour_of_day INTEGER GENERATED ALWAYS AS (EXTRACT(HOUR FROM message_date)) STORED,
        day_of_week INTEGER GENERATED ALWAYS AS (EXTRACT(DOW FROM message_date)) STORED,
        is_question BOOLEAN GENERATED ALWAYS AS (message_text LIKE '%?%') STORED,
        is_url BOOLEAN GENERATED ALWAYS AS (message_text ~ 'https?://[^\s]+') STORED,
        caps_percentage FLOAT GENERATED ALWAYS AS (
          REGEXP_COUNT(message_text, '[A-Z]')::FLOAT /
          NULLIF(LENGTH(REGEXP_REPLACE(message_text, '[^A-Za-z]', '', 'g')), 0) * 100
        ) STORED,
        message_length INTEGER GENERATED ALWAYS AS (LENGTH(message_text)) STORED,
        words_per_sentence FLOAT GENERATED ALWAYS AS (
          word_count::FLOAT / NULLIF(REGEXP_COUNT(message_text, '[.!?]+'), 0)
        ) STORED,
        has_voice_message BOOLEAN GENERATED ALWAYS AS (
          message_text ILIKE '%voice message%' OR
          message_text ILIKE '%audio%'
        ) STORED,
        has_quote BOOLEAN GENERATED ALWAYS AS (message_text ~ '▪.*') STORED,
        weekday BOOLEAN GENERATED ALWAYS AS (EXTRACT(DOW FROM message_date) NOT IN (0, 6)) STORED,
        month INTEGER GENERATED ALWAYS AS (EXTRACT(MONTH FROM message_date)) STORED,
        year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM message_date)) STORED,
        hour_category VARCHAR GENERATED ALWAYS AS (
          CASE
            WHEN hour_of_day BETWEEN 5 AND 11 THEN 'Morning'
            WHEN hour_of_day BETWEEN 12 AND 16 THEN 'Afternoon'
            WHEN hour_of_day BETWEEN 17 AND 21 THEN 'Evening'
            ELSE 'Night'
          END
        ) STORED,
        is_greeting BOOLEAN GENERATED ALWAYS AS (
          LOWER(message_text) ~ '(hi|hello|hey|good morning|good evening|good afternoon|hola|greetings)'
        ) STORED,
        is_farewell BOOLEAN GENERATED ALWAYS AS (
          LOWER(message_text) ~ '(bye|goodbye|see you|talk later|catch you|night|cya|ttyl)'
        ) STORED,
        has_emoji BOOLEAN GENERATED ALWAYS AS (
          message_text ~ '[\u{1F300}-\u{1F9FF}]'
        ) STORED,
        has_appreciation BOOLEAN GENERATED ALWAYS AS (
          LOWER(message_text) ~ '(thanks|thank you|thx|appreciate|grateful)'
        ) STORED,
        has_apology BOOLEAN GENERATED ALWAYS AS (
          LOWER(message_text) ~ '(sorry|apologies|apologize|my bad|oops)'
        ) STORED,
        has_agreement BOOLEAN GENERATED ALWAYS AS (
          LOWER(message_text) ~ '(agree|yes|yeah|sure|okay|ok|absolutely|definitely)'
        ) STORED,
        has_disagreement BOOLEAN GENERATED ALWAYS AS (
          LOWER(message_text) ~ '(disagree|no|nope|not really|don''t think so)'
        ) STORED,
        sentiment_score INTEGER GENERATED ALWAYS AS (
          CASE
            WHEN message_text ~ '(love|great|awesome|amazing|excellent|😊|😄|❤️)' THEN 1
            WHEN message_text ~ '(hate|terrible|awful|bad|worst|😠|😡|👎)' THEN -1
            ELSE 0
          END
        ) STORED
      );
    `);

    // Create participants table
    await conn.query(`
      CREATE TABLE participants (
        participant_name VARCHAR PRIMARY KEY,
        message_count INTEGER,
        first_message_date TIMESTAMP,
        last_message_date TIMESTAMP
      );
    `);

    // Create materialized view for emoji analysis
    await conn.query(`
      CREATE MATERIALIZED VIEW emoji_stats AS
      WITH RECURSIVE
      emoji_ranges AS (
        -- Unicode ranges for emojis
        SELECT
          x'1F300'::INTEGER as start_range,
          x'1F9FF'::INTEGER as end_range
      ),
      message_emojis AS (
        SELECT
          id,
          author,
          message_text,
          REGEXP_EXTRACT_ALL(message_text, '[\u{1F300}-\u{1F9FF}]') as emojis
        FROM messages
        WHERE message_text ~ '[\u{1F300}-\u{1F9FF}]'
      )
      SELECT
        emoji,
        COUNT(*) as usage_count,
        COUNT(DISTINCT author) as unique_users
      FROM message_emojis
      CROSS JOIN UNNEST(emojis) as t(emoji)
      GROUP BY emoji
      ORDER BY usage_count DESC;
    `);

    // Create view for URL analysis
    await conn.query(`
      CREATE VIEW url_analysis AS
      SELECT
        id,
        author,
        message_date,
        REGEXP_MATCHES(message_text, 'https?://[^\s]+', 'g') as urls
      FROM messages
      WHERE is_url = true;
    `);

    // Create view for conversation gaps
    await conn.query(`
      CREATE VIEW conversation_gaps AS
      WITH message_gaps AS (
        SELECT
          message_date as gap_start,
          LEAD(message_date) OVER (ORDER BY message_date) as gap_end,
          EXTRACT(EPOCH FROM (
            LEAD(message_date) OVER (ORDER BY message_date) - message_date
          )) as gap_duration_seconds
        FROM messages
      )
      SELECT
        gap_start,
        gap_end,
        gap_duration_seconds,
        gap_duration_seconds / 3600 as gap_duration_hours
      FROM message_gaps
      WHERE gap_duration_seconds > 86400  -- Gaps longer than 24 hours
      ORDER BY gap_duration_seconds DESC;
    `);

    // Create view for conversation initiations
    await conn.query(`
      CREATE VIEW conversation_initiations AS
      WITH message_gaps AS (
        SELECT
          message_date,
          author,
          LAG(message_date) OVER (ORDER BY message_date) as prev_message_date,
          LAG(author) OVER (ORDER BY message_date) as prev_author
        FROM messages
      )
      SELECT
        message_date,
        author,
        EXTRACT(EPOCH FROM (message_date - prev_message_date)) as gap_seconds
      FROM message_gaps
      WHERE gap_seconds > 3600;  -- New conversation after 1 hour gap
    `);

    // Create view for message chains
    await conn.query(`
      CREATE VIEW message_chains AS
      WITH consecutive_messages AS (
        SELECT
          id,
          author,
          message_date,
          LAG(author) OVER (ORDER BY message_date) as prev_author,
          LEAD(author) OVER (ORDER BY message_date) as next_author
        FROM messages
      )
      SELECT
        author,
        COUNT(*) as chain_length
      FROM consecutive_messages
      WHERE author = prev_author
        AND (next_author IS NULL OR author != next_author)
      GROUP BY author;
    `);

    // Create view for vocabulary analysis
    await conn.query(`
      CREATE VIEW vocabulary_analysis AS
      WITH word_extraction AS (
        SELECT
          author,
          REGEXP_SPLIT_TO_TABLE(
            LOWER(REGEXP_REPLACE(message_text, '[^a-zA-Z\\s]', ' ', 'g')),
            '\\s+'
          ) as word
        FROM messages
        WHERE LENGTH(TRIM(message_text)) > 0
      )
      SELECT
        author,
        word,
        COUNT(*) as usage_count
      FROM word_extraction
      WHERE LENGTH(word) > 2
      GROUP BY author, word;
    `);

    // Create view for conversation topic analysis
    await conn.query(`
      CREATE VIEW topic_analysis AS
      WITH topic_keywords AS (
        SELECT 'work' as topic, 'work|meeting|project|deadline|client|office' as keywords UNION ALL
        SELECT 'social', 'party|dinner|lunch|meet up|hangout|drinks' UNION ALL
        SELECT 'tech', 'phone|computer|app|software|website|tech' UNION ALL
        SELECT 'entertainment', 'movie|show|music|game|play|watch' UNION ALL
        SELECT 'food', 'eat|food|restaurant|cook|recipe|hungry' UNION ALL
        SELECT 'travel', 'trip|travel|vacation|flight|hotel|visit' UNION ALL
        SELECT 'family', 'family|mom|dad|sister|brother|parent' UNION ALL
        SELECT 'shopping', 'buy|shop|store|purchase|order|amazon'
      )
      SELECT
        m.id,
        m.author,
        m.message_date,
        tk.topic
      FROM messages m
      CROSS JOIN topic_keywords tk
      WHERE LOWER(m.message_text) ~ tk.keywords;
    `);

    // Create view for psychological patterns
    await conn.query(`
      CREATE VIEW psychological_patterns AS
      SELECT
        author,
        DATE_TRUNC('day', message_date) as day,
        COUNT(*) as total_messages,
        SUM(CASE WHEN is_greeting THEN 1 ELSE 0 END) as greetings,
        SUM(CASE WHEN is_farewell THEN 1 ELSE 0 END) as farewells,
        SUM(CASE WHEN has_appreciation THEN 1 ELSE 0 END) as appreciations,
        SUM(CASE WHEN has_apology THEN 1 ELSE 0 END) as apologies,
        SUM(CASE WHEN has_agreement THEN 1 ELSE 0 END) as agreements,
        SUM(CASE WHEN has_disagreement THEN 1 ELSE 0 END) as disagreements,
        AVG(sentiment_score) as avg_sentiment
      FROM messages
      GROUP BY author, DATE_TRUNC('day', message_date);
    `);

    // Create view for group dynamics
    await conn.query(`
      CREATE VIEW group_dynamics AS
      WITH message_pairs AS (
        SELECT
          m1.author as initiator,
          m2.author as responder,
          m1.message_date,
          m1.is_question,
          m2.message_date as response_date,
          m1.sentiment_score as initiator_sentiment,
          m2.sentiment_score as responder_sentiment
        FROM messages m1
        JOIN messages m2
        ON m2.id > m1.id
        AND m2.message_date > m1.message_date
        AND m2.message_date <= m1.message_date + INTERVAL '30 minutes'
        AND m1.author != m2.author
      )
      SELECT
        initiator,
        responder,
        COUNT(*) as interactions,
        AVG(EXTRACT(EPOCH FROM (response_date - message_date))) as avg_response_time,
        CORR(initiator_sentiment, responder_sentiment) as sentiment_correlation
      FROM message_pairs
      GROUP BY initiator, responder;
    `);

    return true;
  },

  async insertData(messages, participants) {
    const db = await initDuckDB();
    const conn = await db.connect();

    // Batch insert messages for better performance
    const messageChunks = [];
    const chunkSize = 1000;

    for (let i = 0; i < messages.length; i += chunkSize) {
      messageChunks.push(messages.slice(i, i + chunkSize));
    }

    for (const chunk of messageChunks) {
      const values = chunk.map(msg =>
        `(${msg.id}, '${msg.author.replace(/'/g, "''")}', '${msg.message.replace(/'/g, "''")}',
          '${msg.date.toISOString()}', ${msg.hasMedia},
          ${msg.mediaType ? `'${msg.mediaType}'` : 'NULL'},
          ${msg.location ? `'${JSON.stringify(msg.location)}'` : 'NULL'})`
      ).join(',');

      await conn.query(`
        INSERT INTO messages (id, author, message_text, message_date, has_media, media_type, location_data)
        VALUES ${values};
      `);
    }

    // Insert participants
    const participantValues = Object.entries(participants)
      .map(([name, data]) =>
        `('${name.replace(/'/g, "''")}', ${data.messageCount},
          '${data.firstMessage.toISOString()}', '${data.lastMessage.toISOString()}')`
      ).join(',');

    await conn.query(`
      INSERT INTO participants (participant_name, message_count, first_message_date, last_message_date)
      VALUES ${participantValues};
    `);

    return true;
  },

  // Basic Analysis Functions
  async getMessageCountByParticipant() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      SELECT
        participant_name,
        message_count,
        first_message_date,
        last_message_date,
        ROUND(message_count * 100.0 / SUM(message_count) OVER (), 2) as percentage
      FROM participants
      ORDER BY message_count DESC;
    `);
  },

  async getMessageFrequencyByHour() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      SELECT
        EXTRACT(HOUR FROM message_date) as hour,
        COUNT(*) as message_count,
        COUNT(DISTINCT author) as unique_participants,
        ROUND(AVG(word_count), 2) as avg_words_per_message
      FROM messages
      GROUP BY hour
      ORDER BY hour;
    `);
  },

  async getMessageFrequencyByDayOfWeek() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      SELECT
        EXTRACT(DOW FROM message_date) as day_of_week,
        COUNT(*) as message_count,
        COUNT(DISTINCT author) as unique_participants,
        ROUND(AVG(word_count), 2) as avg_words_per_message
      FROM messages
      GROUP BY day_of_week
      ORDER BY day_of_week;
    `);
  },

  // Advanced Analysis Functions
  async getChatSummary() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH chat_stats AS (
        SELECT
          COUNT(*) as total_messages,
          COUNT(DISTINCT author) as unique_participants,
          MIN(message_date) as first_message,
          MAX(message_date) as last_message,
          SUM(word_count) as total_words,
          ROUND(AVG(word_count), 2) as avg_words_per_message,
          COUNT(CASE WHEN has_media THEN 1 END) as media_count,
          MAX(word_count) as longest_message_words
        FROM messages
      )
      SELECT
        *,
        ROUND(total_words::FLOAT / total_messages, 2) as words_per_message,
        ROUND(media_count * 100.0 / total_messages, 2) as media_percentage
      FROM chat_stats;
    `);
  },

  async getTopEmojis(limit = 10) {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      SELECT *
      FROM emoji_stats
      LIMIT ${limit};
    `);
  },

  async getActivityTrends() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH daily_stats AS (
        SELECT
          DATE_TRUNC('day', message_date) as day,
          COUNT(*) as message_count,
          COUNT(DISTINCT author) as active_participants,
          SUM(word_count) as total_words,
          COUNT(CASE WHEN has_media THEN 1 END) as media_count
        FROM messages
        GROUP BY day
        ORDER BY day
      )
      SELECT
        day,
        message_count,
        active_participants,
        total_words,
        media_count,
        ROUND(AVG(message_count) OVER (
          ORDER BY day
          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ), 2) as weekly_moving_avg,
        ROUND(AVG(message_count) OVER (
          ORDER BY day
          ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ), 2) as monthly_moving_avg
      FROM daily_stats;
    `);
  },

  async getParticipantInteractions() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH message_pairs AS (
        SELECT
          m1.author as author1,
          m2.author as author2,
          m1.message_date as msg1_date,
          m2.message_date as msg2_date,
          ABS(EXTRACT(EPOCH FROM (m2.message_date - m1.message_date))) as response_time
        FROM messages m1
        JOIN messages m2
        ON m2.id > m1.id
        AND m2.message_date > m1.message_date
        AND m2.message_date <= m1.message_date + INTERVAL '1 hour'
        AND m1.author != m2.author
      )
      SELECT
        author1,
        author2,
        COUNT(*) as interaction_count,
        ROUND(AVG(response_time), 2) as avg_response_time_seconds,
        MIN(response_time) as fastest_response_seconds,
        MAX(response_time) as slowest_response_seconds
      FROM message_pairs
      GROUP BY author1, author2
      HAVING COUNT(*) > 10
      ORDER BY interaction_count DESC;
    `);
  },

  // New Advanced Analysis Methods
  async getMessageComplexityAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH author_stats AS (
        SELECT
          author,
          COUNT(*) as message_count,
          AVG(word_count) as avg_words,
          AVG(caps_percentage) as avg_caps_percentage,
          COUNT(CASE WHEN is_question THEN 1 END) as questions_asked,
          COUNT(CASE WHEN is_url THEN 1 END) as links_shared
        FROM messages
        GROUP BY author
      )
      SELECT
        author,
        message_count,
        ROUND(avg_words, 2) as avg_words_per_message,
        ROUND(avg_caps_percentage, 2) as avg_caps_percentage,
        questions_asked,
        links_shared,
        ROUND(questions_asked * 100.0 / message_count, 2) as question_percentage,
        ROUND(links_shared * 100.0 / message_count, 2) as link_share_percentage
      FROM author_stats
      ORDER BY message_count DESC;
    `);
  },

  async getConversationRhythm() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH time_analysis AS (
        SELECT
          author,
          hour_of_day,
          day_of_week,
          COUNT(*) as message_count,
          AVG(word_count) as avg_words
        FROM messages
        GROUP BY author, hour_of_day, day_of_week
      )
      SELECT
        author,
        hour_of_day,
        day_of_week,
        message_count,
        ROUND(avg_words, 2) as avg_words,
        ROUND(message_count * 100.0 / SUM(message_count) OVER (PARTITION BY author), 2) as time_preference_percentage
      FROM time_analysis
      ORDER BY author, message_count DESC;
    `);
  },

  async getConversationGapAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      SELECT
        DATE_TRUNC('day', gap_start) as gap_start_day,
        ROUND(gap_duration_hours, 2) as gap_duration_hours,
        CASE
          WHEN gap_duration_hours <= 24 THEN 'Short Break'
          WHEN gap_duration_hours <= 72 THEN 'Medium Break'
          WHEN gap_duration_hours <= 168 THEN 'Long Break'
          ELSE 'Extended Break'
        END as gap_category
      FROM conversation_gaps
      ORDER BY gap_duration_hours DESC
      LIMIT 10;
    `);
  },

  async getResponsePatternAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH response_patterns AS (
        SELECT
          m1.author as initiator,
          m2.author as responder,
          m1.message_date as initial_message_time,
          m2.message_date as response_time,
          EXTRACT(EPOCH FROM (m2.message_date - m1.message_date)) as response_seconds,
          m1.is_question as was_question,
          m2.word_count as response_length
        FROM messages m1
        JOIN messages m2
        ON m2.id > m1.id
        AND m2.message_date > m1.message_date
        AND m2.message_date <= m1.message_date + INTERVAL '30 minutes'
        AND m1.author != m2.author
      )
      SELECT
        initiator,
        responder,
        COUNT(*) as interaction_count,
        ROUND(AVG(response_seconds), 2) as avg_response_time_seconds,
        ROUND(AVG(CASE WHEN was_question THEN response_seconds END), 2) as avg_question_response_time,
        ROUND(AVG(response_length), 2) as avg_response_length,
        COUNT(CASE WHEN was_question THEN 1 END) as questions_responded_to
      FROM response_patterns
      GROUP BY initiator, responder
      HAVING COUNT(*) > 5
      ORDER BY interaction_count DESC;
    `);
  },

  async getUrlAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH url_stats AS (
        SELECT
          author,
          COUNT(DISTINCT urls) as unique_urls_shared,
          COUNT(*) as total_url_messages,
          MIN(message_date) as first_url_share,
          MAX(message_date) as last_url_share
        FROM url_analysis
        GROUP BY author
      )
      SELECT
        author,
        unique_urls_shared,
        total_url_messages,
        first_url_share,
        last_url_share,
        ROUND(total_url_messages * 100.0 / (
          SELECT COUNT(*) FROM messages WHERE author = url_stats.author
        ), 2) as url_message_percentage
      FROM url_stats
      ORDER BY unique_urls_shared DESC;
    `);
  },

  async getMessageSentimentIndicators() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH sentiment_indicators AS (
        SELECT
          author,
          COUNT(CASE WHEN message_text LIKE '%!%' THEN 1 END) as exclamation_count,
          COUNT(CASE WHEN message_text LIKE '%?%' THEN 1 END) as question_count,
          COUNT(CASE WHEN caps_percentage > 50 THEN 1 END) as shouting_count,
          COUNT(CASE WHEN message_text ~ '(?:ha|he|lol|lmao|rofl|😂|🤣)' THEN 1 END) as laughter_count,
          COUNT(*) as total_messages
        FROM messages
        GROUP BY author
      )
      SELECT
        author,
        exclamation_count,
        question_count,
        shouting_count,
        laughter_count,
        ROUND(exclamation_count * 100.0 / total_messages, 2) as exclamation_percentage,
        ROUND(question_count * 100.0 / total_messages, 2) as question_percentage,
        ROUND(shouting_count * 100.0 / total_messages, 2) as shouting_percentage,
        ROUND(laughter_count * 100.0 / total_messages, 2) as laughter_percentage
      FROM sentiment_indicators
      ORDER BY total_messages DESC;
    `);
  },

  async getVocabularyAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH vocab_stats AS (
        SELECT
          author,
          COUNT(DISTINCT word) as unique_words,
          COUNT(*) as total_words,
          STRING_AGG(DISTINCT word, ', ' ORDER BY word)
            FILTER (WHERE usage_count > 10) as frequent_words
        FROM vocabulary_analysis
        GROUP BY author
      )
      SELECT
        author,
        unique_words,
        total_words,
        ROUND(unique_words * 100.0 / total_words, 2) as vocabulary_diversity_percentage,
        frequent_words
      FROM vocab_stats
      ORDER BY unique_words DESC;
    `);
  },

  async getMessageChainAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      SELECT
        author,
        MAX(chain_length) as longest_chain,
        ROUND(AVG(chain_length), 2) as avg_chain_length,
        COUNT(*) as total_chains
      FROM message_chains
      GROUP BY author
      ORDER BY longest_chain DESC;
    `);
  },

  async getTimeBasedBehavior() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH time_patterns AS (
        SELECT
          author,
          hour_category,
          weekday,
          COUNT(*) as message_count,
          AVG(word_count) as avg_words,
          COUNT(CASE WHEN has_media THEN 1 END) as media_count,
          COUNT(CASE WHEN has_voice_message THEN 1 END) as voice_messages
        FROM messages
        GROUP BY author, hour_category, weekday
      )
      SELECT
        author,
        hour_category,
        weekday,
        message_count,
        ROUND(avg_words, 2) as avg_words,
        media_count,
        voice_messages,
        ROUND(message_count * 100.0 / SUM(message_count) OVER (PARTITION BY author), 2)
          as time_distribution_percentage
      FROM time_patterns
      ORDER BY author, message_count DESC;
    `);
  },

  async getConversationInitiationPatterns() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH initiator_stats AS (
        SELECT
          author,
          COUNT(*) as initiations,
          AVG(gap_seconds) as avg_gap_before_initiation,
          COUNT(CASE WHEN EXTRACT(DOW FROM message_date) IN (0, 6) THEN 1 END) as weekend_initiations,
          COUNT(CASE WHEN EXTRACT(HOUR FROM message_date) BETWEEN 22 AND 5 THEN 1 END) as late_night_initiations
        FROM conversation_initiations
        GROUP BY author
      )
      SELECT
        author,
        initiations,
        ROUND(avg_gap_before_initiation / 3600, 2) as avg_hours_before_initiation,
        weekend_initiations,
        late_night_initiations,
        ROUND(weekend_initiations * 100.0 / initiations, 2) as weekend_initiation_percentage,
        ROUND(late_night_initiations * 100.0 / initiations, 2) as late_night_initiation_percentage
      FROM initiator_stats
      ORDER BY initiations DESC;
    `);
  },

  async getSeasonalPatterns() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH seasonal_stats AS (
        SELECT
          author,
          year,
          month,
          COUNT(*) as message_count,
          AVG(word_count) as avg_words,
          COUNT(CASE WHEN has_media THEN 1 END) as media_count,
          COUNT(CASE WHEN is_question THEN 1 END) as questions_asked
        FROM messages
        GROUP BY author, year, month
      )
      SELECT
        author,
        year,
        month,
        message_count,
        ROUND(avg_words, 2) as avg_words,
        media_count,
        questions_asked,
        ROUND(message_count * 100.0 / SUM(message_count) OVER (
          PARTITION BY author, year
        ), 2) as monthly_percentage
      FROM seasonal_stats
      ORDER BY author, year, month;
    `);
  },

  async getMessageStyleEvolution() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH style_evolution AS (
        SELECT
          author,
          year,
          month,
          ROUND(AVG(word_count), 2) as avg_words,
          ROUND(AVG(words_per_sentence), 2) as avg_words_per_sentence,
          ROUND(AVG(caps_percentage), 2) as avg_caps_percentage,
          COUNT(CASE WHEN has_quote THEN 1 END) as quotes_used,
          COUNT(CASE WHEN has_voice_message THEN 1 END) as voice_messages,
          COUNT(CASE WHEN has_media THEN 1 END) as media_shared
        FROM messages
        GROUP BY author, year, month
      )
      SELECT
        author,
        year,
        month,
        avg_words,
        avg_words_per_sentence,
        avg_caps_percentage,
        quotes_used,
        voice_messages,
        media_shared,
        ROUND(
          (avg_words - LAG(avg_words) OVER (PARTITION BY author ORDER BY year, month)) * 100.0 /
          NULLIF(LAG(avg_words) OVER (PARTITION BY author ORDER BY year, month), 0),
          2
        ) as words_growth_percentage
      FROM style_evolution
      ORDER BY author, year, month;
    `);
  },

  async getTopicAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH topic_stats AS (
        SELECT
          author,
          topic,
          COUNT(*) as mentions,
          MIN(message_date) as first_mention,
          MAX(message_date) as last_mention
        FROM topic_analysis
        GROUP BY author, topic
      )
      SELECT
        author,
        topic,
        mentions,
        first_mention,
        last_mention,
        ROUND(mentions * 100.0 / SUM(mentions) OVER (PARTITION BY author), 2) as topic_percentage
      FROM topic_stats
      ORDER BY author, mentions DESC;
    `);
  },

  async getPsychologicalProfile() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH profile_stats AS (
        SELECT
          author,
          COUNT(*) as total_messages,
          SUM(CASE WHEN is_greeting THEN 1 END) as greetings,
          SUM(CASE WHEN is_farewell THEN 1 END) as farewells,
          SUM(CASE WHEN has_appreciation THEN 1 END) as appreciations,
          SUM(CASE WHEN has_apology THEN 1 END) as apologies,
          SUM(CASE WHEN has_agreement THEN 1 END) as agreements,
          SUM(CASE WHEN has_disagreement THEN 1 END) as disagreements,
          AVG(sentiment_score) as avg_sentiment,
          STDDEV(sentiment_score) as sentiment_volatility
        FROM messages
        GROUP BY author
      )
      SELECT
        author,
        total_messages,
        ROUND(greetings * 100.0 / total_messages, 2) as greeting_rate,
        ROUND(farewells * 100.0 / total_messages, 2) as farewell_rate,
        ROUND(appreciations * 100.0 / total_messages, 2) as appreciation_rate,
        ROUND(apologies * 100.0 / total_messages, 2) as apology_rate,
        ROUND(agreements * 100.0 / total_messages, 2) as agreement_rate,
        ROUND(disagreements * 100.0 / total_messages, 2) as disagreement_rate,
        ROUND(avg_sentiment, 2) as average_sentiment,
        ROUND(sentiment_volatility, 2) as sentiment_volatility,
        CASE
          WHEN avg_sentiment > 0.3 THEN 'Predominantly Positive'
          WHEN avg_sentiment < -0.3 THEN 'Predominantly Negative'
          ELSE 'Neutral'
        END as sentiment_tendency,
        CASE
          WHEN agreement_rate > disagreement_rate * 2 THEN 'Agreeable'
          WHEN disagreement_rate > agreement_rate * 2 THEN 'Contrarian'
          ELSE 'Balanced'
        END as agreement_tendency
      FROM profile_stats
      ORDER BY total_messages DESC;
    `);
  },

  async getGroupDynamicsAnalysis() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH interaction_patterns AS (
        SELECT
          initiator,
          responder,
          interactions,
          avg_response_time,
          sentiment_correlation,
          RANK() OVER (PARTITION BY initiator ORDER BY interactions DESC) as preferred_responder_rank
        FROM group_dynamics
      )
      SELECT
        initiator,
        responder,
        interactions,
        ROUND(avg_response_time, 2) as avg_response_seconds,
        ROUND(sentiment_correlation, 2) as sentiment_correlation,
        CASE
          WHEN preferred_responder_rank = 1 THEN 'Primary Contact'
          WHEN preferred_responder_rank = 2 THEN 'Secondary Contact'
          ELSE 'Occasional Contact'
        END as relationship_type,
        CASE
          WHEN sentiment_correlation > 0.5 THEN 'Strong Positive'
          WHEN sentiment_correlation > 0 THEN 'Mild Positive'
          WHEN sentiment_correlation < -0.5 THEN 'Strong Negative'
          WHEN sentiment_correlation < 0 THEN 'Mild Negative'
          ELSE 'Neutral'
        END as emotional_synchronization
      FROM interaction_patterns
      ORDER BY initiator, interactions DESC;
    `);
  },

  async getCommunicationPatternEvolution() {
    const db = await initDuckDB();
    const conn = await db.connect();
    return await conn.query(`
      WITH monthly_patterns AS (
        SELECT
          author,
          DATE_TRUNC('month', message_date) as month,
          COUNT(*) as message_count,
          AVG(sentiment_score) as avg_sentiment,
          COUNT(CASE WHEN has_emoji THEN 1 END) * 100.0 / COUNT(*) as emoji_rate,
          COUNT(CASE WHEN has_appreciation OR has_apology THEN 1 END) * 100.0 / COUNT(*) as politeness_rate,
          AVG(word_count) as avg_words,
          COUNT(CASE WHEN has_media OR has_url THEN 1 END) * 100.0 / COUNT(*) as media_share_rate
        FROM messages
        GROUP BY author, DATE_TRUNC('month', message_date)
      )
      SELECT
        author,
        month,
        message_count,
        ROUND(avg_sentiment, 2) as avg_sentiment,
        ROUND(emoji_rate, 2) as emoji_percentage,
        ROUND(politeness_rate, 2) as politeness_percentage,
        ROUND(avg_words, 2) as avg_words_per_message,
        ROUND(media_share_rate, 2) as media_share_percentage,
        ROUND(
          (avg_words - LAG(avg_words) OVER (PARTITION BY author ORDER BY month)) * 100.0 /
          NULLIF(LAG(avg_words) OVER (PARTITION BY author ORDER BY month), 0),
          2
        ) as verbosity_change_percentage
      FROM monthly_patterns
      ORDER BY author, month;
    `);
  }
};

expose(duckDBOps);
