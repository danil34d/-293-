/**
 * Phase 57a / multi-company seed + backfill.
 *
 * Создаёт 2 OurCompany (если ещё нет) и backfill всех existing записей.
 *
 * Запуск (на проде с DATA_SOURCE=postgres):
 *   DATABASE_URL=postgresql://... npx tsx prisma/seed-our-companies.ts
 *
 * Безопасно для повторного запуска — checks существование перед create.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANIES = [
  {
    id: 'oc_abanin_primary',
    shortName: 'ИП Абанин',
    fullName: 'Индивидуальный предприниматель Абанин',
    isPrimary: true,
    taxRegime: 'usn-6', // допущение — владелец уточнит
  },
  {
    id: 'oc_orlov',
    shortName: 'ИП Орлов К.Р.',
    fullName: 'Индивидуальный предприниматель Орлов К.Р.',
    isPrimary: false,
    taxRegime: 'usn-6', // допущение
  },
];

async function main() {
  console.log('Phase 57a seed: создание OurCompany + backfill...');

  // 1. Создать OurCompany записи (idempotent)
  for (const c of COMPANIES) {
    const existing = await prisma.ourCompany.findUnique({ where: { id: c.id } });
    if (existing) {
      console.log(`  [SKIP] OurCompany ${c.shortName} уже существует (id=${c.id})`);
      continue;
    }
    await prisma.ourCompany.create({ data: c });
    console.log(`  [OK] Создан ${c.shortName} (primary=${c.isPrimary})`);
  }

  const primaryId = COMPANIES.find((c) => c.isPrimary)!.id;
  const orlovId = COMPANIES.find((c) => !c.isPrimary)!.id;

  // 2. Backfill WashEvent.ourCompanyId
  const washBefore = await prisma.washEvent.count({ where: { ourCompanyId: null } });
  if (washBefore > 0) {
    const res = await prisma.washEvent.updateMany({
      where: { ourCompanyId: null },
      data: { ourCompanyId: primaryId },
    });
    console.log(`  [OK] Backfill WashEvent: ${res.count} записей → ${primaryId}`);
  } else {
    console.log('  [SKIP] WashEvent: все уже имеют ourCompanyId');
  }

  // 3. Backfill Invoice.ourCompanyId
  const invBefore = await prisma.invoice.count({ where: { ourCompanyId: null } });
  if (invBefore > 0) {
    const res = await prisma.invoice.updateMany({
      where: { ourCompanyId: null },
      data: { ourCompanyId: primaryId },
    });
    console.log(`  [OK] Backfill Invoice: ${res.count} записей → ${primaryId}`);
  }

  // 4. Backfill Expense.ourCompanyId
  const expBefore = await prisma.expense.count({ where: { ourCompanyId: null } });
  if (expBefore > 0) {
    const res = await prisma.expense.updateMany({
      where: { ourCompanyId: null },
      data: { ourCompanyId: primaryId },
    });
    console.log(`  [OK] Backfill Expense: ${res.count} записей → ${primaryId}`);
  }

  // 5. Backfill ClientTransaction.ourCompanyId
  const ctBefore = await prisma.clientTransaction.count({ where: { ourCompanyId: null } });
  if (ctBefore > 0) {
    const res = await prisma.clientTransaction.updateMany({
      where: { ourCompanyId: null },
      data: { ourCompanyId: primaryId },
    });
    console.log(`  [OK] Backfill ClientTransaction: ${res.count} записей → ${primaryId}`);
  }

  // 6. Попытка автодетектить ЭкоФуд → ИП Орлов
  const ecofood = await prisma.counterAgent.findFirst({
    where: {
      OR: [
        { name: { contains: 'ЭкоФуд', mode: 'insensitive' } },
        { name: { contains: 'Икафут', mode: 'insensitive' } }, // legacy название в брифе
        { name: { contains: 'Эко Фуд', mode: 'insensitive' } },
      ],
    },
  });
  if (ecofood && !ecofood.preferredOurCompanyId) {
    await prisma.counterAgent.update({
      where: { id: ecofood.id },
      data: { preferredOurCompanyId: orlovId },
    });
    console.log(`  [OK] Контрагент «${ecofood.name}» (id=${ecofood.id}) → preferredOurCompanyId = ИП Орлов`);
  } else if (ecofood) {
    console.log(`  [SKIP] Контрагент «${ecofood.name}» уже имеет preferredOurCompanyId`);
  } else {
    console.log('  [INFO] Контрагент ЭкоФуд/Икафут в БД не найден — пропускаю автодетект');
  }

  console.log('Phase 57a seed: готово.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('SEED FAILED:', e);
    prisma.$disconnect();
    process.exit(1);
  });
