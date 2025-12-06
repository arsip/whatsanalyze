export interface DuckDBOperations {
  createTables: () => Promise<boolean>;
  insertData: (messages: any[], participants: any[]) => Promise<boolean>;
  getMessageCountByParticipant: () => Promise<any[]>;
  getMessageFrequencyByHour: () => Promise<any[]>;
  getMessageFrequencyByDayOfWeek: () => Promise<any[]>;
  getChatSummary: () => Promise<any[]>;
  getTopEmojis: (limit?: number) => Promise<any[]>;
  getActivityTrends: () => Promise<any[]>;
  getParticipantInteractions: () => Promise<any[]>;
  getMessageComplexityAnalysis: () => Promise<any[]>;
  getConversationRhythm: () => Promise<any[]>;
  getConversationGapAnalysis: () => Promise<any[]>;
  getResponsePatternAnalysis: () => Promise<any[]>;
  getUrlAnalysis: () => Promise<any[]>;
  getMessageSentimentIndicators: () => Promise<any[]>;
  getVocabularyAnalysis: () => Promise<any[]>;
  getMessageChainAnalysis: () => Promise<any[]>;
  getTimeBasedBehavior: () => Promise<any[]>;
  getConversationInitiationPatterns: () => Promise<any[]>;
  getSeasonalPatterns: () => Promise<any[]>;
  getMessageStyleEvolution: () => Promise<any[]>;
  getTopicAnalysis: () => Promise<any[]>;
  getPsychologicalProfile: () => Promise<any[]>;
  getGroupDynamicsAnalysis: () => Promise<any[]>;
  getCommunicationPatternEvolution: () => Promise<any[]>;
}

export interface AnalysisResult {
  headers: string[];
  rows: any[][];
  total: number;
}
