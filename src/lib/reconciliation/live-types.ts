import type { DemoState, Evidence, ReconciliationDataset } from './demo-model';

export type ShiftKey = { date: string; period: 'day' | 'night' };
export type CameraObservation = {
  evidence: Evidence;
  dirName: string;
  startedAt: string;
  endedAt: string | null;
  correctedPlate: string;
  mergeGroup: string | null;
  mergedInto: string | null;
  hasThumbnail: boolean;
  hasVideo: boolean;
  isNegative: boolean;
  isDismissed: boolean;
};
export type CameraSnapshot = {
  retrievedAt: string;
  observations: CameraObservation[];
  // Существующий API пропускает нечитаемые meta.json и не доказывает непрерывность записи.
  completeness: 'unknown';
};
export type LiveReconciliation = {
  schemaVersion: 1;
  shift: ShiftKey;
  dataset: ReconciliationDataset;
  state: DemoState;
  source: {
    snapshot: CameraSnapshot | null;
    error: string | null;
    attemptedAt: string | null;
    missingIds: string[];
    changedIds: string[];
  };
  paperConfirmed: boolean;
  paperImageId?: string;
  reviewFinishedAt: string | null;
};
