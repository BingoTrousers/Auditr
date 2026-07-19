import type { AuditResult } from '@/lib/types';

export interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  result: AuditResult;
}
