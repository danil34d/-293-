"use client";

import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BookCheck, Calendar, AlertTriangle } from 'lucide-react';

interface WashLogTabsProps {
  washLogContent: ReactNode;
  shiftsContent: ReactNode;
  violationsContent: ReactNode;
}

export function WashLogTabs({ washLogContent, shiftsContent, violationsContent }: WashLogTabsProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Журнал моек</h1>

      <Tabs defaultValue="wash-log" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="wash-log" className="flex items-center gap-2">
            <BookCheck className="h-4 w-4" />
            Журнал моек
          </TabsTrigger>
          <TabsTrigger value="shifts" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Смены
          </TabsTrigger>
          <TabsTrigger value="violations" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Нарушения
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wash-log">
          {washLogContent}
        </TabsContent>

        <TabsContent value="shifts">
          {shiftsContent}
        </TabsContent>

        <TabsContent value="violations">
          {violationsContent}
        </TabsContent>
      </Tabs>
    </div>
  );
}
