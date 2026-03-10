import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const dataDir = path.join(root, 'data');

const dirsToReset = ['wash-events', 'client-transactions', 'employee-transactions', 'expenses', 'stock-movements'];

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf-8'));
const writeJson = async (p, v) => fs.writeFile(p, JSON.stringify(v, null, 2), 'utf-8');

async function clearDir(dir) {
  const full = path.join(dataDir, dir);
  await fs.mkdir(full, { recursive: true });
  const files = await fs.readdir(full);
  await Promise.all(files.filter((f) => f.endsWith('.json')).map((f) => fs.unlink(path.join(full, f))));
}

function iso(baseDate, dayOffset, hour) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  for (const dir of dirsToReset) await clearDir(dir);

  const invPath = path.join(dataDir, 'inventory.json');
  const inv = await readJson(invPath);
  inv.chemicalStockGrams = 0;
  await writeJson(invPath, inv);

  const aggDir = path.join(dataDir, 'aggregators');
  const aggFiles = (await fs.readdir(aggDir)).filter((f) => f.endsWith('.json'));
  for (const f of aggFiles) {
    const p = path.join(aggDir, f);
    const d = await readJson(p);
    d.balance = 0;
    await writeJson(p, d);
  }

  const agentDir = path.join(dataDir, 'counter-agents');
  const agentFiles = (await fs.readdir(agentDir)).filter((f) => f.endsWith('.json'));
  for (const f of agentFiles) {
    const p = path.join(agentDir, f);
    const d = await readJson(p);
    d.balance = 0;
    await writeJson(p, d);
  }

  const employees = (await Promise.all((await fs.readdir(path.join(dataDir, 'employees'))).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dataDir, 'employees', f))))).filter((e) => e.username !== 'admin');
  const workers = employees.slice(0, 2);

  const retail = await readJson(path.join(dataDir, 'retail-price-list.json'));
  const aggregators = await Promise.all(aggFiles.map((f) => readJson(path.join(aggDir, f))));
  const agents = await Promise.all(agentFiles.map((f) => readJson(path.join(agentDir, f))));

  const agg = aggregators.find((a) => a.id === 'agg_ds') || aggregators.find((a) => (a.priceLists || []).length > 0);
  const agent = agents.find((a) => a.id === 'agent_1750607702906_toptrans') || agents.find((a) => (a.priceList || []).length > 0);
  const aggList = (agg.priceLists || []).find((p) => p.name === agg.activePriceListName) || (agg.priceLists || [])[0];

  const retailMain = retail.mainPriceList[3] || retail.mainPriceList[0];
  const retailExtra = retail.additionalPriceList[0];
  const aggService = aggList.services[0];
  const agentService = (agent.priceList || [])[0];

  const baseDate = new Date('2026-02-03T08:00:00.000Z');
  const methods = ['cash', 'card', 'transfer', 'counterAgentContract', 'aggregator'];
  const washDir = path.join(dataDir, 'wash-events');
  const movDir = path.join(dataDir, 'stock-movements');

  let idx = 1;
  let chemicalBalance = 0;
  let agentWashTotal = 0;
  let aggWashTotal = 0;
  const washes = [];

  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot < 2; slot++) {
      const method = methods[(day + slot) % methods.length];
      const isRetail = method === 'cash' || method === 'card' || method === 'transfer';
      const isAgg = method === 'aggregator';
      const mainService = { ...(isRetail ? retailMain : (isAgg ? aggService : agentService)) };
      const additional = isRetail ? [{ ...retailExtra }] : [];
      if (!mainService.chemicalConsumption) mainService.chemicalConsumption = 700;

      const totalAmount = Number(mainService.price) + (isRetail ? Number(retailExtra.price) : 0);
      const acquiringFee = method === 'card' ? Math.round(totalAmount * 0.012 * 100) / 100 : 0;
      const netAmount = totalAmount - acquiringFee;
      const chemicalConsumptionGrams = Number(mainService.chemicalConsumption || 0) + additional.reduce((s, a) => s + Number(a.chemicalConsumption || 0), 0);
      const chemicalCostRub = Math.round((chemicalConsumptionGrams / 1000) * 150 * 100) / 100;

      const ev = {
        id: `we_phase2_${String(idx).padStart(3, '0')}`,
        timestamp: iso(baseDate, day, 8 + slot * 5),
        vehicleNumber: `A${100 + idx}BC777`,
        employeeIds: [workers[day % 2].id, workers[(day + 1) % 2].id],
        paymentMethod: method,
        sourceId: isAgg ? agg.id : (method === 'counterAgentContract' ? agent.id : undefined),
        sourceName: isAgg ? agg.name : (method === 'counterAgentContract' ? agent.name : undefined),
        priceListName: isAgg ? aggList.name : undefined,
        totalAmount,
        netAmount,
        acquiringFee,
        services: { main: mainService, additional },
        chemicalConsumptionGrams,
        chemicalCostRub,
      };

      washes.push(ev);
      await writeJson(path.join(washDir, `${ev.id}.json`), ev);

      chemicalBalance -= chemicalConsumptionGrams;
      const mov = {
        id: `mov_phase2_${String(idx).padStart(3, '0')}`,
        materialId: 'mat_chemical_main',
        type: 'consumption',
        amount: -chemicalConsumptionGrams,
        balanceAfter: chemicalBalance,
        date: ev.timestamp,
        description: `Автосписание при мойке #${ev.id}`,
        relatedEntityType: 'wash_event',
        relatedEntityId: ev.id,
        employeeId: ev.employeeIds[0],
      };
      await writeJson(path.join(movDir, `${mov.id}.json`), mov);

      if (method === 'counterAgentContract') agentWashTotal += totalAmount;
      if (method === 'aggregator') aggWashTotal += totalAmount;
      idx += 1;
    }
  }

  const expenses = [
    { id: 'exp_phase2_001', date: '2026-02-04T09:00:00.000Z', category: 'Хозрасходы', description: 'Расходники', amount: 5000 },
    { id: 'exp_phase2_002', date: '2026-02-06T10:00:00.000Z', category: 'Закупка химии', description: 'Шампунь', amount: 12000, quantity: 80, unit: 'кг', pricePerUnit: 150 },
    { id: 'exp_phase2_003', date: '2026-02-08T11:00:00.000Z', category: 'Ремонт', description: 'Мелкий ремонт', amount: 3000 },
  ];
  for (const exp of expenses) {
    await writeJson(path.join(dataDir, 'expenses', `${exp.id}.json`), exp);
  }

  chemicalBalance += 80000; // expense purchase 80kg
  inv.chemicalStockGrams = chemicalBalance;
  await writeJson(invPath, inv);

  const tx1 = [
    { id: 'txn_phase2_001', employeeId: workers[0].id, date: '2026-02-08T18:00:00.000Z', type: 'payment', amount: 4000, description: 'Выплата за неделю' },
    { id: 'txn_phase2_002', employeeId: workers[0].id, date: '2026-02-08T18:10:00.000Z', type: 'bonus', amount: 1500, description: 'Премия за качество' },
  ];
  const tx2 = [
    { id: 'txn_phase2_003', employeeId: workers[1].id, date: '2026-02-08T18:20:00.000Z', type: 'payment', amount: 2500, description: 'Выплата за неделю' },
    { id: 'txn_phase2_004', employeeId: workers[1].id, date: '2026-02-08T18:30:00.000Z', type: 'loan', amount: 1000, description: 'Аванс в долг' },
  ];
  await writeJson(path.join(dataDir, 'employee-transactions', `${workers[0].id}.json`), tx1);
  await writeJson(path.join(dataDir, 'employee-transactions', `${workers[1].id}.json`), tx2);

  const agentPayment = { id: 'client_txn_phase2_001', clientId: agent.id, date: '2026-02-09T12:00:00.000Z', type: 'payment', amount: 3000, description: 'Оплата по договору' };
  const aggPayment = { id: 'client_txn_phase2_002', clientId: agg.id, date: '2026-02-09T12:30:00.000Z', type: 'payment', amount: 2000, description: 'Частичная оплата' };
  await writeJson(path.join(dataDir, 'client-transactions', `${agent.id}.json`), [agentPayment]);
  await writeJson(path.join(dataDir, 'client-transactions', `${agg.id}.json`), [aggPayment]);

  const refreshedAgentPath = path.join(agentDir, `${agent.id}.json`);
  const refreshedAggPath = path.join(aggDir, `${agg.id}.json`);
  const refreshedAgent = await readJson(refreshedAgentPath);
  const refreshedAgg = await readJson(refreshedAggPath);
  refreshedAgent.balance = -agentWashTotal + agentPayment.amount;
  refreshedAgg.balance = -aggWashTotal + aggPayment.amount;
  await writeJson(refreshedAgentPath, refreshedAgent);
  await writeJson(refreshedAggPath, refreshedAgg);

  const totalRevenue = washes.reduce((s, e) => s + (e.netAmount ?? e.totalAmount), 0);
  const operationalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const salaryPayments = [...tx1, ...tx2].filter((t) => t.type === 'payment' || t.type === 'bonus').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = operationalExpenses + salaryPayments;
  const profit = totalRevenue - totalExpenses;

  const report = {
    period: '2026-02-03..2026-02-09',
    workers: workers.map((w) => ({ id: w.id, fullName: w.fullName })),
    totals: {
      washCount: washes.length,
      totalRevenue,
      operationalExpenses,
      salaryPayments,
      totalExpenses,
      profit,
      chemicalStockGrams: chemicalBalance,
    },
    balances: {
      agentId: agent.id,
      expectedAgentBalance: -agentWashTotal + agentPayment.amount,
      actualAgentBalance: refreshedAgent.balance,
      aggId: agg.id,
      expectedAggBalance: -aggWashTotal + aggPayment.amount,
      actualAggBalance: refreshedAgg.balance,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
