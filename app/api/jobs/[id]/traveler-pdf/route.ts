import { notFound } from 'next/navigation';
import {
  getInspectionRecordsForTeam,
  getJobForTeam,
  getJobOperationsForTeam,
  getUser,
  getUserWithTeam,
} from '@/lib/db/queries';
import { generateJobTravelerPdf } from '@/lib/pdf/job-traveler';
import { logActivity } from '@/lib/activity/log';
import { ActivityType } from '@/lib/db/schema';

function safeFilename(jobNumber: string) {
  return jobNumber.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);

  if (isNaN(jobId)) {
    notFound();
  }

  const user = await getUser();
  if (!user) {
    notFound();
  }

  const userWithTeam = await getUserWithTeam(user.id);
  if (!userWithTeam?.teamId) {
    notFound();
  }

  const job = await getJobForTeam(jobId);
  if (!job) {
    notFound();
  }

  const operations = (await getJobOperationsForTeam(jobId)) ?? [];
  const inspectionRecords = (await getInspectionRecordsForTeam(jobId)) ?? [];
  const pdf = await generateJobTravelerPdf(job, operations, inspectionRecords);

  await logActivity(
    userWithTeam.teamId,
    user.id,
    ActivityType.EXPORT_PDF,
    { jobId: id, jobNumber: job.jobNumber },
    'pdf',
    String(jobId)
  );

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename(job.jobNumber)}-traveler.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
