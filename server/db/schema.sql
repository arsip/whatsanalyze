-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  chat_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  first_message_date TIMESTAMP,
  last_message_date TIMESTAMP
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id),
  author VARCHAR(255),
  message_text TEXT,
  message_date TIMESTAMP,
  has_media BOOLEAN DEFAULT FALSE,
  media_type VARCHAR(50),
  location_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create participants table
CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id),
  participant_name VARCHAR(255),
  message_count INTEGER DEFAULT 0,
  first_message_date TIMESTAMP,
  last_message_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id, participant_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(message_date);
CREATE INDEX IF NOT EXISTS idx_participants_conversation ON participants(conversation_id);
