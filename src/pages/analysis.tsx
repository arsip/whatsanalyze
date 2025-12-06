import React, { useState, useEffect } from 'react';
import AnalysisDisplay from '../components/AnalysisDisplay';
import { useRouter } from 'next/router';

interface Message {
  id: number;
  author: string;
  message: string;
  date: Date;
  hasMedia: boolean;
  mediaType?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface Participant {
  name: string;
  messageCount: number;
  firstMessage: Date;
  lastMessage: Date;
}

const AnalysisPage: React.FC = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In a real application, you would load the messages and participants from your data source
    // For now, we'll use sample data
    const sampleData = {
      messages: [
        {
          id: 1,
          author: "Alice",
          message: "Hey everyone! 👋",
          date: new Date("2024-01-01T10:00:00"),
          hasMedia: false
        },
        {
          id: 2,
          author: "Bob",
          message: "Hi Alice! How are you?",
          date: new Date("2024-01-01T10:01:00"),
          hasMedia: false
        },
        // Add more sample messages as needed
      ],
      participants: [
        {
          name: "Alice",
          messageCount: 1,
          firstMessage: new Date("2024-01-01T10:00:00"),
          lastMessage: new Date("2024-01-01T10:00:00")
        },
        {
          name: "Bob",
          messageCount: 1,
          firstMessage: new Date("2024-01-01T10:01:00"),
          lastMessage: new Date("2024-01-01T10:01:00")
        }
      ]
    };

    setMessages(sampleData.messages);
    setParticipants(sampleData.participants);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-gray-600">Loading chat data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-red-600">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Chat Analysis</h1>
        <div className="bg-white rounded-lg shadow">
          <AnalysisDisplay messages={messages} participants={participants} />
        </div>
      </div>
    </div>
  );
};

export default AnalysisPage;
