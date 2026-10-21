import React from 'react';
import { createRoot } from 'react-dom/client';
import ReconciliationDemo from '../../src/components/reconciliation/ReconciliationDemo';
import type { ReconciliationDataset } from '../../src/lib/reconciliation/demo-model';
import { createReconciliationModel } from '../../src/lib/reconciliation/demo-model';

const source = document.getElementById('reconciliation-snapshot');
try {
  const snapshot = source ? JSON.parse(source.textContent || '') : undefined;
  const dataset: ReconciliationDataset | undefined = snapshot?.dataset;
  if (dataset) createReconciliationModel(dataset);
  createRoot(document.getElementById('root')!).render(<React.StrictMode><ReconciliationDemo dataset={dataset} presentation={snapshot?.presentation} /></React.StrictMode>);
} catch {
  document.getElementById('root')!.textContent = 'Не удалось открыть срез сверки. Исходные данные и сохранённые правки не изменены.';
}
