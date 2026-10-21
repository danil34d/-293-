import { prisma } from '@/lib/db/prisma';
import { createPostgresReconciliationStore } from '@/lib/reconciliation/postgres-store';

const store = createPostgresReconciliationStore({
  query: (sql, values) => prisma.$queryRawUnsafe(sql, ...values),
  transaction: work => prisma.$transaction(tx => work({
    query: (sql, values) => tx.$queryRawUnsafe(sql, ...values),
  })),
});

export const getReconciliation = store.read;
export const saveReconciliation = store.write;
export const getReconciliationHistory = store.history;
export const getReconciliations = store.list;
export const getReconciliationPaperImage = store.readPaperImage;
export const saveReconciliationPaperImage = store.writePaperImage;
