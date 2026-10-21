import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/server-auth';
import LiveReconciliation from '@/components/reconciliation/LiveReconciliation';
import '@/components/reconciliation/reconciliation.css';

export const dynamic = 'force-dynamic';
export default function ReconciliationPage() {
  if (requireAdmin() instanceof NextResponse) redirect('/login');
  return <LiveReconciliation />;
}
