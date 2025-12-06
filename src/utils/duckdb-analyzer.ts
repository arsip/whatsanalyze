import { wrap } from 'comlink';
import type { DuckDBOperations } from '../../types/duckdb';

// Worker instance for DuckDB operations
let duckDBWorker: Worker | null = null;
let duckDBOps: DuckDBOperations | null = null;

// Initialize DuckDB worker and operations
export const initDuckDBAnalyzer = async () => {
  if (!duckDBWorker) {
    duckDBWorker = new Worker(new URL('/wasm/duckdb.worker.js', window.location.origin), {
      type: 'module',
    });
    duckDBOps = wrap<DuckDBOperations>(duckDBWorker);
  }
  return duckDBOps;
};

// Helper function to format analysis results for display
export const formatAnalysisResults = (results: any) => {
  if (!results || !results.length) {
    return 'No results available';
  }

  // Convert to table format for better display
  const headers = Object.keys(results[0]);
  const rows = results.map((row: any) => Object.values(row));

  return {
    headers,
    rows,
    total: results.length
  };
};

// Analysis functions
export const runAnalysis = async (analysisType: string) => {
  try {
    const ops = await initDuckDBAnalyzer();
    if (!ops) throw new Error('DuckDB operations not initialized');

    let results;
    switch (analysisType) {
      case 'messageCount':
        results = await ops.getMessageCountByParticipant();
        break;
      case 'hourlyActivity':
        results = await ops.getMessageFrequencyByHour();
        break;
      case 'topicAnalysis':
        results = await ops.getTopicAnalysis();
        break;
      case 'psychologicalProfile':
        results = await ops.getPsychologicalProfile();
        break;
      case 'groupDynamics':
        results = await ops.getGroupDynamicsAnalysis();
        break;
      case 'communicationEvolution':
        results = await ops.getCommunicationPatternEvolution();
        break;
      case 'chatSummary':
        results = await ops.getChatSummary();
        break;
      case 'topEmojis':
        results = await ops.getTopEmojis(10);
        break;
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    return formatAnalysisResults(results);
  } catch (error) {
    console.error('Error running analysis:', error);
    throw error;
  }
};

// Initialize tables and load data
export const initializeDatabase = async (messages: any[], participants: any[]) => {
  try {
    const ops = await initDuckDBAnalyzer();
    if (!ops) throw new Error('DuckDB operations not initialized');

    // Create tables
    await ops.createTables();

    // Insert data
    await ops.insertData(messages, participants);

    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};
