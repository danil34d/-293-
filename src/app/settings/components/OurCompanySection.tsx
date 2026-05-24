"use client";

/**
 * Phase 57b / multi-company: UI для управления «Нашими юр.лицами» (ИП).
 *
 * GET /api/our-companies — список из page.tsx (SSR, передаётся как props)
 * POST /api/our-companies { id, shortName, ... } — upsert
 * POST /api/our-companies/[id]/archive — архивирование (создаётся позже; пока через saveOurCompany + archived=true)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Plus, Pencil, Archive, ArchiveRestore, Loader2, Star, AlertTriangle,
} from "lucide-react";
import type { OurCompany } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────

const TAX_REGIME_LABELS: Record<string, string> = {
  patent: "Патент",
  "usn-6": "УСН 6%",
  "usn-15": "УСН 15%",
  osno: "ОСНО",
};

const TAX_REGIME_OPTIONS = [
  { value: "patent", label: "Патент" },
  { value: "usn-6", label: "УСН 6% (доходы)" },
  { value: "usn-15", label: "УСН 15% (доходы − расходы)" },
  { value: "osno", label: "ОСНО" },
];

// ─────────────────────────────────────────────────────────────────────────────

type FormState = {
  id: string;
  shortName: string;
  fullName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  ownerName: string;
  legalAddress: string;
  taxRegime: string;
  isPrimary: boolean;
  // bank
  bankName: string;
  settlementAccount: string;
  correspondentAccount: string;
  bik: string;
};

function makeEmpty(): FormState {
  return {
    id: "",
    shortName: "",
    fullName: "",
    inn: "",
    kpp: "",
    ogrn: "",
    ownerName: "",
    legalAddress: "",
    taxRegime: "patent",
    isPrimary: false,
    bankName: "",
    settlementAccount: "",
    correspondentAccount: "",
    bik: "",
  };
}

function companyToForm(c: OurCompany): FormState {
  return {
    id: c.id,
    shortName: c.shortName,
    fullName: c.fullName || "",
    inn: c.inn || "",
    kpp: c.kpp || "",
    ogrn: c.ogrn || "",
    ownerName: c.ownerName || "",
    legalAddress: c.legalAddress || "",
    taxRegime: c.taxRegime || "patent",
    isPrimary: c.isPrimary,
    bankName: c.bankName || "",
    settlementAccount: c.settlementAccount || "",
    correspondentAccount: c.correspondentAccount || "",
    bik: c.bik || "",
  };
}

function slugifyId(name: string): string {
  return (
    "oc_" +
    name
      .toLowerCase()
      .replace(/ё/g, "e")
      .replace(/[а-яa-z0-9]+/g, (m) => m)
      .replace(/[^a-z0-9а-яё]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 30) +
    "_" +
    Date.now().toString(36)
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  companies: OurCompany[];
}

export function OurCompanySection({ companies: initialCompanies }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [companies, setCompanies] = React.useState<OurCompany[]>(initialCompanies);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [archiveTarget, setArchiveTarget] = React.useState<OurCompany | null>(null);
  const [form, setForm] = React.useState<FormState>(makeEmpty());
  const [isNew, setIsNew] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  const active = companies.filter((c) => !c.archived);
  const archived = companies.filter((c) => c.archived);

  // Detect taxRegime warning (usn-6 = likely misconfigured если оба ИП Патент)
  const hasRegimeMismatch = companies.some(
    (c) => !c.archived && c.taxRegime && c.taxRegime !== "patent"
  );

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(makeEmpty());
    setIsNew(true);
    setDialogOpen(true);
  }

  function openEdit(c: OurCompany) {
    setForm(companyToForm(c));
    setIsNew(false);
    setDialogOpen(true);
  }

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.shortName.trim()) {
      toast({ title: "Ошибка", description: "Краткое название обязательно", variant: "destructive" });
      return;
    }
    if (!form.taxRegime) {
      toast({ title: "Ошибка", description: "Выберите налоговый режим", variant: "destructive" });
      return;
    }

    const id = isNew ? slugifyId(form.shortName) : form.id;
    const body = { ...form, id };

    setLoading(true);
    try {
      const res = await fetch("/api/our-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { ourCompany } = await res.json();

      // Update local state optimistically
      setCompanies((prev) => {
        const idx = prev.findIndex((c) => c.id === ourCompany.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = ourCompany;
          // If isPrimary — unset others
          if (ourCompany.isPrimary) {
            return next.map((c) => c.id === ourCompany.id ? c : { ...c, isPrimary: false });
          }
          return next;
        }
        return [...prev, ourCompany];
      });

      toast({
        title: isNew ? "Юр.лицо добавлено" : "Юр.лицо обновлено",
        description: ourCompany.shortName,
      });
      setDialogOpen(false);
      router.refresh();
    } catch (err: any) {
      toast({ title: "Ошибка сохранения", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ─── Archive ───────────────────────────────────────────────────────────────

  async function handleArchive(company: OurCompany) {
    setLoading(true);
    try {
      const res = await fetch("/api/our-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...company, archived: true, archivedAt: new Date().toISOString() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setCompanies((prev) =>
        prev.map((c) => c.id === company.id ? { ...c, archived: true } : c)
      );
      toast({ title: "Архивировано", description: company.shortName });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Ошибка архивирования", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setArchiveTarget(null);
    }
  }

  async function handleUnarchive(company: OurCompany) {
    setLoading(true);
    try {
      const res = await fetch("/api/our-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...company, archived: false, archivedAt: null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setCompanies((prev) =>
        prev.map((c) => c.id === company.id ? { ...c, archived: false } : c)
      );
      toast({ title: "Восстановлено из архива", description: company.shortName });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-gray-900">Наши юр.лица</h2>
          <span className="text-xs text-gray-400 font-normal">{active.length} ИП</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={openCreate}
          className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить
        </Button>
      </div>

      {/* Mismatch warning */}
      {hasRegimeMismatch && (
        <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-medium">Налоговый режим требует исправления:</span>{" "}
            у одного или нескольких ИП указан не Патент. Нажмите «Изменить» и выберите правильный режим.
          </div>
        </div>
      )}

      {/* Company cards */}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {active.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">
            Нет активных юр.лиц. Нажмите «Добавить».
          </div>
        )}

        {active.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            onEdit={() => openEdit(company)}
            onArchive={() => setArchiveTarget(company)}
          />
        ))}
      </div>

      {/* Archived section */}
      {archived.length > 0 && (
        <div className="mt-2">
          <button
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? "Скрыть архив" : `Архив (${archived.length})`}
          </button>
          {showArchived && (
            <div className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden opacity-60">
              {archived.map((company) => (
                <div key={company.id} className="flex items-center gap-3 px-4 py-3">
                  <Archive className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500 flex-1">{company.shortName}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnarchive(company)}
                    className="h-7 text-xs gap-1"
                    disabled={loading}
                  >
                    <ArchiveRestore className="w-3 h-3" />
                    Восстановить
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              {isNew ? "Добавить юр.лицо" : "Редактировать юр.лицо"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Core fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="shortName">Краткое название *</Label>
                <Input
                  id="shortName"
                  value={form.shortName}
                  onChange={(e) => setField("shortName", e.target.value)}
                  placeholder="ИП Абанин"
                  className="font-medium"
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label htmlFor="fullName">Полное наименование</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  placeholder="Индивидуальный предприниматель Абанин..."
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="taxRegime">Налоговый режим *</Label>
                <Select
                  value={form.taxRegime}
                  onValueChange={(v) => setField("taxRegime", v)}
                >
                  <SelectTrigger id="taxRegime">
                    <SelectValue placeholder="Выберите режим" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_REGIME_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="inn">ИНН</Label>
                <Input
                  id="inn"
                  value={form.inn}
                  onChange={(e) => setField("inn", e.target.value)}
                  placeholder="123456789012"
                  maxLength={12}
                />
              </div>
            </div>

            {/* Primary toggle */}
            <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <div>
                <div className="text-sm font-medium text-indigo-900">Основное ИП</div>
                <div className="text-xs text-indigo-600 mt-0.5">
                  Используется по умолчанию для розничных моек
                </div>
              </div>
              <button
                type="button"
                onClick={() => setField("isPrimary", !form.isPrimary)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.isPrimary ? "bg-indigo-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.isPrimary ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Additional info */}
            <details className="group">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 select-none py-1">
                Дополнительные реквизиты (ОГРН, адрес, банк)
              </summary>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1">
                  <Label htmlFor="kpp">КПП</Label>
                  <Input
                    id="kpp"
                    value={form.kpp}
                    onChange={(e) => setField("kpp", e.target.value)}
                    placeholder="770701001"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ogrn">ОГРНИП</Label>
                  <Input
                    id="ogrn"
                    value={form.ogrn}
                    onChange={(e) => setField("ogrn", e.target.value)}
                    placeholder="315774600196743"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="ownerName">ФИО руководителя (для подписи)</Label>
                  <Input
                    id="ownerName"
                    value={form.ownerName}
                    onChange={(e) => setField("ownerName", e.target.value)}
                    placeholder="Абанин Дмитрий Александрович"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="legalAddress">Юридический адрес</Label>
                  <Input
                    id="legalAddress"
                    value={form.legalAddress}
                    onChange={(e) => setField("legalAddress", e.target.value)}
                    placeholder="г. Москва, ул. Примерная, д. 1"
                  />
                </div>

                <div className="col-span-2 border-t pt-2 mt-1">
                  <div className="text-xs font-medium text-gray-500 mb-2">Банковские реквизиты</div>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="bankName">Банк</Label>
                  <Input
                    id="bankName"
                    value={form.bankName}
                    onChange={(e) => setField("bankName", e.target.value)}
                    placeholder="АО «Тинькофф Банк»"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="settlementAccount">р/с</Label>
                  <Input
                    id="settlementAccount"
                    value={form.settlementAccount}
                    onChange={(e) => setField("settlementAccount", e.target.value)}
                    placeholder="40802810900000000000"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bik">БИК</Label>
                  <Input
                    id="bik"
                    value={form.bik}
                    onChange={(e) => setField("bik", e.target.value)}
                    placeholder="044525974"
                    maxLength={9}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="correspondentAccount">к/с</Label>
                  <Input
                    id="correspondentAccount"
                    value={form.correspondentAccount}
                    onChange={(e) => setField("correspondentAccount", e.target.value)}
                    placeholder="30101810145250000974"
                    maxLength={20}
                  />
                </div>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !form.shortName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isNew ? "Добавить" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать «{archiveTarget?.shortName}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Юр.лицо скроется из основного списка. Существующие записи (мойки, расходы)
              сохранятся и будут по-прежнему привязаны к нему. Восстановить можно в любой момент.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && handleArchive(archiveTarget)}
              className="bg-amber-500 hover:bg-amber-600"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Архивировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  onEdit,
  onArchive,
}: {
  company: OurCompany;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const taxLabel = company.taxRegime ? TAX_REGIME_LABELS[company.taxRegime] ?? company.taxRegime : null;
  const taxIsWrong = company.taxRegime && company.taxRegime !== "patent";

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-50 transition-colors">
      {/* Icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        company.isPrimary ? "bg-indigo-100" : "bg-gray-100"
      }`}>
        {company.isPrimary
          ? <Star className="w-4 h-4 text-indigo-600 fill-indigo-600" />
          : <Building2 className="w-4 h-4 text-gray-500" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900 truncate">{company.shortName}</span>
          {company.isPrimary && (
            <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] px-1.5 py-0">
              Основное
            </Badge>
          )}
          {taxLabel && (
            <Badge className={`text-[10px] px-1.5 py-0 ${
              taxIsWrong
                ? "bg-amber-100 text-amber-700 border-amber-200"
                : "bg-green-50 text-green-700 border-green-200"
            }`}>
              {taxIsWrong && "⚠ "}
              {taxLabel}
            </Badge>
          )}
        </div>
        {company.inn && (
          <div className="text-xs text-gray-400 mt-0.5">ИНН {company.inn}</div>
        )}
        {company.bankName && (
          <div className="text-xs text-gray-400 truncate">{company.bankName}{company.settlementAccount ? " · р/с …" + company.settlementAccount.slice(-4) : ""}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          className="h-8 w-8 p-0 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
          title="Редактировать"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {!company.isPrimary && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onArchive}
            className="h-8 w-8 p-0 text-gray-400 hover:text-amber-600 hover:bg-amber-50"
            title="Архивировать"
          >
            <Archive className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
