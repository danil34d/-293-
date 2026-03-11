'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CarFront,
  Clock3,
  Cpu,
  FlaskConical,
  Gauge,
  HardDrive,
  RefreshCcw,
  ShieldCheck,
  Thermometer,
  Users,
  Wallet,
} from 'lucide-react';

import type { WallboardDiskState, WallboardServiceState, WallboardSnapshot } from '@/lib/wallboard';

import styles from './wallboard.module.css';

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'нет данных';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
}

function formatClock(value: Date): string {
  return value.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'нет данных';

  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

function formatServiceName(name: string): string {
  return name
    .replace('.service', '')
    .replace('.timer', '')
    .replace(/^carwash-/, '')
    .replace(/-/g, ' ');
}

function getServiceTone(state: string): 'good' | 'warn' | 'bad' {
  if (state === 'active') return 'good';
  if (state === 'activating' || state === 'reloading') return 'warn';
  return 'bad';
}

function getPercent(usedBytes: number | null, totalBytes: number | null): number {
  if (!usedBytes || !totalBytes || totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, (usedBytes / totalBytes) * 100));
}

function getDiskLabel(mountPoint: string): string {
  switch (mountPoint) {
    case '/':
      return 'Система';
    case '/srv/carwash':
      return 'Данные';
    case '/srv/carwash/backups':
      return 'Backup';
    default:
      return mountPoint;
  }
}

function buildBarStyle(percent: number): CSSProperties {
  return { width: `${Math.max(6, Math.min(100, percent))}%` };
}

function MetricTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className={styles.metricTile}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricBody}>
        <div className={styles.metricLabel}>{label}</div>
        <div className={styles.metricValue}>{value}</div>
        {hint ? <div className={styles.metricHint}>{hint}</div> : null}
      </div>
    </article>
  );
}

function ServiceRow({ service }: { service: WallboardServiceState }) {
  const tone = getServiceTone(service.state);

  return (
    <div className={styles.serviceRow}>
      <div>
        <div className={styles.serviceName}>{formatServiceName(service.name)}</div>
        <div className={styles.serviceMeta}>{service.name}</div>
      </div>
      <div className={`${styles.serviceBadge} ${styles[`tone${tone}`]}`}>{service.state}</div>
    </div>
  );
}

function DiskRow({ disk }: { disk: WallboardDiskState }) {
  const percent = getPercent(disk.usedBytes, disk.totalBytes);

  return (
    <div className={styles.diskRow}>
      <div className={styles.diskHeader}>
        <div>
          <div className={styles.diskName}>{getDiskLabel(disk.mountPoint)}</div>
          <div className={styles.diskMeta}>{disk.mountPoint}</div>
        </div>
        <div className={styles.diskUsage}>{Math.round(percent)}%</div>
      </div>
      <div className={styles.diskBar}>
        <div className={styles.diskBarFill} style={buildBarStyle(percent)} />
      </div>
      <div className={styles.diskNumbers}>
        <span>{formatBytes(disk.usedBytes)} занято</span>
        <span>{formatBytes(disk.availableBytes)} свободно</span>
      </div>
    </div>
  );
}

export function WallboardClient({ initialSnapshot }: { initialSnapshot: WallboardSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      setIsRefreshing(true);

      try {
        const response = await fetch('/api/wallboard', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const nextSnapshot = (await response.json()) as WallboardSnapshot;
        if (!isMounted) return;

        startTransition(() => {
          setSnapshot(nextSnapshot);
          setError(null);
        });
      } catch (nextError: any) {
        if (!isMounted) return;
        setError(nextError?.message || 'Не удалось обновить монитор');
      } finally {
        if (isMounted) {
          setIsRefreshing(false);
        }
      }
    };

    const timer = window.setInterval(refresh, 30000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const memoryPercent = useMemo(() => {
    if (snapshot.system.memoryTotalBytes <= 0) return 0;
    return Math.round((snapshot.system.memoryUsedBytes / snapshot.system.memoryTotalBytes) * 100);
  }, [snapshot.system.memoryTotalBytes, snapshot.system.memoryUsedBytes]);

  const backupAgeLabel =
    snapshot.system.backup.ageMinutes === null
      ? 'backup не найден'
      : `${snapshot.system.backup.ageMinutes} мин назад`;

  return (
    <div className={styles.wallboard}>
      <div className={styles.backdrop} />

      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.kicker}>SYSTEM PULSE</div>
          <h1 className={styles.title}>Монитор автомойки</h1>
          <div className={styles.subtitle}>
            <span>{snapshot.system.hostname}</span>
            <span>•</span>
            <span>{snapshot.system.ipv4.join(' • ') || 'IP не найден'}</span>
            <span>•</span>
            <span>{snapshot.system.rootSource || 'root неизвестен'}</span>
          </div>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.clock}>{formatClock(now)}</div>
          <div className={styles.date}>{formatDate(now)}</div>
          <div className={styles.refreshRow}>
            <span className={styles.refreshLabel}>
              <RefreshCcw className={isRefreshing ? styles.spin : ''} size={15} />
              {isRefreshing ? 'обновление' : `обновлено ${formatDateTime(snapshot.generatedAt)}`}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <div className={styles.errorBanner}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <main className={styles.grid}>
        <section className={styles.column}>
          <div className={styles.sectionTitle}>Система Linux</div>

          <div className={styles.metricsGrid}>
            <MetricTile
              icon={<Gauge size={20} />}
              label="Нагрузка CPU"
              value={`${snapshot.system.loadPercent.toFixed(0)}%`}
              hint={`load1 ${snapshot.system.load1.toFixed(2)} • ${snapshot.system.cpuCores} ядра`}
            />
            <MetricTile
              icon={<Thermometer size={20} />}
              label="Температура CPU"
              value={
                snapshot.system.cpuTemperatureC === null
                  ? 'нет датчика'
                  : `${snapshot.system.cpuTemperatureC.toFixed(1)}°C`
              }
              hint={snapshot.system.cpuModel}
            />
            <MetricTile
              icon={<Cpu size={20} />}
              label="Память"
              value={`${memoryPercent}%`}
              hint={`${formatBytes(snapshot.system.memoryUsedBytes)} из ${formatBytes(snapshot.system.memoryTotalBytes)}`}
            />
            <MetricTile
              icon={<Clock3 size={20} />}
              label="Uptime"
              value={formatUptime(snapshot.system.uptimeSeconds)}
              hint={`EFI ${snapshot.system.efiSource || 'не найден'}`}
            />
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>Сервисы</div>
                <div className={styles.panelHint}>web, bot, backup и health-check</div>
              </div>
              <ShieldCheck size={18} className={styles.panelIcon} />
            </div>
            <div className={styles.serviceList}>
              {snapshot.system.services.map((service) => (
                <ServiceRow key={service.name} service={service} />
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>Диски</div>
                <div className={styles.panelHint}>корень, данные и резервные копии</div>
              </div>
              <HardDrive size={18} className={styles.panelIcon} />
            </div>
            <div className={styles.diskList}>
              {snapshot.system.disks.map((disk) => (
                <DiskRow key={disk.mountPoint} disk={disk} />
              ))}
            </div>
          </section>
        </section>

        <section className={styles.column}>
          <div className={styles.sectionTitle}>Проект автомойки</div>

          <div className={styles.metricsGrid}>
            <MetricTile
              icon={<CarFront size={20} />}
              label="Моек сегодня"
              value={String(snapshot.business.washesToday)}
              hint={`смена ${snapshot.business.currentShiftType} • ${snapshot.business.currentShiftDate}`}
            />
            <MetricTile
              icon={<Wallet size={20} />}
              label="Выручка сегодня"
              value={formatCurrency(snapshot.business.revenueToday)}
              hint={`средний чек ${formatCurrency(snapshot.business.averageCheckToday)}`}
            />
            <MetricTile
              icon={<Users size={20} />}
              label="Активная смена"
              value={`${snapshot.business.activeEmployees} сотрудника`}
              hint={`${snapshot.business.activeBoxes} бокса в работе`}
            />
            <MetricTile
              icon={<Bot size={20} />}
              label="OCR"
              value={snapshot.system.ocrEngine}
              hint={`${snapshot.business.failedOcrCount} проблемных фото`}
            />
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>Оперативная сводка</div>
                <div className={styles.panelHint}>живые данные по проекту</div>
              </div>
              <Activity size={18} className={styles.panelIcon} />
            </div>

            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>Последняя машина</div>
                <div className={styles.summaryValue}>{snapshot.business.latestVehicle || 'нет данных'}</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>Лидер смены</div>
                <div className={styles.summaryValue}>{snapshot.business.topEmployee || 'нет данных'}</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>Ожидают решения</div>
                <div className={styles.summaryValue}>{snapshot.business.pendingRequests}</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>Химия на складе</div>
                <div className={styles.summaryValue}>{snapshot.business.chemicalStockKg.toFixed(1)} кг</div>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>Резерв и устойчивость</div>
                <div className={styles.panelHint}>backup и аварийные сигналы</div>
              </div>
              <FlaskConical size={18} className={styles.panelIcon} />
            </div>

            <div className={styles.backupBox}>
              <div className={styles.backupAge}>{backupAgeLabel}</div>
              <div className={styles.backupMeta}>{snapshot.system.backup.filename || 'файл не найден'}</div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
