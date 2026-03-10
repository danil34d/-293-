import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Нормализует номерной знак:
 * - Транслитерирует ключевые русские буквы в латинские.
 * - Переводит все в верхний регистр.
 * - Удаляет все символы, кроме латинских букв (A-Z) и цифр (0-9).
 * @param plate Исходная строка номерного знака.
 * @returns Нормализованная строка номерного знака.
 */
export function normalizeLicensePlate(plate: string): string {
  if (!plate) return "";

  const cyrillicToLatinMap: { [key: string]: string } = {
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M',
    'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
    'У': 'Y', 'Х': 'X',
    // добавим строчные для удобства ввода пользователем
    'а': 'A', 'в': 'B', 'е': 'E', 'к': 'K', 'м': 'M',
    'н': 'H', 'о': 'O', 'р': 'P', 'с': 'C', 'т': 'T',
    'у': 'Y', 'х': 'X',
  };

  let normalized = '';
  for (const char of plate) {
    normalized += cyrillicToLatinMap[char] || char;
  }

  return normalized.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Интерфейс настроек разбавления химии
 *
 * ВАЖНО: Канистра 22 кг веса = 19 литров объёма
 * Расход считается в мл (литрах), а не в граммах веса!
 */
export interface DilutionSettings {
  dilutionEnabled: boolean;
  dilutionRatio: number; // 1:X - одна часть концентрата на X частей воды
  measuringContainerMl: number; // объём мерного контейнера в мл
  solutionPerWashFull: number; // расход раствора на полную мойку (мл)
  solutionPerWashPartial: number; // расход раствора на частичную мойку (мл)
  canisterVolumeMl?: number; // объём канистры в мл (19000 мл = 19 литров)
}

/**
 * Расчёт расхода концентрата на одну мойку
 * @param settings настройки разбавления
 * @param isFullWash полная мойка или частичная
 * @returns расход концентрата в мл
 */
export function calculateConcentratePerWash(
  settings: DilutionSettings,
  isFullWash: boolean = true
): number {
  if (!settings.dilutionEnabled) {
    // Если разбавление выключено, возвращаем расход раствора как расход концентрата
    return isFullWash ? settings.solutionPerWashFull : settings.solutionPerWashPartial;
  }

  const solutionMl = isFullWash ? settings.solutionPerWashFull : settings.solutionPerWashPartial;
  // При разбавлении 1:X, концентрат составляет 1/(X+1) от объёма раствора
  const concentrateMl = solutionMl / (settings.dilutionRatio + 1);

  return Math.round(concentrateMl);
}

/**
 * Расчёт сколько машин можно помыть из канистры
 * @param canisterVolumeMl объём канистры в мл (19000 мл = 19 литров)
 * @param settings настройки разбавления
 * @param isFullWash считать для полной или частичной мойки
 * @returns количество машин
 */
export function calculateWashesPerCanister(
  canisterVolumeMl: number,
  settings: DilutionSettings,
  isFullWash: boolean = true
): number {
  const concentratePerWash = calculateConcentratePerWash(settings, isFullWash);
  if (concentratePerWash <= 0) return 0;
  return Math.floor(canisterVolumeMl / concentratePerWash);
}

/**
 * Расчёт остатка канистры в машинах
 * @param remainingMl остаток концентрата в мл
 * @param settings настройки разбавления
 * @param isFullWash считать для полной или частичной мойки
 * @returns количество машин, которые можно помыть
 */
export function calculateRemainingWashes(
  remainingMl: number,
  settings: DilutionSettings,
  isFullWash: boolean = true
): number {
  return calculateWashesPerCanister(remainingMl, settings, isFullWash);
}

/**
 * Расчёт объёма рабочего раствора из концентрата
 * @param concentrateMl количество концентрата в мл
 * @param dilutionRatio коэффициент разбавления (1:X)
 * @returns объём рабочего раствора в мл
 */
export function calculateSolutionVolume(
  concentrateMl: number,
  dilutionRatio: number
): number {
  // Концентрат + вода = раствор
  // При 1:10 из 1 литра концентрата получится 11 литров раствора
  return concentrateMl * (dilutionRatio + 1);
}

/**
 * Расчёт стоимости химии на одну мойку
 * @param settings настройки разбавления
 * @param canisterPriceRub цена канистры в рублях
 * @param canisterVolumeMl объём канистры в мл
 * @param isFullWash полная или частичная мойка
 * @returns стоимость химии в рублях
 */
export function calculateChemicalCostPerWash(
  settings: DilutionSettings,
  canisterPriceRub: number,
  canisterVolumeMl: number = 19000,
  isFullWash: boolean = true
): number {
  const concentrateMl = calculateConcentratePerWash(settings, isFullWash);
  // Цена за мл = цена канистры / объём канистры
  const pricePerMl = canisterPriceRub / canisterVolumeMl;
  return Math.round(concentrateMl * pricePerMl * 100) / 100;
}

/**
 * Конвертация литров в канистры
 * @param volumeMl объём в мл
 * @param canisterVolumeMl объём одной канистры в мл (по умолчанию 19000)
 * @returns количество канистр (дробное число)
 */
export function mlToCanisters(volumeMl: number, canisterVolumeMl: number = 19000): number {
  return volumeMl / canisterVolumeMl;
}

/**
 * Форматирование остатка в удобном виде
 * @param volumeMl объём в мл
 * @param canisterVolumeMl объём одной канистры в мл
 * @returns строка вида "X канистр (Y.YY л)"
 */
export function formatChemicalStock(volumeMl: number, canisterVolumeMl: number = 19000): string {
  const canisters = mlToCanisters(volumeMl, canisterVolumeMl);
  const liters = volumeMl / 1000;

  if (canisters >= 1) {
    return `${canisters.toFixed(1)} канистр (${liters.toFixed(1)} л)`;
  } else {
    return `${liters.toFixed(1)} л`;
  }
}
