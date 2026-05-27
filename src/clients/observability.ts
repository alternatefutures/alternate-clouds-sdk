import { Client } from '@alternatefutures/utils-genql-client';

type ObservabilityClientOptions = {
  graphqlClient: Client;
};

// ============================================
// Types
// ============================================

export interface Span {
  timestamp: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceState: string | null;
  spanName: string;
  spanKind: string;
  serviceName: string;
  resourceAttributes: Record<string, string>;
  scopeName: string | null;
  scopeVersion: string | null;
  spanAttributes: Record<string, string>;
  durationNs: string;
  durationMs: number;
  statusCode: string;
  statusMessage: string | null;
  events: SpanEvent[];
  links: SpanLink[];
}

export interface SpanEvent {
  timestamp: string;
  name: string;
  attributes: Record<string, string>;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  traceState: string | null;
  attributes: Record<string, string>;
}

export interface Trace {
  traceId: string;
  rootSpan: Span | null;
  spans: Span[];
  serviceName: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  spanCount: number;
  hasError: boolean;
}

export interface MetricDataPoint {
  timestamp: string;
  metricName: string;
  metricDescription: string | null;
  metricUnit: string | null;
  metricType: string;
  value: number | null;
  histogramCount: number | null;
  histogramSum: number | null;
  histogramBuckets: number[] | null;
  histogramBucketCounts: number[] | null;
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
}

export interface MetricSeries {
  metricName: string;
  metricUnit: string | null;
  metricType: string;
  dataPoints: MetricDataPoint[];
}

export interface LogEntry {
  timestamp: string;
  traceId: string | null;
  spanId: string | null;
  severityText: string;
  severityNumber: number;
  body: string;
  resourceAttributes: Record<string, string>;
  logAttributes: Record<string, string>;
}

export interface ServiceStats {
  serviceName: string;
  spanCount: number;
  traceCount: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

export interface ObservabilitySettings {
  id: string;
  projectId: string;
  tracesEnabled: boolean;
  metricsEnabled: boolean;
  logsEnabled: boolean;
  traceRetention: number;
  metricRetention: number;
  logRetention: number;
  sampleRate: number;
  maxBytesPerHour: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryUsageSummary {
  projectId: string;
  bytesIngested: string;
  bytesFormatted: string;
  spansCount: number;
  metricsCount: number;
  logsCount: number;
  costCents: number;
  costFormatted: string;
  periodStart: string;
  periodEnd: string;
}

// ============================================
// Input Types
// ============================================

export interface TraceQueryInput {
  projectId: string;
  startTime: Date | string;
  endTime: Date | string;
  serviceName?: string;
  spanName?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  statusCode?: string;
  traceId?: string;
  limit?: number;
  offset?: number;
}

export interface MetricQueryInput {
  projectId: string;
  startTime: Date | string;
  endTime: Date | string;
  metricName?: string;
  aggregation?: 'AVG' | 'SUM' | 'MIN' | 'MAX' | 'COUNT';
  interval?: string;
  limit?: number;
}

export interface LogQueryInput {
  projectId: string;
  startTime: Date | string;
  endTime: Date | string;
  severityText?: string;
  minSeverityNumber?: number;
  search?: string;
  traceId?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateObservabilitySettingsInput {
  tracesEnabled?: boolean;
  metricsEnabled?: boolean;
  logsEnabled?: boolean;
  traceRetention?: number;
  metricRetention?: number;
  logRetention?: number;
  sampleRate?: number;
  maxBytesPerHour?: string;
}

// ============================================
// Client Implementation
// ============================================

export class ObservabilityClient {
  private graphqlClient: Client;

  constructor(options: ObservabilityClientOptions) {
    this.graphqlClient = options.graphqlClient;
  }

  /**
   * Query traces with filters
   */
  public queryTraces = async (input: TraceQueryInput): Promise<Trace[]> => {
    const response = await this.graphqlClient.query({
      __name: 'QueryTraces',
      traces: {
        __args: {
          input: {
            projectId: input.projectId,
            startTime: this.formatDate(input.startTime),
            endTime: this.formatDate(input.endTime),
            serviceName: input.serviceName,
            spanName: input.spanName,
            minDurationMs: input.minDurationMs,
            maxDurationMs: input.maxDurationMs,
            statusCode: input.statusCode,
            traceId: input.traceId,
            limit: input.limit,
            offset: input.offset,
          },
        },
        traceId: true,
        serviceName: true,
        startTime: true,
        endTime: true,
        durationMs: true,
        spanCount: true,
        hasError: true,
        rootSpan: {
          traceId: true,
          spanId: true,
          parentSpanId: true,
          spanName: true,
          spanKind: true,
          serviceName: true,
          durationMs: true,
          statusCode: true,
          timestamp: true,
        },
        spans: {
          traceId: true,
          spanId: true,
          parentSpanId: true,
          spanName: true,
          spanKind: true,
          serviceName: true,
          durationMs: true,
          statusCode: true,
          timestamp: true,
          spanAttributes: true,
          resourceAttributes: true,
        },
      },
    });

    return response.traces as Trace[];
  };

  /**
   * Get a single trace by ID
   */
  public getTrace = async (
    projectId: string,
    traceId: string
  ): Promise<Trace | null> => {
    const response = await this.graphqlClient.query({
      __name: 'GetTrace',
      trace: {
        __args: {
          projectId,
          traceId,
        },
        traceId: true,
        serviceName: true,
        startTime: true,
        endTime: true,
        durationMs: true,
        spanCount: true,
        hasError: true,
        rootSpan: {
          traceId: true,
          spanId: true,
          parentSpanId: true,
          spanName: true,
          spanKind: true,
          serviceName: true,
          durationMs: true,
          statusCode: true,
          timestamp: true,
          spanAttributes: true,
          resourceAttributes: true,
          events: {
            timestamp: true,
            name: true,
            attributes: true,
          },
          links: {
            traceId: true,
            spanId: true,
          },
        },
        spans: {
          traceId: true,
          spanId: true,
          parentSpanId: true,
          spanName: true,
          spanKind: true,
          serviceName: true,
          durationMs: true,
          statusCode: true,
          timestamp: true,
          spanAttributes: true,
          resourceAttributes: true,
        },
      },
    });

    return response.trace as Trace | null;
  };

  /**
   * Query metrics with aggregation
   */
  public queryMetrics = async (input: MetricQueryInput): Promise<MetricSeries[]> => {
    const response = await this.graphqlClient.query({
      __name: 'QueryMetrics',
      metrics: {
        __args: {
          input: {
            projectId: input.projectId,
            startTime: this.formatDate(input.startTime),
            endTime: this.formatDate(input.endTime),
            metricName: input.metricName,
            aggregation: input.aggregation,
            interval: input.interval,
            limit: input.limit,
          },
        },
        metricName: true,
        metricUnit: true,
        metricType: true,
        dataPoints: {
          timestamp: true,
          value: true,
          metricName: true,
          metricType: true,
        },
      },
    });

    return response.metrics as MetricSeries[];
  };

  /**
   * Query logs
   */
  public queryLogs = async (input: LogQueryInput): Promise<LogEntry[]> => {
    const response = await this.graphqlClient.query({
      __name: 'QueryLogs',
      logs: {
        __args: {
          input: {
            projectId: input.projectId,
            startTime: this.formatDate(input.startTime),
            endTime: this.formatDate(input.endTime),
            severityText: input.severityText,
            minSeverityNumber: input.minSeverityNumber,
            search: input.search,
            traceId: input.traceId,
            limit: input.limit,
            offset: input.offset,
          },
        },
        timestamp: true,
        traceId: true,
        spanId: true,
        severityText: true,
        severityNumber: true,
        body: true,
        resourceAttributes: true,
        logAttributes: true,
      },
    });

    return response.logs as LogEntry[];
  };

  /**
   * Get service statistics for a project
   */
  public getServices = async (
    projectId: string,
    startTime: Date | string,
    endTime: Date | string
  ): Promise<ServiceStats[]> => {
    const response = await this.graphqlClient.query({
      __name: 'GetServices',
      services: {
        __args: {
          projectId,
          startTime: this.formatDate(startTime),
          endTime: this.formatDate(endTime),
        },
        serviceName: true,
        spanCount: true,
        traceCount: true,
        errorCount: true,
        errorRate: true,
        avgDurationMs: true,
        p50DurationMs: true,
        p95DurationMs: true,
        p99DurationMs: true,
      },
    });

    return response.services as ServiceStats[];
  };

  /**
   * Get observability settings for a project
   */
  public getSettings = async (projectId: string): Promise<ObservabilitySettings> => {
    const response = await this.graphqlClient.query({
      __name: 'GetObservabilitySettings',
      observabilitySettings: {
        __args: { projectId },
        id: true,
        projectId: true,
        tracesEnabled: true,
        metricsEnabled: true,
        logsEnabled: true,
        traceRetention: true,
        metricRetention: true,
        logRetention: true,
        sampleRate: true,
        maxBytesPerHour: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return response.observabilitySettings as ObservabilitySettings;
  };

  /**
   * Update observability settings for a project
   */
  public updateSettings = async (
    projectId: string,
    input: UpdateObservabilitySettingsInput
  ): Promise<ObservabilitySettings> => {
    const response = await this.graphqlClient.mutation({
      __name: 'UpdateObservabilitySettings',
      updateObservabilitySettings: {
        __args: {
          projectId,
          input,
        },
        id: true,
        projectId: true,
        tracesEnabled: true,
        metricsEnabled: true,
        logsEnabled: true,
        traceRetention: true,
        metricRetention: true,
        logRetention: true,
        sampleRate: true,
        maxBytesPerHour: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return response.updateObservabilitySettings as ObservabilitySettings;
  };

  /**
   * Get telemetry usage summary for a project
   */
  public getUsage = async (
    projectId: string,
    startDate: Date | string,
    endDate: Date | string
  ): Promise<TelemetryUsageSummary> => {
    const response = await this.graphqlClient.query({
      __name: 'GetTelemetryUsage',
      telemetryUsage: {
        __args: {
          projectId,
          startDate: this.formatDate(startDate),
          endDate: this.formatDate(endDate),
        },
        projectId: true,
        bytesIngested: true,
        bytesFormatted: true,
        spansCount: true,
        metricsCount: true,
        logsCount: true,
        costCents: true,
        costFormatted: true,
        periodStart: true,
        periodEnd: true,
      },
    });

    return response.telemetryUsage as TelemetryUsageSummary;
  };

  // ============================================
  // Helpers
  // ============================================

  private formatDate(date: Date | string): string {
    if (typeof date === 'string') {
      return date;
    }
    return date.toISOString();
  }
}
