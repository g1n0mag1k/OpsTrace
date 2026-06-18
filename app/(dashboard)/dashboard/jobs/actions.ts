'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  jobOperations,
  jobs,
  type NewJob,
  type NewJobOperation
} from '@/lib/db/schema';
import { getJobForTeam, getUserWithTeam } from '@/lib/db/queries';
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

const createJobOperationSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  sequence: z.coerce.number().int().positive(),
  description: z.string().min(1, 'Description is required').max(255),
  machine: z.string().min(1, 'Machine is required').max(255)
});

export const createJobOperation = validatedActionWithUser(
  createJobOperationSchema,
  async (data) => {
    const job = await getJobForTeam(data.jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    const newOperation: NewJobOperation = {
      jobId: data.jobId,
      sequence: data.sequence,
      description: data.description,
      machine: data.machine
    };

    const [createdOperation] = await db
      .insert(jobOperations)
      .values(newOperation)
      .returning();

    if (!createdOperation) {
      return { error: 'Failed to create operation. Please try again.' };
    }

    redirect(`/dashboard/jobs/${data.jobId}`);
  }
);

const completeJobOperationSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  operationId: z.coerce.number().int().positive()
});

export const completeJobOperation = validatedActionWithUser(
  completeJobOperationSchema,
  async (data, _, user) => {
    const job = await getJobForTeam(data.jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    const result = await db
      .select()
      .from(jobOperations)
      .where(
        and(
          eq(jobOperations.id, data.operationId),
          eq(jobOperations.jobId, data.jobId)
        )
      )
      .limit(1);

    const operation = result[0];

    if (!operation) {
      return { error: 'Operation not found' };
    }

    if (operation.completedAt) {
      return { error: 'Operation is already completed' };
    }

    await db
      .update(jobOperations)
      .set({
        completedBy: user.name || user.email,
        completedAt: new Date()
      })
      .where(eq(jobOperations.id, data.operationId));

    redirect(`/dashboard/jobs/${data.jobId}`);
  }
);
