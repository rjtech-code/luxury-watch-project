import { db } from '../db/client.js';

/** Records an administrative action. Never throws: auditing must not break the request. */
export async function audit(req, action, entity, entityId, meta, session) {
  try {
    await db.auditLogs.insert({
      actorId: req.user?.id ?? null,
      actorEmail: req.user?.email ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId == null ? null : String(entityId),
      meta: meta ?? null,
      ip: req.ip ?? null,
    }, { session });
  } catch (err) {
    req.log?.error({ err }, 'audit log write failed');
  }
}
