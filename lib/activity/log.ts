import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  ActivityType,
  type NewActivityLog,
} from '@/lib/db/schema';

// COMPLIANCE: Audit log is append-only. No update or delete functions
// exist for activityLogs by design. This is required for AS9100/ISO 13485
// regulatory compliance. Do not create any functions that modify or
// delete audit log entries.

export async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  metadata?: Record<string, unknown>,
  targetType?: string,
  targetId?: string,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }

  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    metadata: metadata ?? null,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    ipAddress: ipAddress || '',
  };

  await db.insert(activityLogs).values(newActivity);
}
