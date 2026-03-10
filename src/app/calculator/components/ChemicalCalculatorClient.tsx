"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ChemicalConfig, VehicleType } from '@/types';
import { isEmployeeAdmin } from '@/lib/employee-role';

interface CalculationResult {
  partyCostRub: number;
  costPerM2: number;
  solutionVolumeLiters: number;
  consumptionLiters: number;
  washesFromParty: number;
  costPerWashRub: number;
  costPerWashM2: number;
  recommendedPrice: number;
  profit: number;
  profitability: number;
}

export default function ChemicalCalculatorClient() {
  const { employee, isLoading: authLoading } = useAuth();

  const [config, setConfig] = useState<ChemicalConfig>({
    concentratePricePer22kg: 3000,
    volumeWeightKg: 5.79,
    dilutionRatio: '1:3',
  });

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);

  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleArea, setNewVehicleArea] = useState(50);
  const [newVehiclePrice, setNewVehiclePrice] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalcTrigger, setRecalcTrigger] = useState(0);

  // Load data
  useEffect(() => {
    fetchData();
  }, []);

  // Trigger recalculation when config changes
  useEffect(() => {
    if (!loading && selectedVehicle) {
      setRecalcTrigger(prev => prev + 1);
    }
  }, [config.dilutionRatio, config.concentratePricePer22kg, config.volumeWeightKg]);

  const fetchData = async () => {
    try {
      const [configRes, vehiclesRes] = await Promise.all([
        fetch('/api/chemical-config'),
        fetch('/api/vehicle-types'),
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (vehiclesRes.ok) {
        const vehiclesData = await vehiclesRes.json();
        setVehicleTypes(vehiclesData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/chemical-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        alert('✓ Настройки сохранены!');
      } else {
        const error = await res.json();
        alert(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Ошибка сохранения настроек');
    } finally {
      setSaving(false);
    }
  };

  const addVehicle = async () => {
    if (!newVehicleName.trim()) {
      alert('Введите название машины');
      return;
    }

    if (newVehicleArea <= 0) {
      alert('Площадь должна быть больше 0');
      return;
    }

    try {
      const res = await fetch('/api/vehicle-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVehicleName,
          areaM2: newVehicleArea,
          recommendedPrice: newVehiclePrice || undefined,
        }),
      });

      if (res.ok) {
        const newVehicle = await res.json();
        setVehicleTypes([...vehicleTypes, newVehicle]);
        setSelectedVehicle(newVehicle);
        setNewVehicleName('');
        setNewVehicleArea(50);
        setNewVehiclePrice(0);
        alert('✓ Машина добавлена!');
      } else {
        const error = await res.json();
        alert(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      console.error('Error adding vehicle:', error);
      alert('Ошибка добавления машины');
    }
  };

  const deleteVehicle = async (id: string) => {
    if (!confirm('Удалить машину?')) return;

    try {
      const res = await fetch(`/api/vehicle-types?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setVehicleTypes(vehicleTypes.filter(v => v.id !== id));
        if (selectedVehicle?.id === id) {
          setSelectedVehicle(null);
        }
      } else {
        const error = await res.json();
        alert(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      alert('Ошибка удаления машины');
    }
  };

  const calculate = (vehicle: VehicleType): CalculationResult => {
    const costPerKg = config.concentratePricePer22kg / 22;
    const partyCostRub = config.volumeWeightKg * costPerKg;
    const solutionVolumeLiters = config.dilutionRatio === '1:3' ? 20 : 10;

    const consumptionLiters = vehicle.consumptionLiters;
    const washesFromParty = solutionVolumeLiters / consumptionLiters;
    const costPerWashRub = partyCostRub / washesFromParty;
    const costPerM2 = costPerWashRub / vehicle.areaM2;
    const costPerWashM2 = costPerM2;

    const recommendedPrice = vehicle.recommendedPrice;
    const profit = recommendedPrice - costPerWashRub;
    const profitability = (profit / recommendedPrice) * 100;

    return {
      partyCostRub,
      costPerM2,
      solutionVolumeLiters,
      consumptionLiters,
      washesFromParty,
      costPerWashRub,
      costPerWashM2,
      recommendedPrice,
      profit,
      profitability,
    };
  };

  const formatMoney = (val: number) => Math.round(val).toLocaleString('ru-RU');
  const formatNumber = (val: number, decimals: number) =>
    val.toFixed(decimals).replace('.', ',');

  // Check authentication and admin access
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Загрузка...</div>
      </div>
    );
  }

  // Only admin can access calculator
  if (!isEmployeeAdmin(employee)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="calculator-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--calc-danger)', marginBottom: '16px' }}>
            🔒 Доступ запрещен
          </h2>
          <p style={{ color: 'var(--calc-text-secondary)' }}>
            Калькулятор себестоимости мойки доступен только администратору.
          </p>
        </div>
      </div>
    );
  }

  const currentCalc = selectedVehicle ? calculate(selectedVehicle) : null;
  const allCalcs = vehicleTypes.map(v => ({ vehicle: v, calc: calculate(v) }));

  return (
    <div className="calculator-container">
      <header className="calculator-header">
        <h1>Калькулятор себестоимости мойки</h1>
        <p className="calculator-subtitle">
          Быстрый расчёт цены мойки автомобилей на основе площади
        </p>
      </header>

      <div className="calculator-main-grid">
        {/* LEFT COLUMN: SETTINGS */}
        <div className="calculator-card">
          <h2>⚙️ Параметры химии</h2>

          <div className="form-group">
            <label>Стоимость концентрата (за 22 кг)</label>
            <input
              type="number"
              value={config.concentratePricePer22kg}
              onChange={(e) =>
                setConfig({ ...config, concentratePricePer22kg: parseFloat(e.target.value) })
              }
              step="100"
            />
          </div>

          <div className="form-group">
            <label>Вес партии (5л концентрата, кг)</label>
            <input
              type="number"
              value={config.volumeWeightKg}
              onChange={(e) =>
                setConfig({ ...config, volumeWeightKg: parseFloat(e.target.value) })
              }
              step="0.1"
            />
          </div>

          <div className="form-group">
            <label>Разведение</label>
            <select
              value={config.dilutionRatio}
              onChange={(e) =>
                setConfig({
                  ...config,
                  dilutionRatio: e.target.value as '1:3' | '1:1',
                })
              }
            >
              <option value="1:3">1:3 (20л раствора)</option>
              <option value="1:1">1:1 (10л раствора)</option>
            </select>
          </div>

          <button className="btn-primary" onClick={saveConfig} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>

          {currentCalc && (
            <div className="result-box">
              <div className="result-item">
                <span className="result-label">Цена партии</span>
                <span className="result-value">{formatMoney(currentCalc.partyCostRub)} руб.</span>
              </div>
              <div className="result-item">
                <span className="result-label">Себест. за м²</span>
                <span className="result-value">{formatNumber(currentCalc.costPerM2, 2)} руб./м²</span>
              </div>
            </div>
          )}

          <div className="section-divider"></div>

          <h2>🚙 Выбрать машину</h2>
          <div className="form-group">
            <select
              value={selectedVehicle?.id || ''}
              onChange={(e) => {
                const vehicle = vehicleTypes.find(v => v.id === e.target.value);
                setSelectedVehicle(vehicle || null);
              }}
            >
              <option value="">-- Выберите машину --</option>
              {vehicleTypes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.areaM2}м²)
                </option>
              ))}
            </select>
          </div>

          <div className="section-divider"></div>

          <h2>➕ Добавить машину</h2>
          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={newVehicleName}
              onChange={(e) => setNewVehicleName(e.target.value)}
              placeholder="например, Газель 10м"
            />
          </div>

          <div className="form-group">
            <label>Площадь мойки (м²)</label>
            <input
              type="number"
              value={newVehicleArea}
              onChange={(e) => setNewVehicleArea(parseFloat(e.target.value))}
              step="0.1"
            />
            <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              Расход химии рассчитается автоматически
            </small>
          </div>

          <div className="form-group">
            <label>Рекомендуемая цена (руб., опционально)</label>
            <input
              type="number"
              value={newVehiclePrice}
              onChange={(e) => setNewVehiclePrice(parseFloat(e.target.value))}
              step="10"
            />
            <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              Если не указать, рассчитается автоматически
            </small>
          </div>

          <button className="btn-primary" onClick={addVehicle}>
            ➕ Добавить машину
          </button>

          {vehicleTypes.filter(v => v.isCustom).length > 0 && (
            <>
              <div className="section-divider"></div>
              <h3 style={{ margin: 0, fontSize: '14px' }}>Пользовательские машины</h3>
              <div>
                {vehicleTypes
                  .filter(v => v.isCustom)
                  .map((v) => (
                    <div key={v.id} className="machine-item">
                      <div>
                        {v.name}
                        <br />
                        <small>
                          {formatNumber(v.areaM2, 2)}м² • {formatNumber(v.consumptionLiters, 3)}л
                        </small>
                      </div>
                      <button className="btn-danger" onClick={() => deleteVehicle(v.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT COLUMN: RESULTS */}
        <div className="calculator-card">
          <h2>📊 Результаты расчёта</h2>

          {!selectedVehicle ? (
            <div className="alert">👈 Выберите машину из списка слева</div>
          ) : (
            <>
              <div className="alert success-alert">{selectedVehicle.name}</div>

              <table>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Площадь мойки</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatNumber(selectedVehicle.areaM2, 2)} м²
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Расход раствора</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatNumber(currentCalc!.consumptionLiters, 3)} л
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Моек из партии</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatNumber(currentCalc!.washesFromParty, 1)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        borderBottom: '2px solid var(--border)',
                        paddingTop: '12px',
                        paddingBottom: '12px',
                      }}
                    >
                      <strong style={{ color: 'var(--success)' }}>Себестоимость химиката</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>За одну мойку</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatMoney(currentCalc!.costPerWashRub)} руб.
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>За 1 м²</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatNumber(currentCalc!.costPerM2, 2)} руб./м²
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        borderBottom: '2px solid var(--border)',
                        paddingTop: '12px',
                        paddingBottom: '12px',
                      }}
                    >
                      <strong style={{ color: 'var(--primary)' }}>Рекомендуемая цена</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Розничная цена</td>
                    <td style={{ textAlign: 'right', fontSize: '16px', color: 'var(--success)' }}>
                      <strong>{formatMoney(currentCalc!.recommendedPrice)} руб.</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Прибыль</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)' }}>
                      {formatMoney(currentCalc!.profit)} руб.
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Рентабельность</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)' }}>
                      {formatNumber(currentCalc!.profitability, 1)}%
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-value">{formatMoney(currentCalc!.recommendedPrice)}</div>
                  <div className="stat-label">Цена (руб.)</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{formatMoney(currentCalc!.costPerWashRub)}</div>
                  <div className="stat-label">Себест. (руб.)</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{formatNumber(currentCalc!.profitability, 1)}</div>
                  <div className="stat-label">Рентаб. (%)</div>
                </div>
              </div>

              <div className="alert" style={{ marginTop: '16px' }}>
                ℹ️ <strong>Важно:</strong> Это только химикат. Добавьте: вода, электроэнергия,
                работа, амортизация, аренда
              </div>
            </>
          )}
        </div>
      </div>

      {/* COMPARISON TABLE */}
      <div className="calculator-card">
        <h2>📋 Таблица сравнения всех машин</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Машина</th>
                <th>Площадь м²</th>
                <th>Расход л</th>
                <th>Себест. руб.</th>
                <th>Цена руб.</th>
                <th>Прибыль руб.</th>
                <th>Рентаб. %</th>
              </tr>
            </thead>
            <tbody>
              {allCalcs.map(({ vehicle, calc }) => (
                <tr key={vehicle.id}>
                  <td>
                    <strong>{vehicle.name}</strong>
                  </td>
                  <td>{formatNumber(vehicle.areaM2, 2)}</td>
                  <td>{formatNumber(vehicle.consumptionLiters, 3)}</td>
                  <td>{formatMoney(calc.costPerWashRub)}</td>
                  <td>
                    <strong>{formatMoney(calc.recommendedPrice)}</strong>
                  </td>
                  <td>{formatMoney(calc.profit)}</td>
                  <td>{formatNumber(calc.profitability, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
