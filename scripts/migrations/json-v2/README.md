# JSON v2 Migration

Этот набор скриптов выполняет контролируемую миграцию рабочих JSON-данных:
- валидация ссылок между сущностями;
- нормализация структуры сотрудников/клиентов/склада;
- проверка расчетных балансов клиентов;
- запись отчета по миграции.

## Режимы

1. `dry-run`:
- только проверка и отчет в консоль;
- файлы данных не меняются.

2. `apply`:
- перед изменениями создается бэкап `data-backups/YYYYMMDD-HHMMSS/`;
- применяются изменения;
- создаются:
`data/_meta/schema-version.json` и `data/_meta/migration-log-YYYYMMDD-HHMMSS.json`.

## Команды

```bash
npm run migrate:json-v2:dry-run
```

```bash
npm run migrate:json-v2:apply
```

```bash
npm run migrate:json-v2:apply:fix-balances
```

Опция `--fix-balances` в `apply` дополнительно выравнивает `balance` контрагентов/агрегаторов по расчету:
- `- сумма моек` + `+ сумма клиентских платежей`.

## Пример прямого запуска

```bash
node scripts/migrations/json-v2/index.mjs --mode=dry-run
node scripts/migrations/json-v2/index.mjs --mode=apply --fix-balances
```

## Идемпотентность

Повторный запуск `apply` без новых входных изменений не должен вносить дополнительных правок в рабочие JSON-файлы (кроме нового migration-log файла в `data/_meta`).
