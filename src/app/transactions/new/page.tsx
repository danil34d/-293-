import { redirect } from 'next/navigation';

/**
 * Phase 41 / АРХ-#10: заглушка устранена.
 * Новые мойки оформляются через `/workstation` (kiosk-режим)
 * или через `/wash-log` журнал. Прямой формы создания транзакции не было.
 */
export default function NewTransactionRedirect() {
  redirect('/workstation');
}
