export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getReportById } from "@/lib/data";
import { ReportDetailClient } from "../components/ReportDetailClient";

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const report = await getReportById(params.id);
  if (!report) {
    notFound();
  }

  return (
    <div className="reports px-4 pb-12 max-w-[920px] mx-auto">
      <ReportDetailClient report={report} />
    </div>
  );
}
