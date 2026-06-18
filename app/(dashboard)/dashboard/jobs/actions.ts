'use server';

import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { jobs, type NewJob } from '@/lib/db/schema';
import { getUserWithTeam } from '@/lib/db/queries';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';

const createJobSchema = z.object({
  jobNumber: z.string().min(1, 'Job number is required').max(255),
  customerName: z.string().max(255).optional(),
  partNumber: z.string().max(255).optional(),
  partRevision: z.string().max(255).optional(),
  quantity: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .optional(),
  dueDate: z.string().optional()
});

export const createJob = validatedActionWithUser(
  createJobSchema,
  async (data, _, user) => {
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    const newJob: NewJob = {
      teamId: userWithTeam.teamId,
      jobNumber: data.jobNumber,
      customerName: data.customerName || null,
      partNumber: data.partNumber || null,
      partRevision: data.partRevision || null,
      quantity: data.quantity === '' || data.quantity === undefined
        ? null
        : data.quantity,
      dueDate: data.dueDate ? new Date(data.dueDate) : null
    };

    const [createdJob] = await db.insert(jobs).values(newJob).returning();

    if (!createdJob) {
      return { error: 'Failed to create job. Please try again.' };
    }

    redirect(`/dashboard/jobs/${createdJob.id}`);
  }
);
