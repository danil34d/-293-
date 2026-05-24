"use client";

import * as React from "react";
import type { WashEvent, CounterAgent, Aggregator } from "@/types";
import { startOfMonth, endOfMonth } from "date-fns";
import { ClientAnalyticsExtras } from "./ClientAnalyticsExtras";

/**
 * Phase 28b: wrapper для ClientAnalyticsExtras —
 * по умолчанию период = текущий месяц.
 * Существующий ClientAnalyticsDashboard ниже имеет свой DateRange picker,
 * extras пока на фиксированном «месяц». Если нужно — можно вынести state наверх.
 */
export function ClientAnalyticsExtrasWrapper({
  washEvents,
  counterAgents,
  aggregators,
}: {
  washEvents: WashEvent[];
  counterAgents: CounterAgent[];
  aggregators: Aggregator[];
}) {
  const [periodFrom] = React.useState(() => startOfMonth(new Date()));
  const [periodTo] = React.useState(() => endOfMonth(new Date()));

  return (
    <ClientAnalyticsExtras
      washEvents={washEvents}
      counterAgents={counterAgents}
      aggregators={aggregators}
      periodFrom={periodFrom}
      periodTo={periodTo}
    />
  );
}
