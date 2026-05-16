export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getInvoiceById, getCounterAgentById } from "@/lib/data";
import { InvoiceDetailClient } from "../components/InvoiceDetailClient";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const invoice = await getInvoiceById(params.id);
  if (!invoice) {
    notFound();
  }

  const counterAgent = await getCounterAgentById(invoice.counterAgentId).catch(() => null);

  return (
    <div className="invoices px-4 pb-12 max-w-[860px] mx-auto">
      <InvoiceDetailClient invoice={invoice} counterAgent={counterAgent} />
    </div>
  );
}
