'use client';

import type { Employee } from '@/types';
import { ZorinWorkstationConsole } from '@/components/employee/ZorinWorkstationConsole';

interface KioskOrderClientProps {
  box1Employees: Employee[];
  box2Employees: Employee[];
}

export function KioskOrderClient({ box1Employees, box2Employees }: KioskOrderClientProps) {
  return (
    <ZorinWorkstationConsole
      isKioskMode={true}
      scheduleByBox={{ box1: box1Employees, box2: box2Employees }}
    />
  );
}
