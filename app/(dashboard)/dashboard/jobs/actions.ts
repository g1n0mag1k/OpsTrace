'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  inspectionRecords,
  jobOperations,
  jobs,
  ActivityType,
  type NewInspectionRecord,
  type NewJob,
  type NewJobOperation
} from '@/lib/db/schema';
import { getJobForTeam, getUserWithTeam } from '@/lib/db/queries';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { logActivity } from '@/lib/activity/log';
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

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.CREATE_JOB,
      {
        jobNumber: data.jobNumber,
        customer: data.customerName,
        partNumber: data.partNumber,
        revision: data.partRevision,
        quantity: data.quantity,
      },
      'job',
      String(createdJob.id)
    );

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
  async (data, _, user) => {
    const job = await getJobForTeam(data.jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
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

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.CREATE_OPERATION,
      {
        jobId: data.jobId,
        description: data.description,
        sequence: data.sequence,
        machine: data.machine,
      },
      'operation',
      String(createdOperation.id)
    );

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

    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    const completedAt = new Date();

    await db
      .update(jobOperations)
      .set({
        completedBy: user.name || user.email,
        completedAt,
      })
      .where(eq(jobOperations.id, data.operationId));

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.COMPLETE_OPERATION,
      {
        jobId: data.jobId,
        completedBy: user.name || user.email,
        completedAt: completedAt.toISOString(),
      },
      'operation',
      String(data.operationId)
    );

    redirect(`/dashboard/jobs/${data.jobId}`);
  }
);

// COMPLIANCE: Inspection records are append-only. No update or delete
// actions exist by design. This is required for AS9100/ISO 13485 audit
// integrity. Do not add edit or delete functionality.

const createInspectionRecordSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  operationId: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .optional(),
  dimension: z.string().min(1, 'Dimension is required').max(255),
  nominalSpec: z.string().min(1, 'Nominal spec is required').max(255),
  actualValue: z.string().min(1, 'Actual value is required').max(255),
  result: z.enum(['pass', 'fail']),
});

export const createInspectionRecord = validatedActionWithUser(
  createInspectionRecordSchema,
  async (data, _, user) => {
    const job = await getJobForTeam(data.jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    const operationId =
      data.operationId === '' || data.operationId === undefined
        ? null
        : data.operationId;

    if (operationId) {
      const result = await db
        .select()
        .from(jobOperations)
        .where(
          and(
            eq(jobOperations.id, operationId),
            eq(jobOperations.jobId, data.jobId)
          )
        )
        .limit(1);

      if (!result[0]) {
        return { error: 'Operation not found' };
      }
    }

    const now = new Date();
    const inspector = user.name || user.email;

    const newRecord: NewInspectionRecord = {
      jobId: data.jobId,
      operationId,
      userId: user.id,
      dimension: data.dimension,
      nominalSpec: data.nominalSpec,
      actualValue: data.actualValue,
      result: data.result,
      inspector,
      inspectedAt: now,
      lockedAt: now,
    };

    const [createdRecord] = await db
      .insert(inspectionRecords)
      .values(newRecord)
      .returning();

    if (!createdRecord) {
      return { error: 'Failed to create inspection record. Please try again.' };
    }

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.CREATE_INSPECTION_RECORD,
      {
        jobId: data.jobId,
        operationId,
        dimension: data.dimension,
        result: data.result,
        inspector,
      },
      'inspection',
      String(createdRecord.id)
    );

    redirect(`/dashboard/jobs/${data.jobId}`);
  }
);
