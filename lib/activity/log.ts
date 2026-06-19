import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  ActivityType,
  type NewActivityLog,
} from '@/lib/db/schema';

export async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  metadata?: Record<string, unknown>,
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
    ipAddress: ipAddress || '',
  };

  await db.insert(activityLogs).values(newActivity);
}
