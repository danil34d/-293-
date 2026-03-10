
'use client';

import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { TrendingUp } from 'lucide-react';

interface DailyEarning {
  date: string;
  earnings: number;
}

interface EarningsChartProps {
  data: DailyEarning[];
}

const chartConfig = {
  earnings: {
    label: 'Заработок',
    color: 'hsl(var(--primary))',
  },
};

export function EarningsChart({ data }: EarningsChartProps) {
  if (data.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Заработок по дням
        </CardTitle>
        <CardDescription>Динамика начислений за выбранный период.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-earnings)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--color-earnings)" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => value.slice(0, 5)} // e.g., "15.07"
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => `₽${value}`}
                />
                 <Tooltip
                    cursor={true}
                    content={<ChartTooltipContent
                        formatter={(value) => `${Number(value).toLocaleString('ru-RU')} руб.`}
                        indicator="dot"
                    />}
                />
                <Area 
                    type="monotone" 
                    dataKey="earnings" 
                    stroke="var(--color-earnings)" 
                    fillOpacity={1} 
                    fill="url(#colorEarnings)"
                    strokeWidth={2}
                />
            </AreaChart>
            </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
