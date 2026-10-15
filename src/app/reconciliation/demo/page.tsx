import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/server-auth';
import ReconciliationDemo from '@/components/reconciliation/ReconciliationDemo';
import '@/components/reconciliation/reconciliation.css';

export const dynamic = 'force-dynamic';

export default function ReconciliationDemoPage() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) redirect('/login');
  return <ReconciliationDemo />;
}
