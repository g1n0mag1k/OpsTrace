import Link from 'next/link';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getTeamAuditLog } from '@/lib/db/queries';
import {
  AuditLogFilters,
  formatAuditAction,
  formatAuditDetails,
  formatAuditTarget,
} from './audit-log-utils';

// COMPLIANCE: This page is read-only by design. The audit log is
// append-only and no records can be modified or deleted through
// any application interface.

const PAGE_SIZE = 25;

function formatDateTime(date: Date) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildPageUrl(page: number, actionFilter?: string) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (actionFilter) {
    params.set('action', actionFilter);
  }
  return `/dashboard/audit-log?${params.toString()}`;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? '1', 10);
  const actionFilter = params.action || undefined;
  const { logs, totalCount, page: currentPage } = await getTeamAuditLog(
    Number.isNaN(page) ? 1 : page,
    actionFilter
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Compliance Audit Log
        </h1>
        <Suspense fallback={null}>
          <AuditLogFilters />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Date/Time</th>
                    <th className="pb-3 pr-4 font-medium">User</th>
                    <th className="pb-3 pr-4 font-medium">Action</th>
                    <th className="pb-3 pr-4 font-medium">Target</th>
                    <th className="pb-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-b-0">
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {formatDateTime(new Date(log.timestamp))}
                      </td>
                      <td className="py-3 pr-4">
                        {log.userName || log.userEmail || '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {formatAuditAction(log.action)}
                      </td>
                      <td className="py-3 pr-4">
                        {formatAuditTarget(log.targetType, log.targetId)}
                      </td>
                      <td className="py-3">{formatAuditDetails(log.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground">No audit log entries found.</p>
          )}

          {totalCount > PAGE_SIZE ? (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                >
                  <Link href={buildPageUrl(currentPage - 1, actionFilter)}>
                    Previous
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                >
                  <Link href={buildPageUrl(currentPage + 1, actionFilter)}>
                    Next
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
