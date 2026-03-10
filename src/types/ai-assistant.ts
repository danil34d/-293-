// AI Assistant Types

// Chat types
export interface Chat {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  is_archived: number; // SQLite stores booleans as 0/1
  user_id: string;
  message_count?: number; // Count of messages in this chat
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  metadata?: string; // JSON string
}

// Background Analysis types
export type AnalysisType = 'employee_performance' | 'anomaly_detection' | 'daily_summary';
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BackgroundAnalysis {
  id: string;
  type: AnalysisType;
  status: AnalysisStatus;
  created_at: number;
  completed_at?: number;
  result_data?: string; // JSON string
  error_message?: string;
  is_notified: number; // 0/1
  priority: number; // 0=normal, 1=high
}

// Report types
export type ReportType = 'pdf' | 'docx';

export interface GeneratedReport {
  id: string;
  chat_id?: string;
  report_type: ReportType;
  title: string;
  file_path: string;
  file_size?: number;
  created_at: number;
  parameters?: string; // JSON string
}

// Settings type
export interface Setting {
  key: string;
  value: string; // JSON string
  updated_at: number;
}

// MCP Tool types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (params: any) => Promise<any>;
}

export interface MCPToolResult {
  toolName: string;
  result: any;
  error?: string;
}

// GLM API types
export interface GLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface GLMChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: GLMToolCall[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export interface GLMResponse {
  id: string;
  created: number;
  model: string;
  choices: GLMChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GLMChatParams {
  messages: GLMMessage[];
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: GLMToolDefinition[];
  tool_choice?: 'auto' | 'none';
}

export interface GLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON Schema
  };
}

// Business metrics types (for MCP tools)
export interface BusinessMetrics {
  revenue: number;
  expenses: number;
  profit: number;
  washCount: number;
  averageCheck: number;
  topEmployee?: {
    id: string;
    name: string;
    washCount: number;
  };
  revenueBySource: Record<string, number>;
}

export interface PeriodComparison {
  period1Metrics: BusinessMetrics;
  period2Metrics: BusinessMetrics;
  comparison: {
    revenueChange: number; // %
    profitChange: number; // %
    washCountChange: number; // absolute
    insights: string[];
  };
}

export interface Anomaly {
  type: 'performance_drop' | 'unusual_pattern' | 'suspicious_activity';
  severity: 'low' | 'medium' | 'high';
  employeeId: string;
  employeeName: string;
  description: string;
  data: any;
}
