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
 */
export { HazardPill, HAZARD_COLORS } from "./HazardPill";
export type { HazardLevel, HazardSpec, HazardPillProps } from "./HazardPill";

export { Impact } from "./Impact";
export type { ImpactProps } from "./Impact";

export { CheckItem } from "./CheckItem";
export type { CheckItemProps } from "./CheckItem";

export { SafetyBar } from "./SafetyBar";
export type { SafetyBarProps, SafetyBarItem } from "./SafetyBar";

export { DangerGate } from "./DangerGate";
export type { DangerGateProps } from "./DangerGate";
