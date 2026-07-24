import { type Request, type Response } from "express";

/**
 * Lightweight Prometheus Metrics Telemetry Registry
 * Collects P50/P90/P99 latencies, socket counts, and DB operations.
 */

interface HistogramBucket {
  le: number;
  count: number;
}

let activeWebsocketConnections = 0;
let totalMessagesSent = 0;
let totalMessagesPersisted = 0;
let totalHttpRequests = 0;

// Metric buckets for latency recording (in seconds)
const latencyBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const persistenceLatencyCounts: number[] = new Array(latencyBuckets.length + 1).fill(0);
let persistenceLatencySum = 0;
let persistenceLatencyTotalCount = 0;

export function incrementActiveSockets() {
  activeWebsocketConnections++;
}

export function decrementActiveSockets() {
  if (activeWebsocketConnections > 0) activeWebsocketConnections--;
}

export function recordMessageSent() {
  totalMessagesSent++;
}

export function recordMessagePersisted(latencySeconds: number) {
  totalMessagesPersisted++;
  persistenceLatencySum += latencySeconds;
  persistenceLatencyTotalCount++;

  let added = false;
  for (let i = 0; i < latencyBuckets.length; i++) {
    if (latencySeconds <= latencyBuckets[i]) {
      persistenceLatencyCounts[i]++;
      added = true;
      break;
    }
  }
  if (!added) {
    persistenceLatencyCounts[latencyBuckets.length]++;
  }
}

export function incrementHttpRequests() {
  totalHttpRequests++;
}

/**
 * Returns Prometheus formatted text metrics
 */
export function getPrometheusMetrics(): string {
  let output = "";

  output += "# HELP active_websocket_connections Current count of active WebSocket connections\n";
  output += "# TYPE active_websocket_connections gauge\n";
  output += `active_websocket_connections ${activeWebsocketConnections}\n\n`;

  output += "# HELP total_messages_sent Cumulative total messages sent real-time\n";
  output += "# TYPE total_messages_sent counter\n";
  output += `total_messages_sent ${totalMessagesSent}\n\n`;

  output += "# HELP total_messages_persisted Cumulative total messages written to DB\n";
  output += "# TYPE total_messages_persisted counter\n";
  output += `total_messages_persisted ${totalMessagesPersisted}\n\n`;

  output += "# HELP total_http_requests Cumulative HTTP request count\n";
  output += "# TYPE total_http_requests counter\n";
  output += `total_http_requests ${totalHttpRequests}\n\n`;

  output += "# HELP message_persistence_latency_seconds Write-behind message persistence duration\n";
  output += "# TYPE message_persistence_latency_seconds histogram\n";
  
  let cumulative = 0;
  for (let i = 0; i < latencyBuckets.length; i++) {
    cumulative += persistenceLatencyCounts[i];
    output += `message_persistence_latency_seconds_bucket{le="${latencyBuckets[i]}"} ${cumulative}\n`;
  }
  cumulative += persistenceLatencyCounts[latencyBuckets.length];
  output += `message_persistence_latency_seconds_bucket{le="+Inf"} ${cumulative}\n`;
  output += `message_persistence_latency_seconds_sum ${persistenceLatencySum.toFixed(4)}\n`;
  output += `message_persistence_latency_seconds_count ${persistenceLatencyTotalCount}\n`;

  return output;
}

export function metricsHandler(_req: Request, res: Response) {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(getPrometheusMetrics());
}
