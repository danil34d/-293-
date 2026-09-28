// Sanity test: isNonAdminAppPath (src/lib/public-routes.ts) — куда пускают не-админа.
// Запуск: node --experimental-strip-types scripts/test-non-admin-paths.mjs
import assert from 'node:assert/strict';
import { isNonAdminAppPath } from '../src/lib/public-routes.ts';

const allowed = ['/employee', '/employee/finance', '/kiosk', '/kiosk/order', '/login', '/wallboard', '/status', '/k'];
const admin = ['/', '/employees', '/employees/emp_1/edit', '/expenses', '/dashboard', '/kiosks', '/kx', '/workstation', '/wash-log'];

for (const p of allowed) assert.equal(isNonAdminAppPath(p), true, `${p} должен быть доступен не-админу`);
// Главный регресс: /employees (список с паролями) раньше считался страницей сотрудника
for (const p of admin) assert.equal(isNonAdminAppPath(p), false, `${p} — админская страница`);
assert.equal(isNonAdminAppPath(null), false);

console.log(`isNonAdminAppPath: ${allowed.length + admin.length + 1} OK`);
