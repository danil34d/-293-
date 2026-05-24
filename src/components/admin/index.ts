/**
 * UX-safety primitives — единая библиотека опасности для админки.
 *
 * Дизайн: Claude Design v1 (admin_safety pilot).
 * Документация: `АДМИНКА-РЕДИЗАЙН-V1-ОЦЕНКА.md` в obsidian vault.
 *
 * Применение:
 *  - HazardPill — badge с уровнем (critical/warn/info/safe)
 *  - Impact     — bullet с цветным фоном (что произойдёт)
 *  - CheckItem  — кликабельная галка для confirm-чек-листов
 *  - SafetyBar  — узкий бар-статус (3+ фактов в строке)
 *  - DangerGate — locked-поле с явным unlock + live preview
 *
 * Phase 55 (2026-05-23): добавлены Zorin* алиасы. Можно использовать
 * `ZorinHazardPill` / `ZorinDangerGate` / etc. — это те же самые компоненты,
 * просто с брендовым префиксом. Старые имена (HazardPill...) сохранены
 * для обратной совместимости — оба работают идентично, файлы не переименованы.
 */
export { HazardPill, HazardPill as ZorinHazardPill, HAZARD_COLORS } from "./HazardPill";
export type { HazardLevel, HazardSpec, HazardPillProps, HazardPillProps as ZorinHazardPillProps } from "./HazardPill";

export { Impact, Impact as ZorinImpact } from "./Impact";
export type { ImpactProps, ImpactProps as ZorinImpactProps } from "./Impact";

export { CheckItem, CheckItem as ZorinCheckItem } from "./CheckItem";
export type { CheckItemProps, CheckItemProps as ZorinCheckItemProps } from "./CheckItem";

export { SafetyBar, SafetyBar as ZorinSafetyBar } from "./SafetyBar";
export type { SafetyBarProps, SafetyBarItem, SafetyBarProps as ZorinSafetyBarProps, SafetyBarItem as ZorinSafetyBarItem } from "./SafetyBar";

export { DangerGate, DangerGate as ZorinDangerGate } from "./DangerGate";
export type { DangerGateProps, DangerGateProps as ZorinDangerGateProps } from "./DangerGate";
