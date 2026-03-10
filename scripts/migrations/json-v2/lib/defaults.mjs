export const INVENTORY_SETTINGS_DEFAULTS = {
  defaultChemicalConsumptionPerWash: 700,
  canisterWeightGrams: 21000,
  canisterVolumeMl: 19000,
  canisterPriceRub: 3000,
  lowStockThresholdKg: 10,
  autoDeductChemical: true,
  chemicalPricePerKg: 150,
};

export const INVENTORY_DEFAULT = {
  chemicalStockGrams: 0,
  materials: [],
  settings: { ...INVENTORY_SETTINGS_DEFAULTS },
};
