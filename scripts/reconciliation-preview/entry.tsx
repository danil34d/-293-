import React from 'react';
import { createRoot } from 'react-dom/client';
import ReconciliationDemo from '../../src/components/reconciliation/ReconciliationDemo';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ReconciliationDemo /></React.StrictMode>);
