import type { Db } from "../db/client";
import { auditLogs } from "../db/schema";

export interface AuditEvent {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Non-confidential context only. Never put recipe text or AI prompts here. */
  metadata?: Record<string, unknown>;
}

export async function writeAudit(db: Db, e: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: e.actorId,
    action: e.action,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    metadata: e.metadata ?? null,
  });
}
