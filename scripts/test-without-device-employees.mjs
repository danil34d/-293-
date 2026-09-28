// Sanity test: withoutDeviceEmployees (src/lib/data/prisma-helpers.ts) убирает терминал
// из исполнителей мойки по сырой роли из БД.
// Запуск: node --experimental-strip-types scripts/test-without-device-employees.mjs
import assert from 'node:assert/strict';
import { withoutDeviceEmployees } from '../src/lib/data/prisma-helpers.ts';

// Фейковый tx: хранит сотрудников и честно выполняет where { id: { in }, role: { in } }
function fakeTx(employees) {
  return {
    employee: {
      async findMany({ where }) {
        return employees
          .filter((e) => where.id.in.includes(e.id) && where.role.in.includes(e.role))
          .map(({ id }) => ({ id }));
      },
    },
  };
}

const tx = fakeTx([
  { id: 'emp_ivan', role: 'employee' },
  { id: 'emp_petr', role: 'employee' },
  { id: 'emp_kiosk', role: 'kiosk1' },
  { id: 'emp_old_kiosk', role: 'kiosk' },
  { id: 'emp_manager_admin', role: 'admin' },
]);

const warn = console.warn;
console.warn = () => {};
try {
  // Случай из прода (Y238PA152, 08.08): два мойщика + терминал
  assert.deepEqual(await withoutDeviceEmployees(tx, ['emp_ivan', 'emp_kiosk', 'emp_petr']), ['emp_ivan', 'emp_petr']);
  // Обе роли-устройства
  assert.deepEqual(await withoutDeviceEmployees(tx, ['emp_old_kiosk', 'emp_ivan']), ['emp_ivan']);
  // Только терминал → пусто, а не терминал
  assert.deepEqual(await withoutDeviceEmployees(tx, ['emp_kiosk']), []);
  // Админ — живой человек, остаётся
  assert.deepEqual(await withoutDeviceEmployees(tx, ['emp_manager_admin']), ['emp_manager_admin']);
  // Неизвестный id не выкидываем молча — пусть упадёт FK, как раньше
  assert.deepEqual(await withoutDeviceEmployees(tx, ['emp_ivan', 'emp_ghost']), ['emp_ivan', 'emp_ghost']);
  // Дубли схлопываются (createMany без skipDuplicates упал бы на PK)
  assert.deepEqual(await withoutDeviceEmployees(tx, ['emp_ivan', 'emp_ivan']), ['emp_ivan']);
  // Пусто → без запроса в БД
  assert.deepEqual(await withoutDeviceEmployees({}, []), []);
} finally {
  console.warn = warn;
}

console.log('withoutDeviceEmployees: 7/7 OK');
