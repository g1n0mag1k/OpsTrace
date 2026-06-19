import 'server-only';

import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import type { InspectionRecord, Job, JobOperation } from '@/lib/db/schema';
import type { JobAuditLogEntry } from '@/lib/db/queries';

const PAGE_MARGIN = 50;
const FOOTER_HEIGHT = 36;
const HEADER_BG = '#e5e7eb';
const BORDER_COLOR = '#d1d5db';
const MUTED_COLOR = '#6b7280';

export type JobTravelerPdfInput = {
  job: Job;
  operations: JobOperation[];
  inspectionRecords: InspectionRecord[];
  auditLogEntries: JobAuditLogEntry[];
  generatedBy: string;
  generatedAt: Date;
};

function formatDate(date: Date | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(date: Date | null) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function dash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatOperationLabel(
  operationId: number | null,
  operations: JobOperation[]
) {
  if (!operationId) return '—';
  const operation = operations.find((op) => op.id === operationId);
  if (!operation) return '—';
  return `${operation.sequence}. ${operation.description || '—'}`;
}

function formatAuditAction(action: string): string {
  return action
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatAuditDetails(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '—';
  }

  const details = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');

  return details || '—';
}

function computeDocumentHash(data: Record<string, unknown>): string {
  const serialized = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

type TableColumn = {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
};

type TableRow = string[];

type DrawTableOptions = {
  emptyMessage?: string;
  boldCells?: Array<Set<number>>;
};

function drawTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  columns: TableColumn[],
  rows: TableRow[],
  options?: DrawTableOptions
): number {
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const rowPadding = 6;
  const headerHeight = 24;
  const minRowHeight = 22;
  let y = startY;

  const drawHeader = () => {
    doc.save();
    doc.rect(PAGE_MARGIN, y, tableWidth, headerHeight).fill(HEADER_BG);
    doc.strokeColor(BORDER_COLOR).lineWidth(0.5);
    doc.rect(PAGE_MARGIN, y, tableWidth, headerHeight).stroke();

    let x = PAGE_MARGIN;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9);

    for (const column of columns) {
      doc.text(column.header, x + rowPadding, y + 7, {
        width: column.width - rowPadding * 2,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      x += column.width;
    }

    doc.restore();
    y += headerHeight;
  };

  const ensureSpace = (height: number) => {
    const bottom = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
    if (y + height > bottom) {
      doc.addPage();
      y = PAGE_MARGIN;
      drawHeader();
    }
  };

  drawHeader();

  if (rows.length === 0) {
    ensureSpace(minRowHeight);
    doc.save();
    doc.strokeColor(BORDER_COLOR).lineWidth(0.5);
    doc.rect(PAGE_MARGIN, y, tableWidth, minRowHeight).stroke();
    doc
      .fillColor(MUTED_COLOR)
      .font('Helvetica-Oblique')
      .fontSize(9)
      .text(options?.emptyMessage ?? 'No records.', PAGE_MARGIN + rowPadding, y + 7, {
        width: tableWidth - rowPadding * 2,
      });
    doc.restore();
    return y + minRowHeight + 16;
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    let rowHeight = minRowHeight;

    for (let i = 0; i < columns.length; i++) {
      const cellHeight = doc.heightOfString(row[i] ?? '—', {
        width: columns[i].width - rowPadding * 2,
        align: columns[i].align ?? 'left',
      });
      rowHeight = Math.max(rowHeight, cellHeight + rowPadding * 2);
    }

    ensureSpace(rowHeight);

    doc.save();
    doc.strokeColor(BORDER_COLOR).lineWidth(0.5);
    doc.rect(PAGE_MARGIN, y, tableWidth, rowHeight).stroke();

    let x = PAGE_MARGIN;

    for (let i = 0; i < columns.length; i++) {
      const isBold = options?.boldCells?.[rowIndex]?.has(i) ?? false;
      doc
        .fillColor('#111827')
        .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(row[i] ?? '—', x + rowPadding, y + rowPadding, {
          width: columns[i].width - rowPadding * 2,
          align: columns[i].align ?? 'left',
        });
      x += columns[i].width;
    }

    doc.restore();
    y += rowHeight;
  }

  return y + 16;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  const bottom = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
  if (y + 30 > bottom) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(title, PAGE_MARGIN, y);
  return y + 22;
}

function drawCoverPage(
  doc: PDFKit.PDFDocument,
  job: Job,
  generatedBy: string,
  generatedAt: Date
) {
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = tableWidth / 2;
  const rowHeight = 28;
  let y = PAGE_MARGIN;

  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(24)
    .text('Job Traveler — Compliance Record', PAGE_MARGIN, y, { align: 'left' });

  y += 40;

  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(dash(job.jobNumber), PAGE_MARGIN, y);

  y += 32;

  const fields: [string, string][] = [
    ['Customer', dash(job.customerName)],
    ['Part Number', dash(job.partNumber)],
    ['Revision', dash(job.partRevision)],
    ['Quantity', dash(job.quantity)],
    ['Due Date', formatDate(job.dueDate)],
    ['Status', dash(job.status)],
    ['Job Created', formatDate(job.createdAt)],
    [
      'Generated',
      `${formatDateTime(generatedAt)} by ${generatedBy}`,
    ],
  ];

  doc.save();
  doc.strokeColor(BORDER_COLOR).lineWidth(0.5);

  for (let i = 0; i < fields.length; i += 2) {
    const rowY = y + (i / 2) * rowHeight;

    doc.rect(PAGE_MARGIN, rowY, colWidth, rowHeight).stroke();
    doc.rect(PAGE_MARGIN + colWidth, rowY, colWidth, rowHeight).stroke();

    doc
      .fillColor(MUTED_COLOR)
      .font('Helvetica')
      .fontSize(8)
      .text(fields[i][0], PAGE_MARGIN + 8, rowY + 6, { width: colWidth - 16 });
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(fields[i][1], PAGE_MARGIN + 8, rowY + 16, { width: colWidth - 16 });

    if (fields[i + 1]) {
      doc
        .fillColor(MUTED_COLOR)
        .font('Helvetica')
        .fontSize(8)
        .text(fields[i + 1][0], PAGE_MARGIN + colWidth + 8, rowY + 6, {
          width: colWidth - 16,
        });
      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(fields[i + 1][1], PAGE_MARGIN + colWidth + 8, rowY + 16, {
          width: colWidth - 16,
        });
    }
  }

  doc.restore();

  y += (fields.length / 2) * rowHeight + 28;

  doc
    .fillColor(MUTED_COLOR)
    .font('Helvetica')
    .fontSize(9)
    .text(
      'This document is a complete record of job execution, inspection results, and audit history. Generated by OpsTrace.',
      PAGE_MARGIN,
      y,
      { width: tableWidth, align: 'left' }
    );
}

function drawIntegrityHash(
  doc: PDFKit.PDFDocument,
  hash: string,
  startY: number
) {
  const bottom = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
  let y = startY;

  if (y + 90 > bottom) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  y = drawSectionTitle(doc, 'Document Integrity', y);

  const tableWidth = doc.page.width - PAGE_MARGIN * 2;

  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Document Integrity Hash (SHA-256):', PAGE_MARGIN, y);

  y += 14;

  doc
    .fillColor('#111827')
    .font('Courier')
    .fontSize(8)
    .text(hash, PAGE_MARGIN, y, { width: tableWidth });

  y += 28;

  doc
    .fillColor(MUTED_COLOR)
    .font('Helvetica')
    .fontSize(8)
    .text(
      'This hash verifies the document has not been altered after generation. Contact the issuing organization for verification.',
      PAGE_MARGIN,
      y,
      { width: tableWidth }
    );

  return y + 20;
}

function drawFooters(
  doc: PDFKit.PDFDocument,
  jobNumber: string,
  generatedAt: Date,
  generatedBy: string
) {
  const pageCount = doc.bufferedPageRange().count;
  const generatedLabel = formatDateTime(generatedAt);

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - PAGE_MARGIN + 4;

    doc
      .fillColor(MUTED_COLOR)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `OpsTrace Compliance Record — Job ${jobNumber} — Page ${i + 1} of ${pageCount}`,
        PAGE_MARGIN,
        footerY,
        { align: 'center', width: doc.page.width - PAGE_MARGIN * 2 }
      );

    doc
      .fillColor(MUTED_COLOR)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Generated ${generatedLabel} by ${generatedBy}`,
        PAGE_MARGIN,
        footerY + 12,
        { align: 'center', width: doc.page.width - PAGE_MARGIN * 2 }
      );
  }
}

export async function generateJobTravelerPdf(
  input: JobTravelerPdfInput
): Promise<Buffer> {
  const {
    job,
    operations,
    inspectionRecords,
    auditLogEntries,
    generatedBy,
    generatedAt,
  } = input;

  const auditHistory = [...auditLogEntries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const hashPayload = {
    job,
    operations,
    inspectionRecords,
    auditLogEntries: auditHistory,
    generatedBy,
    generatedAt: generatedAt.toISOString(),
  };

  const documentHash = computeDocumentHash(hashPayload);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: `${job.jobNumber} Compliance Record`,
        Author: 'OpsTrace',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawCoverPage(doc, job, generatedBy, generatedAt);

    doc.addPage();

    let y = PAGE_MARGIN;
    y = drawSectionTitle(doc, 'Operations', y);

    const tableWidth = doc.page.width - PAGE_MARGIN * 2;
    const operationColumns: TableColumn[] = [
      { header: 'Seq', width: tableWidth * 0.07, align: 'center' },
      { header: 'Description', width: tableWidth * 0.33 },
      { header: 'Machine', width: tableWidth * 0.18 },
      { header: 'Completed By', width: tableWidth * 0.2 },
      { header: 'Completed At', width: tableWidth * 0.22 },
    ];

    const operationRows: TableRow[] = operations.map((operation) => [
      dash(operation.sequence),
      dash(operation.description),
      dash(operation.machine),
      operation.completedAt ? dash(operation.completedBy) : 'PENDING',
      operation.completedAt ? formatDateTime(operation.completedAt) : 'PENDING',
    ]);

    y = drawTable(doc, y, operationColumns, operationRows, {
      emptyMessage: 'No operations recorded.',
    });

    y = drawSectionTitle(doc, 'Inspection Records', y);

    const inspectionColumns: TableColumn[] = [
      { header: 'Dimension', width: tableWidth * 0.14 },
      { header: 'Spec', width: tableWidth * 0.12 },
      { header: 'Actual', width: tableWidth * 0.12 },
      { header: 'Result', width: tableWidth * 0.1 },
      { header: 'Inspector', width: tableWidth * 0.16 },
      { header: 'Date/Time', width: tableWidth * 0.18 },
      { header: 'Operation', width: tableWidth * 0.18 },
    ];

    const inspectionRows: TableRow[] = inspectionRecords.map((record) => [
      dash(record.dimension),
      dash(record.nominalSpec),
      dash(record.actualValue),
      record.result?.toLowerCase() === 'fail' ? 'FAIL' : dash(record.result),
      dash(record.inspector),
      formatDateTime(record.inspectedAt),
      formatOperationLabel(record.operationId, operations),
    ]);

    const inspectionBoldCells = inspectionRecords.map((record) =>
      record.result?.toLowerCase() === 'fail' ? new Set([3]) : new Set<number>()
    );

    y = drawTable(doc, y, inspectionColumns, inspectionRows, {
      emptyMessage: 'No inspection records.',
      boldCells: inspectionBoldCells,
    });

    y = drawSectionTitle(doc, 'Record History', y);

    const auditColumns: TableColumn[] = [
      { header: 'Date/Time', width: tableWidth * 0.22 },
      { header: 'User', width: tableWidth * 0.2 },
      { header: 'Action', width: tableWidth * 0.2 },
      { header: 'Details', width: tableWidth * 0.38 },
    ];

    const auditRows: TableRow[] = auditHistory.map((entry) => [
      formatDateTime(new Date(entry.timestamp)),
      entry.userName || entry.userEmail || '—',
      formatAuditAction(entry.action),
      formatAuditDetails(entry.metadata),
    ]);

    y = drawTable(doc, y, auditColumns, auditRows, {
      emptyMessage: 'No audit history recorded.',
    });

    drawIntegrityHash(doc, documentHash, y);
    drawFooters(doc, job.jobNumber, generatedAt, generatedBy);

    doc.end();
  });
}
