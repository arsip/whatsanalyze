import React, { useState, useEffect } from 'react';
import {
  initializeDatabase,
  runAnalysis
} from '../utils/duckdb-analyzer';
import type { AnalysisResult } from '../../types/duckdb';

interface Props {
  messages: any[];
  participants: any[];
}

const AnalysisDisplay: React.FC<Props> = ({ messages, participants }) => {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<string>('chatSummary');
  const [results, setResults] = useState<AnalysisResult | null>(null);

  const analysisTypes = [
    { id: 'chatSummary', label: 'Chat Summary' },
    { id: 'messageCount', label: 'Message Count by Participant' },
    { id: 'hourlyActivity', label: 'Hourly Activity' },
    { id: 'topicAnalysis', label: 'Topic Analysis' },
    { id: 'psychologicalProfile', label: 'Psychological Profile' },
    { id: 'groupDynamics', label: 'Group Dynamics' },
    { id: 'communicationEvolution', label: 'Communication Evolution' },
    { id: 'topEmojis', label: 'Top Emojis' }
  ];

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        await initializeDatabase(messages, participants);
        setInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize database');
      } finally {
        setLoading(false);
      }
    };

    if (!initialized && messages.length > 0 && participants.length > 0) {
      init();
    }
  }, [messages, participants, initialized]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!initialized) return;

      try {
        setLoading(true);
        setError(null);
        const analysisResults = await runAnalysis(activeAnalysis);
        setResults(analysisResults as AnalysisResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run analysis');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [activeAnalysis, initialized]);

  if (!initialized) {
    return (
      <div className="p-4">
        <p className="text-gray-600">
          {loading ? 'Initializing database...' : 'Waiting for data...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <select
          className="w-full p-2 border rounded"
          value={activeAnalysis}
          onChange={(e) => setActiveAnalysis(e.target.value)}
        >
          {analysisTypes.map(type => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <p>Loading analysis results...</p>
        </div>
      ) : results ? (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead>
              <tr>
                {results.headers.map((header, index) => (
                  <th key={index} className="p-2 border bg-gray-100 text-left">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="p-2 border">
                      {typeof cell === 'number' ?
                        Number.isInteger(cell) ? cell : cell.toFixed(2)
                        : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-gray-600">
            Total results: {results.total}
          </p>
        </div>
      ) : (
        <p>No results available</p>
      )}
    </div>
  );
};

export default AnalysisDisplay;
