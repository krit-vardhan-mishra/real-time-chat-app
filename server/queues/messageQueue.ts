import { db } from "../db";
import { messages, type InsertMessage } from "@shared/schema";
import { createLogger } from "../../shared/logger";
import { recordMessagePersisted } from "../metrics/prometheus";

const log = createLogger("message-queue");

interface QueuedMessageItem {
  conversationId: number;
  senderId: number;
  content: string;
  delivered: boolean;
  read: boolean;
  resolve: (messageId: number) => void;
  reject: (err: any) => void;
  queuedAt: number;
}

class WriteBehindMessageQueue {
  private queue: QueuedMessageItem[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly batchSize = 50;
  private readonly flushIntervalMs = 200;

  constructor() {
    this.scheduleFlush();
  }

  public enqueue(msg: {
    conversationId: number;
    senderId: number;
    content: string;
    delivered?: boolean;
    read?: boolean;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        content: msg.content,
        delivered: msg.delivered ?? true,
        read: msg.read ?? false,
        resolve,
        reject,
        queuedAt: Date.now(),
      });

      if (this.queue.length >= this.batchSize) {
        this.flush();
      }
    });
  }

  private scheduleFlush() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  public async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const itemsToProcess = this.queue.splice(0, this.batchSize);
    const startMs = Date.now();

    try {
      const valuesToInsert: InsertMessage[] = itemsToProcess.map((item) => ({
        conversationId: item.conversationId,
        senderId: item.senderId,
        content: item.content,
        delivered: item.delivered,
        read: item.read,
      }));

      // Execute bulk write to PostgreSQL database in a single round-trip query
      const insertedRows = await db
        .insert(messages)
        .values(valuesToInsert)
        .returning({ id: messages.id });

      const durationMs = Date.now() - startMs;
      log.info(`⚡ Batch persisted ${insertedRows.length} messages in ${durationMs}ms`);

      itemsToProcess.forEach((item, index) => {
        const inserted = insertedRows[index];
        const latency = Date.now() - item.queuedAt;
        recordMessagePersisted(latency / 1000);
        if (inserted) {
          item.resolve(inserted.id);
        } else {
          item.reject(new Error("Failed to retrieve inserted message ID"));
        }
      });
    } catch (err) {
      log.error("❌ Write-Behind Message Persistence Batch Failed:", err);
      // Fallback: resolve individual items via fallback single writes if batch fails
      for (const item of itemsToProcess) {
        try {
          const [inserted] = await db
            .insert(messages)
            .values({
              conversationId: item.conversationId,
              senderId: item.senderId,
              content: item.content,
              delivered: item.delivered,
              read: item.read,
            })
            .returning({ id: messages.id });
          item.resolve(inserted.id);
        } catch (singleErr) {
          item.reject(singleErr);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const messageQueue = new WriteBehindMessageQueue();
