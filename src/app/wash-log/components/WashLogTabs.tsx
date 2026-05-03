"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BookCheck, Calendar, AlertTriangle, Camera } from 'lucide-react';

interface WashLogTabsProps {
  washLogContent: ReactNode;
  shiftsContent: ReactNode;
  violationsContent: ReactNode;
}

export function WashLogTabs({ washLogContent, shiftsContent, violationsContent }: WashLogTabsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Журнал моек</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/wash-log/unprocessed" className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Неоформленные мойки
          </Link>
        </Button>
      </div>

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
