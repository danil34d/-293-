import { redirect } from 'next/navigation';

/**
 * Phase 41 / АРХ-#10: заглушка устранена.
 * Реальное редактирование транзакций идёт через `/wash-log/[id]/edit`
 * (WashEvent — единственный источник правды для cash/card/transfer моек).
 *
 * Этот URL остаётся валидным для существующих закладок — делаем redirect.
 */
export default function EditTransactionRedirect({ params }: { params: { id: string } }) {
  redirect(`/wash-log/${params.id}/edit`);
}
