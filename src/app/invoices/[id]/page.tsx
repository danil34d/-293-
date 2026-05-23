export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getInvoiceById, getCounterAgentById, getOurCompanyById, getOurCompaniesData } from "@/lib/data";
import { InvoiceDetailClient } from "../components/InvoiceDetailClient";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const invoice = await getInvoiceById(params.id);
  if (!invoice) {
    notFound();
  }

  const [counterAgent, ourCompany] = await Promise.all([
    getCounterAgentById(invoice.counterAgentId).catch(() => null),
    // Phase 57c: ИП-исполнитель счёта. Если ourCompanyId не задан (legacy invoice) — primary.
    invoice.ourCompanyId
      ? getOurCompanyById(invoice.ourCompanyId).catch(() => null)
      : getOurCompaniesData().then(list => list.find(c => c.isPrimary && !c.archived) ?? null).catch(() => null),
  ]);

  return (
    <div className="invoices px-4 pb-12 max-w-[860px] mx-auto">
      <InvoiceDetailClient invoice={invoice} counterAgent={counterAgent} ourCompany={ourCompany} />
    </div>
  );
}
