/**
 * AlternateFutures Auto-Instrumentation
 *
 * Provides easy-to-use OpenTelemetry instrumentation for AF Functions
 * and customer applications. Automatically sends traces, metrics, and logs
 * to the AlternateFutures observability platform.
 *
 * Usage:
 * ```typescript
 * import { initInstrumentation } from '@alternatefutures/sdk/instrumentation';
 *
 * initInstrumentation({
 *   projectId: 'your-project-id',
 *   projectSlug: 'your-project',
 *   serviceName: 'my-service',
 * });
 * ```
 */

import type { NodeSDK } from '@opentelemetry/sdk-node';
import type { Resource } from '@opentelemetry/resources';
import type { Span } from '@opentelemetry/api';

// ============================================
// Types
// ============================================

export interface InstrumentationConfig {
  /** AlternateFutures project ID */
  projectId: string;
  /** AlternateFutures project slug */
  projectSlug: string;
  /** Service name for this application */
  serviceName: string;
  /** Service version (optional) */
  serviceVersion?: string;
  /** Environment (e.g., 'production', 'staging', 'development') */
  environment?: string;
  /** OTLP endpoint URL (defaults to AF collector) */
  otlpEndpoint?: string;
  /** Enable trace instrumentation (default: true) */
  tracesEnabled?: boolean;
  /** Enable metrics instrumentation (default: true) */
  metricsEnabled?: boolean;
  /** Enable logs instrumentation (default: true) */
  logsEnabled?: boolean;
  /** Sampling ratio (0.0 to 1.0, default: 1.0) */
  sampleRate?: number;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
}

export interface InstrumentedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
}

// Default OTLP endpoint for AlternateFutures collector
const DEFAULT_OTLP_ENDPOINT = 'https://otel.alternatefutures.ai';

// ============================================
// Lazy-loaded OpenTelemetry imports
// ============================================

let sdk: NodeSDK | null = null;
let initialized = false;

/**
 * Initialize OpenTelemetry instrumentation for AlternateFutures
 *
 * This should be called at the very beginning of your application,
 * before importing any other modules that should be instrumented.
 *
 * @param config Instrumentation configuration
 * @returns The initialized NodeSDK instance
 */
export async function initInstrumentation(
  config: InstrumentationConfig
): Promise<NodeSDK> {
  if (initialized && sdk) {
    console.warn('[AF Instrumentation] Already initialized, returning existing SDK');
    return sdk;
  }

  // Dynamically import OpenTelemetry modules
  const [
    { NodeSDK: NodeSDKClass },
    { Resource: ResourceClass },
    {
      SEMRESATTRS_SERVICE_NAME,
      SEMRESATTRS_SERVICE_VERSION,
      SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
    },
    { getNodeAutoInstrumentations },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { OTLPLogExporter },
    { PeriodicExportingMetricReader },
    { BatchLogRecordProcessor },
    { TraceIdRatioBasedSampler },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('@opentelemetry/auto-instrumentations-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/exporter-metrics-otlp-http'),
    import('@opentelemetry/exporter-logs-otlp-http'),
    import('@opentelemetry/sdk-metrics'),
    import('@opentelemetry/sdk-logs'),
    import('@opentelemetry/sdk-trace-base'),
  ]);

  const otlpEndpoint = config.otlpEndpoint || DEFAULT_OTLP_ENDPOINT;

  // Common headers for multi-tenant routing
  const commonHeaders = {
    'X-AF-Project-ID': config.projectId,
    'X-AF-Project-Slug': config.projectSlug,
  };

  // Create resource with service info and AF attributes
  const resource = new ResourceClass({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment || 'production',
    'af.project.id': config.projectId,
    'af.project.slug': config.projectSlug,
    ...config.resourceAttributes,
  });

  // Configure trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: commonHeaders,
  });

  // Configure metrics exporter
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
      headers: commonHeaders,
    }),
    exportIntervalMillis: 60000, // Export every minute
  });

  // Configure logs exporter
  const logExporter = new OTLPLogExporter({
    url: `${otlpEndpoint}/v1/logs`,
    headers: commonHeaders,
  });

  const logProcessor = new BatchLogRecordProcessor(logExporter);

  // Configure sampler
  const sampleRate = config.sampleRate ?? 1.0;
  const sampler = new TraceIdRatioBasedSampler(sampleRate);

  // Create and start SDK
  sdk = new NodeSDKClass({
    resource,
    traceExporter: config.tracesEnabled !== false ? traceExporter : undefined,
    metricReader: config.metricsEnabled !== false ? metricReader : undefined,
    logRecordProcessor: config.logsEnabled !== false ? logProcessor : undefined,
    sampler,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation by default (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Customize HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingPaths: ['/health', '/healthz', '/ready', '/readyz'],
        },
      }),
    ],
  });

  sdk.start();
  initialized = true;

  console.log(
    `[AF Instrumentation] Initialized for project ${config.projectSlug} (${config.serviceName})`
  );

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownInstrumentation();
  });

  process.on('SIGINT', async () => {
    await shutdownInstrumentation();
  });

  return sdk;
}

/**
 * Gracefully shutdown instrumentation
 * Call this before your application exits to ensure all telemetry is flushed
 */
export async function shutdownInstrumentation(): Promise<void> {
  if (sdk) {
    console.log('[AF Instrumentation] Shutting down...');
    await sdk.shutdown();
    sdk = null;
    initialized = false;
  }
}

/**
 * Check if instrumentation is initialized
 */
export function isInstrumentationInitialized(): boolean {
  return initialized;
}

/**
 * Get the current SDK instance (for advanced use cases)
 */
export function getSdk(): NodeSDK | null {
  return sdk;
}

// ============================================
// Function Wrapper Utilities
// ============================================

/**
 * Wrap a function handler with automatic span creation
 *
 * Useful for wrapping serverless function handlers or route handlers.
 *
 * @param handler The function to wrap
 * @param spanName Name for the span (e.g., 'handleRequest')
 * @param attributes Additional span attributes
 * @returns Wrapped function with instrumentation
 *
 * @example
 * ```typescript
 * const handler = withSpan(
 *   async (req, res) => {
 *     // Your handler logic
 *   },
 *   'api.handleRequest',
 *   { 'http.route': '/api/users' }
 * );
 * ```
 */
export function withSpan<T extends (...args: any[]) => any>(
  handler: T,
  spanName: string,
  attributes?: Record<string, string | number | boolean>
): InstrumentedFunction<T> {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // Dynamically import tracer
    const { trace, SpanStatusCode } = await import('@opentelemetry/api');
    const tracer = trace.getTracer('@alternatefutures/instrumentation');

    return tracer.startActiveSpan(spanName, async (span: Span) => {
      try {
        // Add custom attributes
        if (attributes) {
          for (const [key, value] of Object.entries(attributes)) {
            span.setAttribute(key, value);
          }
        }

        const result = await handler(...args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }) as InstrumentedFunction<T>;
}

/**
 * Add a custom span attribute to the current active span
 *
 * @param key Attribute key
 * @param value Attribute value
 */
export async function setSpanAttribute(
  key: string,
  value: string | number | boolean
): Promise<void> {
  const { trace } = await import('@opentelemetry/api');
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Record an event on the current active span
 *
 * @param name Event name
 * @param attributes Event attributes
 */
export async function recordSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): Promise<void> {
  const { trace } = await import('@opentelemetry/api');
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set the status of the current active span to error
 *
 * @param error The error that occurred
 */
export async function recordSpanError(error: Error): Promise<void> {
  const { trace, SpanStatusCode } = await import('@opentelemetry/api');
  const span = trace.getActiveSpan();
  if (span) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
  }
}

// ============================================
// Re-exports for convenience
// ============================================

export {
  type InstrumentationConfig as Config,
  type InstrumentedFunction as WrappedHandler,
};
