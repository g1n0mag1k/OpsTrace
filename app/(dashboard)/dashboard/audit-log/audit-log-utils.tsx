'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ActivityType } from '@/lib/db/schema';

const ACTION_LABELS: Record<ActivityType, string> = {
  [ActivityType.SIGN_UP]: 'Sign up',
  [ActivityType.SIGN_IN]: 'Sign in',
  [ActivityType.SIGN_OUT]: 'Sign out',
  [ActivityType.UPDATE_PASSWORD]: 'Update password',
  [ActivityType.DELETE_ACCOUNT]: 'Delete account',
  [ActivityType.UPDATE_ACCOUNT]: 'Update account',
  [ActivityType.CREATE_TEAM]: 'Create team',
  [ActivityType.REMOVE_TEAM_MEMBER]: 'Remove team member',
  [ActivityType.INVITE_TEAM_MEMBER]: 'Invite team member',
  [ActivityType.ACCEPT_INVITATION]: 'Accept invitation',
  [ActivityType.CREATE_INSPECTION_RECORD]: 'Inspection sign-off',
  [ActivityType.CREATE_JOB]: 'Create job',
  [ActivityType.CREATE_OPERATION]: 'Create operation',
  [ActivityType.COMPLETE_OPERATION]: 'Complete operation',
  [ActivityType.EXPORT_PDF]: 'Export PDF',
};

export function AuditLogFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentAction = searchParams.get('action') ?? '';

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    const value = event.target.value;

    if (value) {
      params.set('action', value);
    } else {
      params.delete('action');
    }

    params.delete('page');
    router.push(`/dashboard/audit-log?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="action-filter" className="text-sm text-muted-foreground">
        Filter by action
      </label>
      <select
        id="action-filter"
        value={currentAction}
        onChange={handleChange}
        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">All actions</option>
        {Object.values(ActivityType).map((action) => (
          <option key={action} value={action}>
            {ACTION_LABELS[action]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action as ActivityType] ?? action;
}

export function formatAuditTarget(
  targetType: string | null,
  targetId: string | null
): string {
  if (!targetType || !targetId) {
    return '—';
  }

  const label = targetType.charAt(0).toUpperCase() + targetType.slice(1);
  return `${label} #${targetId}`;
}

export function formatAuditDetails(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '—';
  }

  const details = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');

  return details || '—';
}
