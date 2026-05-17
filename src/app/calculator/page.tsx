import React from 'react';
import ChemicalCalculatorClient from './components/ChemicalCalculatorClient';
import { ProfitCalculator } from './components/ProfitCalculator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import '../../../src/styles/calculator.css';

/**
 * Phase 28a: добавлен Tabs — старый калькулятор химии остался,
 * добавлен новый ProfitCalculator (V2-#22) — общий симулятор прибыли.
 */
export default function CalculatorPage() {
  return (
    <div className="container mx-auto py-4 md:py-8 px-4">
      <div className="mb-4">
        <h1 className="text-[26px] font-bold text-slate-900 leading-tight">Калькулятор</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Симуляция расчётов. Ничего не сохраняется — параметры действуют только в этом окне.
        </p>
      </div>

      <Tabs defaultValue="profit" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="profit">💰 Прибыль с мойки</TabsTrigger>
          <TabsTrigger value="chemical">🧪 Химия и концентраты</TabsTrigger>
        </TabsList>

        <TabsContent value="profit">
          <ProfitCalculator />
        </TabsContent>

        <TabsContent value="chemical">
          <ChemicalCalculatorClient />
        </TabsContent>
      </Tabs>
    </div>
  );
}
