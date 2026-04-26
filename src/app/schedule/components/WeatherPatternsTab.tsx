"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Plus, Trash2, Save, Loader2, Info } from 'lucide-react';

interface Pattern {
  id: string;
  name: string;
  description: string;
  loadLevel: 'low' | 'normal' | 'high' | 'peak';
  weight: number;
  confirmations: number;
  corrections: number;
}

interface PatternsData {
  version: number;
  description: string;
  location: string;
  patterns: Pattern[];
  lastUpdated: string | null;
}

const LOAD_COLORS: Record<string, { bg: string; border: string; text: string; label: string; emoji: string }> = {
  low:    { bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-700',  label: 'Мало',   emoji: '🟢' },
  normal: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', label: 'Средне', emoji: '🟡' },
  high:   { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', label: 'Много',  emoji: '🟠' },
  peak:   { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-700',    label: 'ПИК',    emoji: '🔴' },
};

const BUILT_IN_IDS = ['strong_precip', 'light_precip', 'surge_after_precip', 'after_precip_dry', 'thaw_freeze', 'frost_no_blizzard', 'good_weather', 'default'];

export default function WeatherPatternsTab() {
  const [data, setData] = useState<PatternsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState<Pattern | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formLevel, setFormLevel] = useState<'low' | 'normal' | 'high' | 'peak'>('normal');
  const [formWeight, setFormWeight] = useState(1.0);

  const fetchPatterns = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/weather/patterns');
      if (!res.ok) throw new Error('Не удалось загрузить');
      const d = await res.json();
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPatterns(); }, []);

  const openEdit = (p: Pattern) => {
    setEditPattern(p);
    setFormName(p.name);
    setFormDesc(p.description);
    setFormLevel(p.loadLevel);
    setFormWeight(p.weight);
    setIsDialogOpen(true);
  };

  const openNew = () => {
    setEditPattern(null);
    setFormName('');
    setFormDesc('');
    setFormLevel('normal');
    setFormWeight(1.0);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const id = editPattern?.id || `custom_${Date.now()}`;
      const res = await fetch('/api/weather/patterns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: formName, description: formDesc, loadLevel: formLevel, weight: formWeight }),
      });
      if (!res.ok) throw new Error('Ошибка сохранения');
      const result = await res.json();
      if (data) setData({ ...data, patterns: result.patterns, lastUpdated: new Date().toISOString() });
      setIsDialogOpen(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот паттерн?')) return;
    try {
      const res = await fetch(`/api/weather/patterns?id=${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Ошибка'); }
      const result = await res.json();
      if (data) setData({ ...data, patterns: result.patterns });
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-600 mb-2">{error || 'Данные не загружены'}</p>
        <Button size="sm" onClick={fetchPatterns}>Повторить</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{data.location} — правила прогноза загрузки мойки</p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          Добавить
        </Button>
      </div>

      {/* Warning: feature in development */}
      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex gap-2 text-sm text-amber-900">
        <Info className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">⚠️ Фича в разработке — паттерны пока не влияют на прогноз</p>
          <p className="text-xs">
            Сейчас прогноз использует встроенные правила в коде (см. <code>analyzeDay</code>).
            Когда накопится 1–2 месяца статистики (моек, выручки, погоды), эти паттерны
            будут обучаться на реальных данных и подсказывать сколько сотрудников нужно завтра.
            Записи здесь сохраняются, но игнорируются движком прогноза.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {Object.entries(LOAD_COLORS).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1">
            <span>{c.emoji}</span>
            <span className={`font-medium ${c.text}`}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Patterns */}
      <div className="space-y-2">
        {data.patterns.map(p => {
          const c = LOAD_COLORS[p.loadLevel] || LOAD_COLORS.normal;
          const isBuiltIn = BUILT_IN_IDS.includes(p.id);
          return (
            <div key={p.id} className={`p-3 rounded-lg border ${c.bg} ${c.border} flex items-center gap-3`}>
              <span className="text-xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900">{p.name}</span>
                  {isBuiltIn
                    ? <Badge variant="secondary" className="text-[10px]">встр.</Badge>
                    : <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-600">свой</Badge>
                  }
                </div>
                <p className="text-xs text-gray-600 truncate">{p.description}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!isBuiltIn && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.lastUpdated && (
        <p className="text-[10px] text-gray-400 text-center">
          Обновлено: {new Date(data.lastUpdated).toLocaleString('ru-RU')}
        </p>
      )}

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPattern ? 'Редактировать паттерн' : 'Новый паттерн'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">Название</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="Например: Слякоть весной"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Описание</label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                placeholder="Когда срабатывает..." rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Уровень загрузки</label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(LOAD_COLORS) as [string, typeof LOAD_COLORS[string]][]).map(([key, c]) => (
                  <button key={key} onClick={() => setFormLevel(key as any)}
                    className={`p-2 rounded-lg border-2 text-center transition-all ${
                      formLevel === key ? `${c.border} ${c.bg} ring-2 ring-offset-1` : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="text-lg">{c.emoji}</div>
                    <div className={`text-[10px] font-bold ${formLevel === key ? c.text : 'text-gray-600'}`}>{c.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Вес (0.1—2.0)</label>
              <input type="number" value={formWeight} onChange={e => setFormWeight(Number(e.target.value))}
                min={0.1} max={2.0} step={0.05}
                className="w-20 px-2 py-1 border border-gray-300 rounded-md text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>Отмена</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Сохраняю...</> : <><Save className="h-4 w-4 mr-1" />Сохранить</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
