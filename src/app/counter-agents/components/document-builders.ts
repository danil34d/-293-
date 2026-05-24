/**
 * Phase 59-doc (2026-05-24): программная генерация .docx документов.
 *
 * Все функции принимают агрегаты данных и возвращают `Document` из `docx`-пакета.
 * НЕ требуются template-файлы — структура и текст хардкодятся, реквизиты
 * подставляются из CounterAgent.companies[0] и OurCompany.
 *
 * Список генерируемых документов:
 *  1. buildContractDocx   — Договор № NN-MM/YY об оказании услуг по мойке
 *  2. buildAppendix1Docx  — Приложение №1 «Список автотранспорта»
 *  3. buildAppendix3Docx  — Приложение №3 «Прейскурант цен и перечень услуг»
 *  4. buildActDocx        — Акт оказанных услуг (за месяц)
 *
 * Приложение №2 «Ведомость учёта» = по сути MonthlyReport (уже есть отдельно).
 */

import {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  LevelFormat, convertInchesToTwip, PageOrientation,
} from 'docx';
import { format, addYears, startOfMonth, endOfMonth } from 'date-fns';
import type { CounterAgent, WashEvent, OurCompany } from '@/types';

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const formatMoney = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

// ─── Generic helpers ────────────────────────────────────────────────────────

/**
 * Стиль документа повторяет оригинальный шаблон ЭкоФуД:
 *  - Times New Roman 12pt
 *  - Justify (по ширине) по умолчанию для тела
 *  - Заголовки — стандартные H1/H2 Word
 *
 * Этот объект передаётся в Document.styles.default.document → применяется ко всему.
 */
const DOC_DEFAULT_STYLES = {
  default: {
    document: {
      run: {
        font: 'Times New Roman',
        size: 24, // 24 half-points = 12pt
      },
      paragraph: {
        spacing: { line: 276 }, // 1.15 line spacing
      },
    },
    heading1: {
      run: { font: 'Times New Roman', size: 32, bold: true },
      paragraph: { spacing: { before: 240, after: 120 } },
    },
    heading2: {
      run: { font: 'Times New Roman', size: 26, bold: true },
      paragraph: { spacing: { before: 240, after: 120 } },
    },
  },
};

/**
 * По умолчанию параграф ВЫРАВНИВАЕТ ПО ШИРИНЕ (как в оригинале).
 * Явное `align` overrides — например для центрирования заголовков.
 */
function p(text: string, opts: { bold?: boolean; size?: number; spacing?: { before?: number; after?: number }; heading?: any; align?: any; italic?: boolean } = {}): Paragraph {
  // Phase 59-doc-style: всегда явно задаём font+size — Word гарантированно применит.
  const size = opts.size ?? (opts.heading === HeadingLevel.HEADING_1 ? 32 : opts.heading === HeadingLevel.HEADING_2 ? 26 : 24);
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold ?? !!opts.heading, size, italics: opts.italic, font: 'Times New Roman' })],
    spacing: opts.spacing,
    heading: opts.heading,
    alignment: opts.align ?? (opts.heading ? AlignmentType.LEFT : AlignmentType.BOTH),
  });
}

function cell(text: string, opts: { bold?: boolean; right?: boolean; center?: boolean; shade?: boolean } = {}): TableCell {
  return new TableCell({
    shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' } : undefined,
    children: [
      new Paragraph({
        // Phase 59-doc-style: явно задаём font+size в TextRun чтобы Word точно применил
        // (style defaults иногда не пробрасываются в таблицы).
        children: [new TextRun({ text, bold: opts.bold, font: 'Times New Roman', size: 24 })],
        alignment: opts.right ? AlignmentType.RIGHT : opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      }),
    ],
  });
}

const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '666666' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
};

function makeTable(headers: string[], rows: string[][], opts: { rightCols?: number[]; centerCols?: number[]; widths?: number[] } = {}): Table {
  const right = new Set(opts.rightCols ?? []);
  const center = new Set(opts.centerCols ?? []);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, shade: true, right: right.has(i), center: center.has(i) })),
      }),
      ...rows.map(r =>
        new TableRow({
          children: r.map((v, i) => cell(v, { right: right.has(i), center: center.has(i) })),
        })
      ),
    ],
  });
}

// ─── Auto-detect contract number ─────────────────────────────────────────────

/**
 * Формат номера договора: NN-MM/YY.
 * NN = порядковый номер контрагента в этом месяце (для простоты — 01)
 * MM-YY = месяц и год создания
 */
export function generateContractNumber(date: Date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  return `01-${mm}/${yy}`;
}

// ─── 1. Договор ──────────────────────────────────────────────────────────────

export interface ContractOptions {
  agent: CounterAgent;
  ourCompany: OurCompany;
  contractNumber?: string;
  contractDate?: Date;
  /** Адрес мойки (где оказываются услуги). По умолчанию — Мокрово. */
  serviceAddress?: string;
}

export function buildContractDocx({ agent, ourCompany, contractNumber, contractDate, serviceAddress }: ContractOptions): Document {
  const number = contractNumber || generateContractNumber(contractDate);
  const date = contractDate || new Date();
  const expirationDate = addYears(date, 1);
  const expirationDateStr = `«${format(expirationDate, 'dd')}» ${MONTHS_GEN[expirationDate.getMonth()]} ${expirationDate.getFullYear()}`;
  const dateStr = format(date, 'dd.MM.yyyy');
  const address = serviceAddress || 'Владимирская область, Вязниковский р-он, д. Мокрово, д. 7';

  const customer = agent.companies?.[0] || ({} as any);
  const customerName = customer.companyName || agent.name;
  const customerSignatory = customer.ownerName || '___________';

  const ourName = ourCompany.fullName || ourCompany.shortName;
  const ourShortSignatory = ourCompany.shortName?.replace(/^ИП\s*/i, '').trim() + ' ___________' || '___________';

  const ourBank = [
    ourCompany.bankName ? `Наименование банка: ${ourCompany.bankName}` : '',
    ourCompany.settlementAccount ? `р/с ${ourCompany.settlementAccount}` : '',
    ourCompany.correspondentAccount ? `Кор/сч ${ourCompany.correspondentAccount}` : '',
    ourCompany.bik ? `БИК ${ourCompany.bik}` : '',
  ].filter(Boolean);

  const custBank = [
    customer.bankName ? `Наименование банка: ${customer.bankName}` : '',
    customer.settlementAccount ? `р/с ${customer.settlementAccount}` : '',
    customer.correspondentAccount ? `Кор/сч ${customer.correspondentAccount}` : '',
    customer.bik ? `БИК ${customer.bik}` : '',
  ].filter(Boolean);

  const children: any[] = [];

  // Title
  children.push(p(`ДОГОВОР № ${number}`, { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, spacing: { after: 100 } }));
  children.push(p('об оказании услуг по мойке и чистке автомобилей', { align: AlignmentType.CENTER, spacing: { after: 300 } }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `г. Вязники` }),
      new TextRun({ text: `                                                                       ${dateStr} г.` }),
    ],
    spacing: { after: 200 },
  }));

  // Preamble
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Индивидуальный предприниматель ' }),
      new TextRun({ text: ourName, bold: true }),
      new TextRun({ text: ', действующий на основании Свидетельства о государственной регистрации физического лица в качестве индивидуального предпринимателя, ИНН ' }),
      new TextRun({ text: ourCompany.inn || '___________', bold: true }),
      ...(ourCompany.ogrn ? [new TextRun({ text: ', ОГРНИП ' }), new TextRun({ text: ourCompany.ogrn, bold: true })] : []),
      new TextRun({ text: ', именуемый в дальнейшем «Исполнитель», с одной стороны, и ' }),
      new TextRun({ text: customerName, bold: true }),
      new TextRun({ text: ', именуемое в дальнейшем «Заказчик», с другой стороны, именуемые вместе и по отдельности «Стороны» заключили настоящий Договор № ' }),
      new TextRun({ text: number, bold: true }),
      new TextRun({ text: ' (далее по тексту Договор), о нижеследующем:' }),
    ],
    spacing: { after: 300 },
  }));

  // 1. ПРЕДМЕТ
  children.push(p('1. ПРЕДМЕТ ДОГОВОРА', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('1.1. По настоящему Договору Исполнитель обязуется оказывать Заказчику услуги по мойке и чистке автотранспорта (далее по тексту — «Услуги»), в порядке и на условиях, предусмотренных настоящим Договором в соответствии с Прейскурантом цен и перечнем Услуг (Приложение №3, являющееся неотъемлемой частью настоящего Договора), а Заказчик обязуется оплачивать Услуги, согласно настоящему Договору.'));
  children.push(p('1.2. Перечень автомобилей с указанием их марки, модели и государственных номерных знаков, принимаемых на обслуживание Исполнителем, содержится в Приложении № 1 к настоящему Договору «Список автотранспорта», которое является его неотъемлемой частью, и может быть изменено по письменному согласию Сторон.'));
  children.push(p('1.3. Стоимость услуг указана в Приложении № 3.'));
  children.push(p(`1.4. Услуги, указанные в п.1.1 настоящего Договора, оказываются на территории автомоечного комплекса, расположенного по адресу: ${address}.`));
  children.push(p('1.5. Услуги оказываются в установленные часы в порядке общей очереди.'));

  // 2. ПРАВА И ОБЯЗАННОСТИ
  children.push(p('2. ПРАВА И ОБЯЗАННОСТИ СТОРОН', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('2.1. Исполнитель:', { bold: true }));
  children.push(p('2.1.1. Оказывает Услуги в том объеме и по той цене, которые были согласованы Сторонами путем подписания Прейскуранта цен и перечня Услуг (Приложение № 3), которое является неотъемлемой частью настоящего Договора.'));
  children.push(p('2.1.2. Ведет учет оказанных Услуг, путем оформления Ведомости мойки автотранспорта Заказчика, обслуживаемого по настоящему Договору, по форме, прилагаемой к настоящему Договору (Приложение № 2 к настоящему Договору).'));
  children.push(p('2.2. Заказчик:', { bold: true }));
  children.push(p('2.2.1. Обязуется оплачивать услуги Исполнителя в размере и в порядке, установленные настоящим Договором.'));
  children.push(p('2.2.2. В случае изменений в Списке автотранспорта (Приложение № 1), обслуживаемых по настоящему Договору, предоставляет Исполнителю измененный Список не позднее 5 (Пяти) рабочих дней с момента таких изменений.'));
  children.push(p('2.2.3. В порядке и в сроки, установленные настоящим Договором, подписывает Акты оказанных услуг.'));

  // 3. ПОРЯДОК ОКАЗАНИЯ
  children.push(p('3. ПОРЯДОК ОКАЗАНИЯ УСЛУГ И ПОДПИСАНИЯ АКТОВ', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('3.1. Услуги должны соответствовать требованиям, правилам и нормативам, предусмотренным действующим законодательством Российской Федерации. При оказании услуг Исполнитель должен применять только сертифицированное оборудование, материалы и средства, обеспечивающие безопасность жизни и здоровья людей, и не причиняющие вреда автотранспорту.'));
  children.push(p('3.2. Услуги оказываются в отношении автотранспорта Заказчика, указанного в Списке автотранспорта (Приложение № 1).'));
  children.push(p('3.3. Исполнителем ведется Ведомость учета обслуженного автотранспорта Заказчика (Приложение № 2), в которой по каждому факту оказания услуги указываются сведения об автомобиле, дата, объем оказанных услуг и их стоимость.'));
  children.push(p('3.4. Отчетным периодом по настоящему Договору является календарный месяц.'));
  children.push(p('3.5. Ежемесячно не позднее 5 (Пятого) числа месяца, следующего за отчетным, Исполнитель составляет и направляет Заказчику подписанный Акт оказанных услуг. К Акту оказанных услуг Исполнитель прикладывает копию Ведомости мойки автотранспорта Заказчика и счет-фактуру.'));
  children.push(p('3.6. Заказчик в течение 3 (Трех) рабочих дней с даты получения Акта оказанных услуг подписывает и направляет его Исполнителю.'));
  children.push(p('3.7. В случае если Заказчик не согласен с данными о видах и объемах оказанных Услуг за отчетный период, он обязан в течение 2 (Двух) рабочих дней с даты получения Акта оказанных услуг представить мотивированный отказ от подписания с приложением подтверждающих документов. В противном случае Услуги в соответствующем отчетном периоде будут считаться оказанными, а Акт оказанных услуг подписанным.'));

  // 4. РАСЧЁТЫ
  children.push(p('4. УСЛОВИЯ И ПОРЯДОК РАСЧЕТОВ', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('4.1. Расчеты между сторонами осуществляются за фактически оказанные услуги один раз в месяц на основании выставленных счетов, актов приема-сдачи работ и актов сверки взаимных расчетов, путем перечисления денежных средств на расчетный счет Исполнителя в течение 5 (пяти) банковских дней с момента выставления счетов.'));
  children.push(p('4.2. По окончании календарного месяца стороны подписывают Акт выполненных работ.'));
  children.push(p('4.3. Исполнитель имеет право в течение срока действия настоящего Договора увеличить стоимость оказываемых услуг, письменно уведомив об этом Заказчика за 30 (тридцать) календарных дней до планируемого увеличения стоимости услуг.'));
  children.push(p('4.4. В случае увеличения стоимости услуг Заказчик имеет право отказаться от дальнейшего оказания услуг Исполнителем, письменно уведомив об этом Исполнителя в течение пяти календарных дней со дня поступления соответствующего уведомления.'));

  // 5. ОТВЕТСТВЕННОСТЬ
  children.push(p('5. ОТВЕТСТВЕННОСТЬ СТОРОН', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('5.1. В случае оказания Услуг (указанных в п. 1.1) ненадлежащего качества Исполнитель по требованию Заказчика за свой счет устраняет недостатки.'));
  children.push(p('5.2. Исполнитель не несет ответственности за:'));
  children.push(p('— Некачественное лакокрасочное покрытие и навесное оборудование автомобиля;'));
  children.push(p('— Не герметичность узлов и агрегатов автомобиля;'));
  children.push(p('— Неисправность электрооборудования автомобиля при мойке двигателя аппаратом высокого давления;'));
  children.push(p('— Перебои в работе двигателя после его мойки;'));
  children.push(p('— Оставленное имущество, документы, деньги и ценные вещи в автомобиле.'));
  children.push(p('5.3. В случае нарушения Заказчиком сроков оплаты по настоящему Договору Исполнитель вправе требовать уплаты пени в размере 0,5% за каждый календарный день просрочки путем направления требования (претензии) Заказчику.'));
  children.push(p('5.4. Пени, указанные в п.5.3. настоящего Договора, подлежат уплате в течение 10 (Десяти) календарных дней с момента получения Заказчиком требования (претензии) Исполнителя.'));

  // 6. ФОРС-МАЖОР
  children.push(p('6. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('6.1. Любая из Сторон освобождается от ответственности за неисполнение или ненадлежащее исполнение своих обязанностей по настоящему Договору в случае действия обстоятельств непреодолимой силы.'));
  children.push(p('6.2. Сторона, подвергшаяся действию обстоятельств непреодолимой силы, обязуется в течение 10 (Десяти) рабочих дней в письменной форме уведомить об этом другую Сторону.'));

  // 7. ПОРЯДОК ЗАКЛЮЧЕНИЯ
  children.push(p('7. ПОРЯДОК ЗАКЛЮЧЕНИЯ, ИЗМЕНЕНИЯ И РАСТОРЖЕНИЯ ДОГОВОРА', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p(`7.1. Настоящий Договор считается заключенным с момента его подписания Сторонами и действует до ${expirationDateStr} г. В случае если в период не менее чем за 10 (десять) календарных дней до истечения срока действия Договора ни одна из Сторон не заявит в письменном виде о своем намерении расторгнуть Договор, срок действия Договора считается пролонгированным на последующий календарный год. Количество пролонгаций не ограничивается.`));
  children.push(p('7.2. Все изменения и дополнения к настоящему Договору имеют юридическую силу с момента подписания Дополнительного соглашения обеими Сторонами.'));
  children.push(p('7.3. Каждая Сторона может в одностороннем порядке в любое время досрочно расторгнуть настоящий Договор, предупредив об этом другую Сторону за 15 (Пятнадцать) календарных дней до предполагаемой даты расторжения.'));
  children.push(p('7.4. Настоящий Договор составлен в 2 (Двух) экземплярах имеющих одинаковую юридическую силу, по одному экземпляру для каждой из Сторон.'));

  // 8. СПОРЫ
  children.push(p('8. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('8.1. Все споры или разногласия, возникающие между Сторонами в связи с исполнением настоящего Договора, разрешаются ими путем переговоров.'));
  children.push(p('8.2. В случае невозможности разрешения споров или разногласий путем переговоров они подлежат рассмотрению в Арбитражном суде г. Москвы в порядке, установленном законодательством Российской Федерации.'));

  // 9. ПРИЛОЖЕНИЯ
  children.push(p('9. ПРИЛОЖЕНИЯ К ДОГОВОРУ', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(p('9.1. К настоящему Договору прилагаются и являются его неотъемлемой частью:'));
  children.push(p('Приложение № 1 — Список транспорта Заказчика;'));
  children.push(p('Приложение № 2 — Ведомость учета обслуженного автотранспорта Заказчика;'));
  children.push(p('Приложение № 3 — Прейскурант цен и перечень услуг.'));

  // 10. РЕКВИЗИТЫ
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(p('10. РЕКВИЗИТЫ СТОРОН', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }));

  const reqRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          children: [
            p('Исполнитель:', { bold: true }),
            p(`${ourName}`, { bold: true }),
            ...(ourCompany.inn ? [p(`ИНН: ${ourCompany.inn}`)] : []),
            ...(ourCompany.ogrn ? [p(`ОГРНИП: ${ourCompany.ogrn}`)] : []),
            ...(ourCompany.legalAddress ? [p(`Адрес: ${ourCompany.legalAddress}`)] : []),
            p(' '),
            p('Банковские реквизиты:', { bold: true }),
            ...ourBank.map(line => p(line)),
            p(' '),
            ...((ourCompany as any).phone ? [p(`Тел.: ${(ourCompany as any).phone}`)] : []),
            ...((ourCompany as any).email ? [p(`e-mail: ${(ourCompany as any).email}`)] : []),
            p(' '),
            p(' '),
            p(`______________ ${ourShortSignatory}`),
          ],
        }),
        new TableCell({
          children: [
            p('Заказчик:', { bold: true }),
            p(`${customerName}`, { bold: true }),
            ...(customer.inn ? [p(`ИНН: ${customer.inn}`)] : []),
            ...(customer.kpp ? [p(`КПП: ${customer.kpp}`)] : []),
            ...(customer.legalAddress ? [p(`Адрес: ${customer.legalAddress}`)] : []),
            p(' '),
            p('Банковские реквизиты:', { bold: true }),
            ...custBank.map(line => p(line)),
            p(' '),
            ...(customer.phone ? [p(`Тел.: ${customer.phone}`)] : []),
            ...(customer.email ? [p(`e-mail: ${customer.email}`)] : []),
            p(' '),
            p(' '),
            p(`______________ ${customerSignatory}`),
          ],
        }),
      ],
    }),
  ];

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: reqRows,
  }));

  return new Document({
    creator: 'Carwash Manager',
    styles: DOC_DEFAULT_STYLES,
    title: `Договор № ${number} ${customerName}`,
    sections: [{ properties: {}, children }],
  });
}

// ─── 2. Приложение №1 «Список автотранспорта» ───────────────────────────────

export function buildAppendix1Docx({ agent, ourCompany, contractNumber, contractDate }: ContractOptions): Document {
  const number = contractNumber || generateContractNumber(contractDate);
  const date = contractDate || new Date();
  const dateStr = format(date, 'dd.MM.yyyy');
  const customer = agent.companies?.[0] || ({} as any);
  const customerName = customer.companyName || agent.name;

  const children: any[] = [];
  children.push(p('Приложение № 1', { align: AlignmentType.RIGHT }));
  children.push(p(`к Договору № ${number} от ${dateStr} г.`, { align: AlignmentType.RIGHT, spacing: { after: 300 } }));
  children.push(p('СПИСОК АВТОТРАНСПОРТА ЗАКАЗЧИКА', { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, spacing: { after: 200 } }));
  children.push(p(`Заказчик: ${customerName}`, { spacing: { after: 200 } }));

  const cars = agent.cars || [];
  if (cars.length === 0) {
    children.push(p('Список пуст. Заполните автопарк в разделе /counter-agents → Автопарк.', { italic: true }));
  } else {
    const rows = cars.map((c, i) => [
      String(i + 1),
      c.licensePlate,
      (c as any).mark || '',
      (c as any).category || '',
    ]);
    children.push(makeTable(['№', 'Гос. номер', 'Марка / модель', 'Категория'], rows, { centerCols: [0, 1] }));
  }

  children.push(p(' '));
  children.push(p('Список может быть изменен по письменному согласию Сторон в течение срока действия Договора.', { spacing: { before: 300, after: 300 } }));

  const ourShortSig = ourCompany.shortName?.replace(/^ИП\s*/i, '').trim() + ' ___________' || '___________';
  const customerSig = customer.ownerName || '___________';

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [p('Исполнитель:', { bold: true }), p(' '), p(`______________ ${ourShortSig}`)] }),
          new TableCell({ children: [p('Заказчик:', { bold: true }), p(' '), p(`______________ ${customerSig}`)] }),
        ],
      }),
    ],
  }));

  return new Document({
    creator: 'Carwash Manager',
    styles: DOC_DEFAULT_STYLES,
    title: `Приложение №1 ${customerName}`,
    sections: [{ properties: {}, children }],
  });
}

// ─── 3. Приложение №3 «Прейскурант» ──────────────────────────────────────────

export function buildAppendix3Docx({ agent, ourCompany, contractNumber, contractDate }: ContractOptions): Document {
  const number = contractNumber || generateContractNumber(contractDate);
  const date = contractDate || new Date();
  const dateStr = format(date, 'dd.MM.yyyy');
  const customer = agent.companies?.[0] || ({} as any);
  const customerName = customer.companyName || agent.name;

  const children: any[] = [];
  children.push(p('Приложение № 3', { align: AlignmentType.RIGHT }));
  children.push(p(`к Договору № ${number} от ${dateStr} г.`, { align: AlignmentType.RIGHT, spacing: { after: 300 } }));
  children.push(p('ПРЕЙСКУРАНТ ЦЕН И ПЕРЕЧЕНЬ УСЛУГ', { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, spacing: { after: 200 } }));
  children.push(p(`Заказчик: ${customerName}`, { spacing: { after: 200 } }));

  const services = agent.priceList || [];
  if (services.length === 0) {
    children.push(p('Прайс-лист пуст. Заполните услуги в разделе /counter-agents → Прайс и услуги.', { italic: true }));
  } else {
    const rows = services.map((s, i) => [
      String(i + 1),
      s.serviceName,
      `${(s.price ?? 0).toLocaleString('ru-RU')}`,
    ]);
    children.push(makeTable(['№', 'Наименование услуги', 'Стоимость, руб.'], rows, { centerCols: [0], rightCols: [2] }));
    // Phase 59-doc-style: внутренние split-детали НЕ показываем заказчику.
    // Прайс заказчик видит как обычный список услуг, а внутренний расчёт водителю —
    // это наша внутренняя кухня и в договоре не светится.
  }

  children.push(p(' '));

  const ourShortSig = ourCompany.shortName?.replace(/^ИП\s*/i, '').trim() + ' ___________' || '___________';
  const customerSig = customer.ownerName || '___________';

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [p('Исполнитель:', { bold: true }), p(' '), p(`______________ ${ourShortSig}`)] }),
          new TableCell({ children: [p('Заказчик:', { bold: true }), p(' '), p(`______________ ${customerSig}`)] }),
        ],
      }),
    ],
  }));

  return new Document({
    creator: 'Carwash Manager',
    styles: DOC_DEFAULT_STYLES,
    title: `Приложение №3 Прейскурант ${customerName}`,
    sections: [{ properties: {}, children }],
  });
}

// ─── 4. Ведомость учёта обслуженного автотранспорта (за месяц / per volume) ──

/** Одна строка ведомости — можно собрать из washes автоматически или передать
 *  уже отредактированную (например, после inline-edit в preview-диалоге). */
export interface VedomostRow {
  date: string;            // dd.MM.yyyy
  mark: string;            // марка/категория автомобиля
  plate: string;           // ГРН
  services: string;        // перечень услуг через ; (или что захотел пользователь)
  totalRub: number;        // сумма за строку, руб
  driver: string;          // ФИО водителя (или пусто)
}

export interface VedomostOptions {
  agent: CounterAgent;
  ourCompany: OurCompany;
  /** Источник строк: либо передать сырые WashEvent (тогда build сам соберёт), либо уже-отредактированные rows. */
  washes?: WashEvent[];
  rows?: VedomostRow[];
  year: number;
  monthIdx: number;
  monthName: string;
  contractNumber?: string;
  contractDate?: Date;
  /** Если в месяце моек больше, чем влезает в одну ведомость — указать том. По умолчанию 1. */
  volumeNumber?: number;
  /** Если true — таблица пустая (для ручного заполнения водителем). По умолчанию false — заполнена. */
  blank?: boolean;
}

/**
 * Собрать строки из массива WashEvent. Экспортируется для reuse в preview-диалоге.
 */
export function vedomostRowsFromWashes(agent: CounterAgent, washes: WashEvent[]): VedomostRow[] {
  const carInfoMap = new Map<string, { mark?: string; category?: string }>();
  (agent.cars || []).forEach(c => {
    carInfoMap.set(c.licensePlate, { mark: (c as any).mark, category: (c as any).category });
  });
  return washes
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(w => {
      const info = carInfoMap.get(w.vehicleNumber || '') || {};
      const mark = info.mark || info.category || '—';
      const svcList: string[] = [];
      if (w.services?.main?.serviceName) svcList.push(w.services.main.serviceName);
      if (Array.isArray(w.services?.additional)) {
        const groups = new Map<string, number>();
        w.services.additional.forEach(s => {
          if (s.serviceName) groups.set(s.serviceName, (groups.get(s.serviceName) ?? 0) + 1);
        });
        groups.forEach((cnt, name) => svcList.push(cnt > 1 ? `${cnt}× ${name}` : name));
      }
      const driverComment = (w.driverComments && w.driverComments[0]?.text) || '';
      return {
        date: format(new Date(w.timestamp), 'dd.MM.yyyy'),
        mark,
        plate: w.vehicleNumber || '',
        services: svcList.join('; '),
        totalRub: w.totalAmount ?? 0,
        driver: driverComment,
      };
    });
}

export function buildVedomostDocx({
  agent, ourCompany, washes, rows: rowsInput, year, monthIdx, monthName,
  contractNumber, contractDate, volumeNumber, blank,
}: VedomostOptions): Document {
  const cnum = contractNumber || generateContractNumber(contractDate);
  const cdate = contractDate || new Date();
  const contractDateStr = format(cdate, 'dd.MM.yyyy');
  const customer = agent.companies?.[0] || ({} as any);
  const customerName = customer.companyName || agent.name;
  const volSuffix = volumeNumber && volumeNumber > 1 ? ` (том ${volumeNumber})` : '';

  // Источник строк: editable rows или auto-собранные из washes
  const sourceRows: VedomostRow[] = rowsInput ?? (washes ? vedomostRowsFromWashes(agent, washes) : []);

  const children: any[] = [];

  children.push(p(`Ведомость учёта обслуженного автотранспорта Заказчика${volSuffix}`, {
    heading: HeadingLevel.HEADING_1,
    align: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));
  children.push(p(`по Договору на оказание услуг № ${cnum} от ${contractDateStr} г.`, {
    align: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));
  children.push(p(`Период: ${monthName} ${year} г.`, {
    align: AlignmentType.CENTER,
    bold: true,
    spacing: { after: 300 },
  }));

  // Готовим строки
  const headerCells = [
    cell('Дата', { bold: true, shade: true, center: true }),
    cell('Марка автомобиля', { bold: true, shade: true, center: true }),
    cell('Гос. номер автомобиля', { bold: true, shade: true, center: true }),
    cell('Перечень выполненных работ', { bold: true, shade: true, center: true }),
    cell('Стоимость, руб.', { bold: true, shade: true, center: true }),
    cell('ФИО водителя', { bold: true, shade: true, center: true }),
    cell('Подпись водителя / уполномоченного лица', { bold: true, shade: true, center: true }),
  ];

  const dataRows: TableRow[] = [];
  // Helper: Phase 59-doc-vedomost-print — cantSplit запрещает разрыв строки между страницами
  function makeRow(cells: TableCell[]): TableRow {
    return new TableRow({ children: cells, cantSplit: true });
  }
  if (blank) {
    // 15 пустых строк — комфортно влезает на A4 landscape с шапкой и подписями
    for (let i = 0; i < 15; i++) {
      dataRows.push(makeRow([
        cell(' '), cell(' '), cell(' '), cell(' '),
        cell(' ', { right: true }), cell(' '), cell(' '),
      ]));
    }
  } else {
    sourceRows.forEach(r => {
      dataRows.push(makeRow([
        cell(r.date, { center: true }),
        cell(r.mark),
        cell(r.plate),
        cell(r.services),
        // Phase 59-doc-vedomost-blank: 0 → пусто (заполняется руками для бланка/расчёта по факту)
        cell(r.totalRub > 0 ? r.totalRub.toLocaleString('ru-RU') : ' ', { right: true }),
        cell(r.driver),
        cell(' '),
      ]));
    });
    const totalCalc = sourceRows.reduce((s, r) => s + (r.totalRub ?? 0), 0);
    // Итого показываем только если есть реальные суммы (т.е. это не пустой бланк)
    if (sourceRows.length > 0 && totalCalc > 0) {
      dataRows.push(makeRow([
        cell('Итого:', { bold: true, shade: true }),
        cell(' ', { shade: true }),
        cell(' ', { shade: true }),
        cell(` ${sourceRows.length} моек`, { shade: true, right: true }),
        cell(totalCalc.toLocaleString('ru-RU'), { bold: true, shade: true, right: true }),
        cell(' ', { shade: true }),
        cell(' ', { shade: true }),
      ]));
    }
  }

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [new TableRow({ tableHeader: true, children: headerCells }), ...dataRows],
  }));

  children.push(p(' ', { spacing: { after: 300 } }));

  // Подписи
  const ourShortSig = ourCompany.shortName?.replace(/^ИП\s*/i, '').trim() + ' ___________' || '___________';
  const customerSig = customer.ownerName || '___________';

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              p('Исполнитель:', { bold: true }),
              p(ourCompany.shortName, { bold: true }),
              p(' '),
              p(`______________ ${ourShortSig}`),
            ],
          }),
          new TableCell({
            children: [
              p('Заказчик:', { bold: true }),
              p(customerName, { bold: true }),
              p(' '),
              p(`______________ ${customerSig}`),
            ],
          }),
        ],
      }),
    ],
  }));

  return new Document({
    creator: 'Carwash Manager',
    styles: DOC_DEFAULT_STYLES,
    title: `Ведомость ${customerName} ${monthName} ${year}${volSuffix}`,
    sections: [{
      properties: {
        // Phase 59-doc-vedomost-print: A4 LANDSCAPE для ведомости (7 колонок не влезают в портрет)
        page: {
          size: {
            orientation: PageOrientation.LANDSCAPE,
            // A4 в twips: 11906 × 16838. В landscape — swap.
            width: 16838,
            height: 11906,
          },
          margin: {
            top: 720,    // 0.5 inch
            right: 720,
            bottom: 720,
            left: 720,
          },
        },
      },
      children,
    }],
  });
}

// ─── 5. Акт оказанных услуг (за месяц) ───────────────────────────────────────

export interface ActOptions {
  agent: CounterAgent;
  ourCompany: OurCompany;
  washes: WashEvent[];
  year: number;
  monthIdx: number;
  monthName: string;
  contractNumber?: string;
  contractDate?: Date;
  actNumber?: string;
}

export function buildActDocx({ agent, ourCompany, washes, year, monthIdx, monthName, contractNumber, contractDate, actNumber }: ActOptions): Document {
  const cnum = contractNumber || generateContractNumber(contractDate);
  const cdate = contractDate || new Date();
  const actDate = endOfMonth(new Date(year, monthIdx));
  const dateStr = format(actDate, 'dd.MM.yyyy');
  const contractDateStr = format(cdate, 'dd.MM.yyyy');
  const periodStart = startOfMonth(new Date(year, monthIdx));
  const periodEnd = endOfMonth(new Date(year, monthIdx));
  const number = actNumber || `АКТ-${String(monthIdx + 1).padStart(2, '0')}-${String(year).slice(2)}`;

  const customer = agent.companies?.[0] || ({} as any);
  const customerName = customer.companyName || agent.name;
  const ourName = ourCompany.fullName || ourCompany.shortName;

  const total = washes.reduce((s, w) => s + (w.totalAmount ?? 0), 0);

  const children: any[] = [];

  children.push(p(`АКТ № ${number}`, { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, spacing: { after: 100 } }));
  children.push(p('сдачи-приёмки оказанных услуг', { align: AlignmentType.CENTER, spacing: { after: 300 } }));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'г. Вязники' }),
      new TextRun({ text: `                                                                       ${dateStr} г.` }),
    ],
    spacing: { after: 200 },
  }));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Исполнитель: ' }),
      new TextRun({ text: ourName, bold: true }),
      new TextRun({ text: `, ИНН ${ourCompany.inn || '_____'}` }),
      ...(ourCompany.ogrn ? [new TextRun({ text: `, ОГРНИП ${ourCompany.ogrn}` })] : []),
    ],
    spacing: { after: 100 },
  }));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Заказчик: ' }),
      new TextRun({ text: customerName, bold: true }),
      new TextRun({ text: `, ИНН ${customer.inn || '_____'}` }),
      ...(customer.kpp ? [new TextRun({ text: `, КПП ${customer.kpp}` })] : []),
    ],
    spacing: { after: 100 },
  }));

  children.push(p(`Договор: № ${cnum} от ${contractDateStr} г.`, { spacing: { after: 100 } }));
  children.push(p(`Отчётный период: ${format(periodStart, 'dd.MM.yyyy')} — ${format(periodEnd, 'dd.MM.yyyy')}`, { spacing: { after: 300 } }));

  children.push(p('Исполнитель оказал, а Заказчик принял следующие услуги:', { spacing: { after: 200 } }));

  // Aggregate services
  const serviceCounts = new Map<string, { count: number; price: number; total: number }>();
  washes.forEach(w => {
    const list = [w.services?.main, ...(w.services?.additional || [])].filter(Boolean) as any[];
    list.forEach(s => {
      if (!s.serviceName) return;
      const ex = serviceCounts.get(s.serviceName);
      if (ex) {
        ex.count += 1;
        ex.total += s.price ?? 0;
      } else {
        serviceCounts.set(s.serviceName, { count: 1, price: s.price ?? 0, total: s.price ?? 0 });
      }
    });
  });

  if (serviceCounts.size === 0) {
    children.push(p('Услуг за период не оказывалось.', { italic: true }));
  } else {
    const rows = Array.from(serviceCounts.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, info], idx) => [
        String(idx + 1),
        name,
        String(info.count),
        formatMoney(info.price).replace(' ₽', ''),
        formatMoney(info.total).replace(' ₽', ''),
      ]);
    rows.push(['', 'ИТОГО', '', '', formatMoney(total).replace(' ₽', '')]);
    children.push(makeTable(
      ['№', 'Наименование услуги', 'Кол-во', 'Цена, руб.', 'Сумма, руб.'],
      rows,
      { centerCols: [0, 2], rightCols: [3, 4] }
    ));
  }

  children.push(p(' '));
  children.push(p(`Всего оказано услуг на сумму ${formatMoney(total)}. Без НДС.`, { bold: true, spacing: { before: 200, after: 200 } }));
  children.push(p('Услуги оказаны полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.', { spacing: { after: 400 } }));

  // Подписи
  const ourShortSig = ourCompany.shortName?.replace(/^ИП\s*/i, '').trim() + ' ___________' || '___________';
  const customerSig = customer.ownerName || '___________';

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [p('От Исполнителя:', { bold: true }), p(' '), p(`______________ ${ourShortSig}`), p('М.П.')] }),
          new TableCell({ children: [p('От Заказчика:', { bold: true }), p(' '), p(`______________ ${customerSig}`), p('М.П.')] }),
        ],
      }),
    ],
  }));

  return new Document({
    creator: 'Carwash Manager',
    styles: DOC_DEFAULT_STYLES,
    title: `Акт ${number} ${customerName} ${monthName} ${year}`,
    sections: [{ properties: {}, children }],
  });
}
