"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Car,
  Users,
  Briefcase,
  DollarSign,
  CheckCircle,
  PlusCircle,
  Trash2,
  Search,
  CreditCard,
  Landmark,
  MessageSquare,
  Wand,
  Repeat,
  Calendar,
  LogOut,
  Upload,
  Timer,
  Coins,
  ArrowLeft,
  Box,
  X,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import type { CounterAgent, Aggregator, PriceListItem, Car as CarType, RetailPriceConfig, PaymentType, Employee, WashEvent, EmployeeConsumption, WashComment, OurCompany } from '@/types';
import { KioskServiceSelectionStep, type KioskPaymentMethod } from './KioskServiceSelectionStep';
import { SplitDriverCard, DriverPickerModal } from './SplitDriverWidgets';
import SignaturePad from './SignaturePad';
import DriverComboBox from './DriverComboBox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { normalizeLicensePlate } from "@/lib/utils";
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
// Data loaded via API fetch instead of server-only data-loader
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '../ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PlateRecognitionDialog } from '@/components/plate-recognition/PlateRecognitionDialog';
import { LicensePlateInput } from '@/components/plate-recognition/LicensePlateInput';
import { isEmployeeAdmin } from '@/lib/employee-role';

type OperationPaymentMethod = "cash" | "card" | "transfer" | "aggregator" | "counterAgentContract";
type CurrentStep = "idle" | "vehicleInput" | "paymentSelection" | "aggregatorSelection" | "serviceSelection" | "confirmation";
type PendingOcrData = {
  originalOcr: string;
  imageBase64?: string;
  failedFilename?: string;
};

type CameraSessionMode = 'checkout' | 'edit';

type CameraSessionContext = {
  key: string;
  boxNumber: 1 | 2;
  dirName: string;
  recognizedPlate: string;
  normalizedRecognizedPlate: string;
  vehicleClass: string | null;
  start: string | null;
  end: string | null;
  mode: CameraSessionMode;
  correctionSaved: boolean;
};

const priorityServiceKeywords = [
  'тягач',
  '90 кубов',
  'европа',
  'америка',
  'полуприцеп',
  'самосвал',
  'цистерна'
];

interface WorkstationProps {
  /** Pre-loaded schedule employees per box (for kiosk mode) */
  scheduleByBox?: { box1: Employee[]; box2: Employee[] };
  /** Shift ids and active flags for the current box slot */
  shiftStateByBox?: {
    box1: { shiftId: string | null; isShiftActive: boolean };
    box2: { shiftId: string | null; isShiftActive: boolean };
  };
  /** Is this running in kiosk mode */
  isKioskMode?: boolean;
  /** Pre-select box number (from URL param) */
  initialBoxNumber?: number;
  /**
   * 🔥 ФИКС 2026-05-11: callback вызывается когда оператор переходит
   * в активный wizard (payment / aggregator / service / confirmation) —
   * родитель скрывает вспомогательные panels (Pending vehicles, History)
   * чтобы они не наезжали на список услуг.
   * Передаёт false когда оператор на idle / vehicleInput (можно показывать всё).
   */
  onWizardStateChange?: (isInWizard: boolean) => void;
}

type BoxKey = 'box1' | 'box2';
type BoxShiftUiState = {
  employees: Employee[];
  shiftId: string | null;
  isShiftActive: boolean;
};

const EMPTY_BOX_SHIFT_STATE: BoxShiftUiState = {
  employees: [],
  shiftId: null,
  isShiftActive: false,
};

function getBoxKey(boxNumber: number): BoxKey {
  return boxNumber === 2 ? 'box2' : 'box1';
}

export function ZorinWorkstationConsole({ scheduleByBox, shiftStateByBox, isKioskMode, initialBoxNumber, onWizardStateChange }: WorkstationProps = {}) {
  const { employee: loggedInEmployee } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Admin mode: admin came from /operations with ?box=N — simplified UI
  const isAdminMode = !isKioskMode && !!initialBoxNumber;
  const initialBoxKey = getBoxKey(initialBoxNumber || 1);
  const initialBoxState: BoxShiftUiState = {
    employees: scheduleByBox?.[initialBoxKey] || [],
    shiftId: shiftStateByBox?.[initialBoxKey]?.shiftId || null,
    isShiftActive: shiftStateByBox?.[initialBoxKey]?.isShiftActive || false,
  };
  const [boxShiftStateByBox, setBoxShiftStateByBox] = useState<{ box1: BoxShiftUiState; box2: BoxShiftUiState }>(() => ({
    box1: {
      employees: scheduleByBox?.box1 || [],
      shiftId: shiftStateByBox?.box1?.shiftId || null,
      isShiftActive: shiftStateByBox?.box1?.isShiftActive || false,
    },
    box2: {
      employees: scheduleByBox?.box2 || [],
      shiftId: shiftStateByBox?.box2?.shiftId || null,
      isShiftActive: shiftStateByBox?.box2?.isShiftActive || false,
    },
  }));
  const [isShiftActive, setIsShiftActive] = useState(() => {
    // Kiosk mode: shift is always active
    if (isKioskMode) return true;
    // Admin coming from operations with ?box=N: always active (no shift management needed)
    if (initialBoxNumber) return true;
    // Initialize from sessionStorage if available
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('isShiftActive');
      if (saved === 'true') return true;
    }
    return false;
  });
  const [vehicleNumberInput, setVehicleNumberInput] = useState('');
  const [normalizedVehicleNumber, setNormalizedVehicleNumber] = useState('');
  const [isPlateDialogOpen, setIsPlateDialogOpen] = useState(false);
  // OCR tracking: запоминаем результат OCR чтобы при ручном исправлении сохранить фото
  const [ocrData, setOcrData] = useState<PendingOcrData | null>(null);
  const [cameraSessionContext, setCameraSessionContext] = useState<CameraSessionContext | null>(null);
  const [cameraPreviewKind, setCameraPreviewKind] = useState<'plate' | 'thumbnail'>('plate');
  const cameraPrefillKeyRef = useRef<string | null>(null);
  const cameraAutoStartKeyRef = useRef<string | null>(null);

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Map<string, string>>(new Map());
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>(() => {
    // Kiosk mode or admin with schedule: initialize from schedule for selected box
    if (initialBoxState.employees.length > 0) {
      return initialBoxState.employees;
    }
    // Initialize from sessionStorage if available
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('selectedEmployees');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch (error) {
          console.error('[INIT] Failed to parse saved employees:', error);
        }
      }
    }
    // Auto-select logged-in non-admin employee (so they can start shift without schedule)
    if (loggedInEmployee && !isEmployeeAdmin(loggedInEmployee) && loggedInEmployee.role !== 'kiosk') {
      return [loggedInEmployee];
    }
    return [];
  });

  const [foundCounterAgent, setFoundCounterAgent] = useState<CounterAgent | null>(null);
  const [foundAggregators, setFoundAggregators] = useState<Aggregator[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<OperationPaymentMethod | null>(null);
  const [selectedAggregator, setSelectedAggregator] = useState<Aggregator | null>(null);

  const [washServices, setWashServices] = useState<(PriceListItem & { id: string })[]>([]);
  const [lastWashServices, setLastWashServices] = useState<(PriceListItem & { id: string, isFromLastWash?: boolean })[] | null>(null);
  const [lastWashComment, setLastWashComment] = useState<WashComment | null>(null);
  const [driverComment, setDriverComment] = useState('');

  // Phase 51c / V2-#4 split-pricing: выбранный водитель + UI state для модала.
  // Активируется когда среди выбранных услуг есть split.driverBonus > 0.
  // Без выбранного водителя кнопка «Подтвердить» disabled.
  const [selectedDriver, setSelectedDriver] = useState<{ name: string; phone?: string } | null>(null);
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');

  // Phase 60a/b — ФИО водителя + цифровая роспись (sticky на конкретную мойку,
  //   попадают в WashEvent.driverName / driverSignature; автоподтягиваются в Ведомость).
  // driverNameInput пред-заполняется из selectedDriver (для split-услуг) или из последнего
  //   водителя на этом номере (см. effect ниже). Можно править вручную.
  const [driverNameInput, setDriverNameInput] = useState('');
  const [driverSignatureDataUrl, setDriverSignatureDataUrl] = useState<string | null>(null);
  // Phase 60e — источник росписи:
  //   'cached'  — подтянута из CounterAgent.drivers[*].signature (водителю не нужно расписываться)
  //   'fresh'   — нарисована сейчас (новый образец, пойдёт в save-signature)
  //   null      — росписи нет
  const [driverSignatureSource, setDriverSignatureSource] = useState<'cached' | 'fresh' | null>(null);

  const lastConsumptionRef = useRef<Record<string, Record<string, number>>>({});

  const [customExtraServiceName, setCustomExtraServiceName] = useState('');
  const [customExtraServicePrice, setCustomExtraServicePrice] = useState('');
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [tempSelectedAggregatorId, setTempSelectedAggregatorId] = useState<string | undefined>(undefined);

  // Таймер мойки
  const [washTimerStart, setWashTimerStart] = useState<number | null>(null);
  const [washTimerElapsed, setWashTimerElapsed] = useState(0);
  // Чаевые
  const [tipsInput, setTipsInput] = useState('');

  const [activeShiftId, setActiveShiftId] = useState<string | null>(() => {
    if (initialBoxState.shiftId) {
      return initialBoxState.shiftId;
    }
    if (typeof window !== 'undefined') return sessionStorage.getItem('activeShiftId');
    return null;
  });
  const [selectedBoxNumber, setSelectedBoxNumber] = useState<number>(() => {
    if (initialBoxNumber) return initialBoxNumber;
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('selectedBoxNumber');
      return saved ? parseInt(saved, 10) : 1;
    }
    return 1;
  });
  const [isShiftLoading, setIsShiftLoading] = useState(false);
  const selectedBoxKey = getBoxKey(selectedBoxNumber);
  const selectedBoxState = boxShiftStateByBox[selectedBoxKey] ?? EMPTY_BOX_SHIFT_STATE;

  const updateBoxShiftState = useCallback((boxNumber: number, updater: (current: BoxShiftUiState) => BoxShiftUiState) => {
    const boxKey = getBoxKey(boxNumber);
    setBoxShiftStateByBox((current) => ({
      ...current,
      [boxKey]: updater(current[boxKey] ?? EMPTY_BOX_SHIFT_STATE),
    }));
  }, []);

  const syncSelectedBox = useCallback((nextBoxNumber: number) => {
    const boxKey = getBoxKey(nextBoxNumber);
    const nextBoxState = boxShiftStateByBox[boxKey] ?? EMPTY_BOX_SHIFT_STATE;

    setSelectedBoxNumber(nextBoxNumber);
    sessionStorage.setItem('selectedBoxNumber', String(nextBoxNumber));
    setSelectedEmployees(nextBoxState.employees);
    setActiveShiftId(nextBoxState.shiftId);
    setIsShiftActive(isKioskMode ? true : (isAdminMode ? nextBoxState.employees.length > 0 : nextBoxState.isShiftActive));
  }, [boxShiftStateByBox, isAdminMode, isKioskMode]);

  const [currentStep, setCurrentStep] = useState<CurrentStep>("idle");

  // 🔥 ФИКС 2026-05-11: уведомляем родителя (KioskOrderClient) когда оператор
  // перешёл в активный wizard. Родитель скрывает вспомогательные panels
  // (Pending vehicles, History) чтобы они не наезжали на список услуг.
  // Активные шаги: paymentSelection / aggregatorSelection / serviceSelection / confirmation.
  // Пассивные: idle / vehicleInput — там panels видны, оператор может выбрать оттуда.
  useEffect(() => {
    const isInWizard =
      currentStep !== 'idle' && currentStep !== 'vehicleInput';
    onWizardStateChange?.(isInWizard);
  }, [currentStep, onWizardStateChange]);

  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [allCounterAgents, setAllCounterAgents] = useState<CounterAgent[]>([]);
  const [allAggregators, setAllAggregators] = useState<Aggregator[]>([]);
  const [allWashEvents, setAllWashEvents] = useState<WashEvent[]>([]);
  const [retailPriceConfig, setRetailPriceConfig] = useState<RetailPriceConfig>({ mainPriceList: [], additionalPriceList: [], allowCustomRetailServices: true, cardAcquiringPercentage: 1.2 });
  // Phase 57c: список наших ИП для отображения бейджа «От имени ИП» в шаге подтверждения
  const [allOurCompanies, setAllOurCompanies] = useState<OurCompany[]>([]);

  useEffect(() => {
    setBoxShiftStateByBox({
      box1: {
        employees: scheduleByBox?.box1 || [],
        shiftId: shiftStateByBox?.box1?.shiftId || null,
        isShiftActive: shiftStateByBox?.box1?.isShiftActive || false,
      },
      box2: {
        employees: scheduleByBox?.box2 || [],
        shiftId: shiftStateByBox?.box2?.shiftId || null,
        isShiftActive: shiftStateByBox?.box2?.isShiftActive || false,
      },
    });
  }, [
    scheduleByBox?.box1,
    scheduleByBox?.box2,
    shiftStateByBox?.box1?.shiftId,
    shiftStateByBox?.box1?.isShiftActive,
    shiftStateByBox?.box2?.shiftId,
    shiftStateByBox?.box2?.isShiftActive,
  ]);

  const cameraSessionFromUrl = useMemo(() => {
    if (searchParams.get('camera') !== '1') {
      return null;
    }

    const dirName = String(searchParams.get('cameraDir') || '').trim();
    if (!dirName) {
      return null;
    }

    const boxRaw = String(searchParams.get('cameraBox') || searchParams.get('box') || initialBoxNumber || 1).trim();
    const boxNumber = boxRaw === '2' ? 2 : 1;
    const recognizedPlate = String(searchParams.get('cameraPlate') || '').trim();

    return {
      key: `${boxNumber}:${dirName}`,
      boxNumber: boxNumber as 1 | 2,
      dirName,
      recognizedPlate,
      normalizedRecognizedPlate: normalizeLicensePlate(recognizedPlate),
      vehicleClass: String(searchParams.get('cameraVehicleClass') || '').trim() || null,
      start: String(searchParams.get('cameraStart') || '').trim() || null,
      end: String(searchParams.get('cameraEnd') || '').trim() || null,
      mode: searchParams.get('cameraMode') === 'edit' ? 'edit' : 'checkout',
      correctionSaved: false,
    } satisfies CameraSessionContext;
  }, [initialBoxNumber, searchParams]);

  const buildCameraSessionMediaUrl = useCallback(
    (context: CameraSessionContext, kind: 'plate' | 'plate_crop' | 'thumbnail') => {
      const params = new URLSearchParams({
        box: String(context.boxNumber),
        dirName: context.dirName,
        kind,
      });
      return `/api/camera-session-media?${params.toString()}`;
    },
    []
  );

  const clearCameraSessionFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    [
      'camera',
      'cameraBox',
      'cameraDir',
      'cameraPlate',
      'cameraVehicleClass',
      'cameraStart',
      'cameraEnd',
      'cameraMode',
    ].forEach((key) => params.delete(key));

    cameraPrefillKeyRef.current = null;
    cameraAutoStartKeyRef.current = null;

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const cameraPreviewUrl = useMemo(() => {
    if (!cameraSessionContext) {
      return null;
    }
    return buildCameraSessionMediaUrl(cameraSessionContext, cameraPreviewKind);
  }, [buildCameraSessionMediaUrl, cameraPreviewKind, cameraSessionContext]);

  useEffect(() => {
    // Don't auto-add kiosk account as employee
    if (isKioskMode) return;
    if (loggedInEmployee && !isEmployeeAdmin(loggedInEmployee) && loggedInEmployee.role !== 'kiosk') {
      setSelectedEmployees(prev => {
        if (!prev.some(e => e.id === loggedInEmployee.id)) {
          return [...prev, loggedInEmployee];
        }
        return prev;
      });
    }
  }, [loggedInEmployee, isKioskMode]);

  // Save selectedEmployees to sessionStorage whenever they change
  useEffect(() => {
    if (selectedEmployees.length > 0) {
      sessionStorage.setItem('selectedEmployees', JSON.stringify(selectedEmployees));
    }
  }, [selectedEmployees]);

  useEffect(() => {
    if (!cameraSessionFromUrl) {
      setCameraSessionContext(null);
      setCameraPreviewKind('plate');
      cameraPrefillKeyRef.current = null;
      cameraAutoStartKeyRef.current = null;
      return;
    }

    setCameraSessionContext((prev) => ({
      ...cameraSessionFromUrl,
      correctionSaved: prev?.key === cameraSessionFromUrl.key ? prev.correctionSaved : false,
    }));
    setCameraPreviewKind(cameraSessionFromUrl.recognizedPlate ? 'plate' : 'thumbnail');
  }, [cameraSessionFromUrl]);

  const refreshClientDirectoriesForCheck = useCallback(async () => {
    const [agentsRes, aggregatorsRes] = await Promise.all([
      fetch('/api/counter-agents'),
      fetch('/api/aggregators'),
    ]);

    if (!agentsRes.ok || !aggregatorsRes.ok) {
      throw new Error('API error');
    }

    const [agentsData, aggregatorsData] = await Promise.all([
      agentsRes.json(),
      aggregatorsRes.json(),
    ]);

    const activeAgents = (agentsData as any[]).filter((a: any) => !(a.isArchived || a.archived));
    setAllCounterAgents(activeAgents);
    setAllAggregators(aggregatorsData);

    return {
      counterAgents: activeAgents as CounterAgent[],
      aggregators: aggregatorsData as Aggregator[],
    };
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (isShiftActive) {
        setIsLoading(true);
        try {
          const [agentsRes, aggregatorsRes, retailRes, employeesRes, washEventsRes, ourCompaniesRes] = await Promise.all([
            fetch('/api/counter-agents'),
            fetch('/api/aggregators'),
            fetch('/api/retail-price-config'),
            fetch('/api/employees'),
            fetch('/api/wash-events'),
            // Phase 57c: список наших ИП для бейджа «От имени ИП» (best-effort)
            fetch('/api/our-companies').catch(() => null),
          ]);

          if (!agentsRes.ok || !aggregatorsRes.ok || !retailRes.ok || !employeesRes.ok || !washEventsRes.ok) {
            throw new Error('API error');
          }

          const [agentsData, aggregatorsData, retailData, employeesData, washEventsData, ourCompaniesData] = await Promise.all([
            agentsRes.json(),
            aggregatorsRes.json(),
            retailRes.json(),
            employeesRes.json(),
            washEventsRes.json(),
            ourCompaniesRes && ourCompaniesRes.ok ? ourCompaniesRes.json() : [],
          ]);

          // Filter active counter agents
          const activeAgents = (agentsData as any[]).filter((a: any) => !(a.isArchived || a.archived));
          setAllCounterAgents(activeAgents);
          setAllAggregators(aggregatorsData);
          setRetailPriceConfig(retailData);
          const activeEmployees = (employeesData as any[]).filter((e: any) => e.role !== 'admin' && e.role !== 'kiosk');
          setAllEmployees(activeEmployees);
          setEmployeeMap(new Map(activeEmployees.map((e: any) => [e.id, e.fullName])));
          setAllWashEvents(washEventsData);
          // Phase 57c: ИП для бейджа (best-effort, не блокирует терминал)
          setAllOurCompanies(Array.isArray(ourCompaniesData) ? ourCompaniesData : []);
        } catch (error) {
          console.error("Error fetching data for workstation:", error);
          toast({ title: "Ошибка", description: "Не удалось загрузить данные для рабочей станции.", variant: "destructive"});
          setAllCounterAgents([]);
          setAllAggregators([]);
          setAllEmployees([]);
          setAllWashEvents([]);
          setAllOurCompanies([]);
          setRetailPriceConfig({ mainPriceList: [], additionalPriceList: [], allowCustomRetailServices: true, cardAcquiringPercentage: 1.2 });
        } finally {
          setIsLoading(false);
        }
      }
    }
    fetchData();
  }, [isShiftActive, toast]);

  useEffect(() => {
    sessionStorage.setItem('isShiftActive', String(isShiftActive));
    if (activeShiftId) {
      sessionStorage.setItem('activeShiftId', activeShiftId);
    } else {
      sessionStorage.removeItem('activeShiftId');
    }
    if (isShiftActive) {
      setCurrentStep("vehicleInput");
    } else {
      setCurrentStep("idle");
      sessionStorage.removeItem('selectedEmployees'); // Clear saved employees when shift ends
      resetForm();
    }
  }, [isShiftActive, activeShiftId]);

  // ── Таймер мойки ──
  useEffect(() => {
    if (!washTimerStart) return;
    const interval = setInterval(() => {
      setWashTimerElapsed(Math.floor((Date.now() - washTimerStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [washTimerStart]);

  // Запуск таймера при переходе к выбору услуг
  useEffect(() => {
    if (currentStep === 'serviceSelection' && !washTimerStart) {
      setWashTimerStart(Date.now());
    }
    if (currentStep === 'vehicleInput' || currentStep === 'idle') {
      setWashTimerStart(null);
      setWashTimerElapsed(0);
    }
  }, [currentStep]);

  // Phase 60a/b — синхронизация ФИО водителя из split-modal в общее поле.
  //   Если кассир выбрал водителя через SplitDriverCard — автоматически прописываем в driverNameInput
  //   (можно потом поправить вручную). Не перезаписываем, если уже что-то введено.
  useEffect(() => {
    if (selectedDriver?.name && !driverNameInput) {
      setDriverNameInput(selectedDriver.name);
    }
  }, [selectedDriver?.name]);

  useEffect(() => {
    if (!cameraSessionContext) {
      return;
    }

    if (cameraPrefillKeyRef.current !== cameraSessionContext.key && cameraSessionContext.recognizedPlate) {
      setVehicleNumberInput(cameraSessionContext.recognizedPlate);
      setNormalizedVehicleNumber(cameraSessionContext.normalizedRecognizedPlate);
      cameraPrefillKeyRef.current = cameraSessionContext.key;
    }

    if (
      cameraSessionContext.mode === 'checkout' &&
      cameraSessionContext.recognizedPlate &&
      isShiftActive &&
      selectedEmployees.length > 0 &&
      !isLoading &&
      cameraAutoStartKeyRef.current !== cameraSessionContext.key
    ) {
      cameraAutoStartKeyRef.current = cameraSessionContext.key;
      setVehicleNumberInput(cameraSessionContext.recognizedPlate);
      setNormalizedVehicleNumber(cameraSessionContext.normalizedRecognizedPlate);
      void checkVehicleNumber(cameraSessionContext.recognizedPlate);
    }
  }, [cameraSessionContext, isLoading, isShiftActive, selectedEmployees.length]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ── Звук при OCR распознавании ──
  const playOcrSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, []);

  const handleVehicleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVehicleNumberInput(e.target.value);
    if (currentStep !== "vehicleInput" && currentStep !== "idle") {
        resetFormStateForNewVehicle(true, false, !ocrData, false);
    }
  };

  const handlePlateRecognized = (plateNumber: string, imageBase64?: string) => {
    setVehicleNumberInput(plateNumber);
    // Звуковой сигнал при успешном распознавании
    playOcrSound();
    // Запоминаем OCR-результат для возможного сохранения при исправлении
    setOcrData(imageBase64 ? { originalOcr: plateNumber, imageBase64 } : null);
    // Автоматически проверяем номер после распознавания
    setTimeout(() => {
      const normalizedInput = normalizeLicensePlate(plateNumber);
      setNormalizedVehicleNumber(normalizedInput);
      // Trigger checkVehicleNumber if employees selected (isAutoCheck=true чтобы не затереть ocrData)
      if (selectedEmployees.length > 0) {
        checkVehicleNumber(plateNumber, true);
      }
    }, 100);
  };

  const shouldPersistCameraSessionCorrection = (normalizedInput: string) => {
    if (!cameraSessionContext || cameraSessionContext.correctionSaved || !normalizedInput) {
      return false;
    }

    if (!cameraSessionContext.normalizedRecognizedPlate) {
      return true;
    }

    return cameraSessionContext.normalizedRecognizedPlate !== normalizedInput;
  };

  const blobToDataUrl = (blob: Blob) => (
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Не удалось преобразовать изображение в base64'));
      };
      reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать изображение'));
      reader.readAsDataURL(blob);
    })
  );

  const persistCameraSessionCorrection = async (normalizedInput: string, silent = false) => {
    if (!cameraSessionContext || !shouldPersistCameraSessionCorrection(normalizedInput)) {
      return true;
    }

    try {
      const mediaKinds: Array<'plate' | 'thumbnail'> = cameraSessionContext.recognizedPlate
        ? ['plate', 'thumbnail']
        : ['thumbnail', 'plate'];

      let imageBase64 = '';

      for (const kind of mediaKinds) {
        const response = await fetch(buildCameraSessionMediaUrl(cameraSessionContext, kind), {
          cache: 'no-store',
        });

        if (!response.ok) {
          continue;
        }

        const blob = await response.blob();
        imageBase64 = await blobToDataUrl(blob);
        setCameraPreviewKind(kind);
        break;
      }

      if (!imageBase64) {
        throw new Error('Не удалось загрузить фото сессии камеры');
      }

      const response = await fetch('/api/ocr-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          originalOcr: cameraSessionContext.recognizedPlate || 'not_recognized',
          correctedOcr: normalizedInput,
          source: `camera_session:${cameraSessionContext.boxNumber}:${cameraSessionContext.dirName}`,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Не удалось сохранить исправление камеры');
      }

      setCameraSessionContext((prev) => (
        prev ? { ...prev, correctionSaved: true } : prev
      ));
      return true;
    } catch (error: any) {
      console.error('Failed to persist camera session correction:', error);
      if (!silent) {
        toast({
          title: "Исправление номера не сохранено",
          description: "Фото сессии не удалось отправить в OCR-разбор. Заказ можно провести, но исправление лучше повторить позже.",
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const handlePlateRecognitionFailed = ({
    imageBase64,
    failedFilename,
  }: {
    imageBase64?: string;
    failedFilename?: string;
  }) => {
    if (!imageBase64 && !failedFilename) {
      return;
    }

    setOcrData({
      originalOcr: 'not_recognized',
      imageBase64,
      failedFilename,
    });
  };

  const shouldPersistOcrCorrection = (normalizedInput: string) => {
    return Boolean(
      ocrData && (
        ocrData.originalOcr === 'not_recognized'
        || normalizeLicensePlate(ocrData.originalOcr) !== normalizedInput
      )
    );
  };

  const persistOcrCorrection = async (normalizedInput: string, silent = false) => {
    if (!ocrData || !shouldPersistOcrCorrection(normalizedInput)) {
      return true;
    }

    try {
      const response = await fetch('/api/ocr-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: ocrData.failedFilename,
          imageBase64: ocrData.imageBase64,
          originalOcr: ocrData.originalOcr,
          correctedOcr: normalizedInput,
          source: 'web',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Не удалось сохранить OCR-фото');
      }

      setOcrData(null);
      return true;
    } catch (error: any) {
      console.error('Failed to persist OCR correction:', error);
      if (!silent) {
        toast({
          title: "OCR фото не сохранено",
          description: "Исправленное фото не удалось сохранить. Будет повторная попытка при подтверждении мойки.",
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const checkVehicleNumber = async (providedNumber?: string, isAutoCheck = false) => {
    const numberToCheck = providedNumber || vehicleNumberInput;

    if (selectedEmployees.length === 0) {
      toast({ title: "Ошибка", description: "Выберите хотя бы одного сотрудника.", variant: "destructive" });
      return;
    }
    if (!numberToCheck.trim()) {
      toast({ title: "Ошибка", description: "Введите номер машины.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const normalizedInput = normalizeLicensePlate(numberToCheck);
    setNormalizedVehicleNumber(normalizedInput);
    let counterAgentsForCheck = allCounterAgents;
    let aggregatorsForCheck = allAggregators;

    if (!isAutoCheck) {
      // Ручная проверка — сохраняем OCR-исправление если номер изменён
      let clearOcrAfterReset = !ocrData;
      if (shouldPersistOcrCorrection(normalizedInput)) {
        clearOcrAfterReset = await persistOcrCorrection(normalizedInput);
      } else if (ocrData) {
        setOcrData(null); // номер совпал — сохранять не нужно
      }

      if (shouldPersistCameraSessionCorrection(normalizedInput)) {
        await persistCameraSessionCorrection(normalizedInput);
      }

      resetFormStateForNewVehicle(true, false, clearOcrAfterReset, false);
      if (ocrData && !shouldPersistOcrCorrection(normalizedInput)) {
        setOcrData(ocrData);
      }

      try {
        const refreshedDirectories = await refreshClientDirectoriesForCheck();
        counterAgentsForCheck = refreshedDirectories.counterAgents;
        aggregatorsForCheck = refreshedDirectories.aggregators;
      } catch (error) {
        console.error("Error refreshing client directories for workstation:", error);
        toast({
          title: "Справочники не обновились",
          description: "Используем уже загруженные данные. Если вы только что меняли контрагента, попробуйте ещё раз через пару секунд.",
          variant: "destructive",
        });
      }
    } else {
      // Авто-проверка после OCR — НЕ трогаем ocrData (stale closure issue)
      resetFormStateForNewVehicle(true, false, false, false);
    }

    // Find last wash for this vehicle
    const vehicleWashes = allWashEvents.filter(
      event => normalizeLicensePlate(event.vehicleNumber) === normalizedInput
    );
    const lastWash = vehicleWashes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (lastWash) {
        const services = [lastWash.services.main, ...lastWash.services.additional];
        setLastWashServices(services.map(s => ({ ...s, id: s.id || `last-wash-service-${s.serviceName}`, isFromLastWash: true })));
        if (lastWash.driverComments && lastWash.driverComments.length > 0) {
          setLastWashComment(lastWash.driverComments[lastWash.driverComments.length - 1]);
        }
        // Phase 60a/b — пред-заполнить ФИО водителя и роспись из последней мойки на этом номере.
        // Сотрудник видит «уже было: <ФИО>», может оставить или поправить.
        const prevDriverName = (lastWash as any).driverName
          || (lastWash as any).driverKickback?.driverName
          || '';
        if (prevDriverName) {
          setDriverNameInput(prevDriverName);
        }
        const prevSignature = (lastWash as any).driverSignature;
        if (prevSignature) {
          setDriverSignatureDataUrl(prevSignature);
        }
    }

    const agent = counterAgentsForCheck.find(ca =>
      ca.cars.some(car => normalizeLicensePlate(car.licensePlate) === normalizedInput)
    );

    if (agent) {
      setFoundCounterAgent(agent);
      if (agent.priceList && agent.priceList.length > 0) {
        setSelectedPaymentMethod("counterAgentContract");
        setCurrentStep("serviceSelection");
        toast({
          title: "Контрагент найден!",
          description: `${agent.name}. Применяется договорной прайс-лист.`,
        });
      } else {
        toast({
          title: "Ошибка данных контрагента",
          description: `У контрагента ${agent.name} нет прайс-листа. Обслуживание невозможно.`,
          variant: "destructive",
        });
          setCurrentStep("vehicleInput");
      }
      setIsLoading(false);
      return;
    }

    const aggregatorsWithCar = aggregatorsForCheck.filter(agg =>
      agg.cars.some(car => normalizeLicensePlate(car.licensePlate) === normalizedInput)
    );

    if (aggregatorsWithCar.length > 0) {
      setFoundAggregators(aggregatorsWithCar);
      toast({ title: "Машина найдена в базе агрегаторов", description: `Рекомендуется выбрать оплату через агрегатора.` });
    } else {
      toast({ title: "Контрагент не найден", description: `Продолжите как розничный клиент.` });
    }

    setCurrentStep("paymentSelection");
    setIsLoading(false);
  };

  const syncShiftTeam = useCallback(async (nextEmployees: Employee[], boxNumber: number, shiftId: string | null) => {
    const response = await fetch('/api/workstation/shift', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId,
        boxNumber,
        employeeIds: nextEmployees.map((employee) => employee.id),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Не удалось обновить команду бокса ${boxNumber}`);
    }

    const data = await response.json();
    router.refresh();
    return data.shift as { id?: string; status?: string } | undefined;
  }, [router]);

  const handleEmployeeSelect = async (employee: Employee) => {
    if (loggedInEmployee && employee.id === loggedInEmployee.id && !isEmployeeAdmin(loggedInEmployee)) {
        toast({ title: "Нельзя снять себя", description: "Вы не можете убрать себя из команды.", variant: "destructive"});
        return;
    }

    const nextEmployees = selectedEmployees.some((selectedEmployee) => selectedEmployee.id === employee.id)
      ? selectedEmployees.filter((selectedEmployee) => selectedEmployee.id !== employee.id)
      : [...selectedEmployees, employee];

    setSelectedEmployees(nextEmployees);
    updateBoxShiftState(selectedBoxNumber, (current) => ({
      ...current,
      employees: nextEmployees,
    }));

    setIsShiftLoading(true);
    try {
      const updatedShift = await syncShiftTeam(nextEmployees, selectedBoxNumber, selectedBoxState.shiftId);
      if (updatedShift?.id) {
        setActiveShiftId(updatedShift.id);
      }
      updateBoxShiftState(selectedBoxNumber, (current) => ({
        ...current,
        employees: nextEmployees,
        shiftId: updatedShift?.id || current.shiftId,
        isShiftActive: updatedShift?.status === 'active' ? true : (updatedShift?.status === 'scheduled' ? false : current.isShiftActive),
      }));
      toast({
        title: "Команда бокса обновлена",
        description: `Изменения по боксу ${selectedBoxNumber} сохранены и будут видны на других экранах после обновления.`,
      });
    } catch (error: any) {
      toast({
        title: "Не удалось синхронизировать смену",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsShiftLoading(false);
    }
  };

  const handlePaymentMethodSelect = (method: "cash" | "card" | "transfer" | "aggregator") => {
    setSelectedPaymentMethod(method);
    setSelectedAggregator(null);
    setWashServices([]);

    if (method === 'aggregator') {
      if(allAggregators.length > 0) {
        setTempSelectedAggregatorId(foundAggregators?.[0]?.id);
        setCurrentStep("aggregatorSelection");
      } else {
        toast({ title: "Нет доступных агрегаторов", description: "Пожалуйста, добавьте агрегаторов в систему.", variant: "destructive" });
        setSelectedPaymentMethod(null);
        setCurrentStep("paymentSelection");
      }
    } else if (method === 'cash' || method === 'card' || method === 'transfer') {
      setCurrentStep("serviceSelection");
    }
  };

  const confirmAggregatorSelection = () => {
    if (!tempSelectedAggregatorId) return;
    const aggregator = allAggregators.find(a => a.id === tempSelectedAggregatorId);
    if (!aggregator) {
        toast({ title: "Ошибка", description: "Выбранный агрегатор не найден.", variant: "destructive" });
        return;
    }

    setSelectedAggregator(aggregator);
    setWashServices([]);

    const activePriceList = aggregator.priceLists.find(p => p.name === aggregator.activePriceListName) ?? aggregator.priceLists[0];

    if (activePriceList && activePriceList.services.length > 0) {
      setCurrentStep("serviceSelection");
    } else {
       toast({ title: "Нет услуг", description: `У агрегатора ${aggregator.name} нет активных услуг в прайс-листе.`, variant: "destructive" });
    }
  }

  const handleServiceSelect = (service: PriceListItem) => {
    setWashServices(prev => {
        const serviceWithId = { ...service, id: `service-${service.serviceName}-${Date.now()}` };
        // Check if service already exists
        if(prev.some(s => s.serviceName === service.serviceName)) {
            return prev.filter(s => s.serviceName !== service.serviceName); // Deselect
        }
        return [...prev, serviceWithId]; // Select
    });
  };

  // Phase 58b: всегда добавляет копию (для счётчика «Доп час ×N»).
  // НЕ снимает существующее как handleServiceSelect — только инкремент.
  const handleServiceAddMore = (service: PriceListItem) => {
    setWashServices(prev => {
      const newId = `service-${service.serviceName}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      return [...prev, { ...service, id: newId }];
    });
  };

  const handleAddCustomExtraService = () => {
    if (!customExtraServiceName.trim() || !customExtraServicePrice.trim()) {
      toast({ title: "Ошибка", description: "Введите название и цену для дополнительной услуги.", variant: "destructive" });
      return;
    }
    const price = parseFloat(customExtraServicePrice);
    if (isNaN(price) || price < 0) {
      toast({ title: "Ошибка", description: "Цена дополнительной услуги должна быть положительным числом.", variant: "destructive" });
      return;
    }
    const serviceWithId = {
      serviceName: customExtraServiceName,
      price,
      isCustom: true,
      id: `custom-${customExtraServiceName}-${Date.now()}`
    };
    setWashServices(prev => [...prev, serviceWithId]);

    setCustomExtraServiceName('');
    setCustomExtraServicePrice('');
  };

  const handleRemoveService = (serviceId: string) => {
    setWashServices(washServices.filter(s => s.id !== serviceId));
  };

  const calculateTotalPrice = () => {
    return washServices.reduce((sum, s) => sum + s.price, 0);
  };

  const calculateTotalChemicalConsumption = () => {
    return washServices.reduce((sum, s) => sum + (s.chemicalConsumption || 0), 0);
  };

  const proceedToConfirmation = () => {
    if (washServices.length === 0) {
        toast({ title: "Ошибка", description: "Не выбрано ни одной услуги.", variant: "destructive" });
        return;
    }
    setCurrentStep("confirmation");
  }

  const showPrices = selectedPaymentMethod !== 'counterAgentContract';

  const paymentMethodLabels: Record<OperationPaymentMethod, string> = {
    cash: 'Наличные',
    card: 'Карта',
    transfer: 'Перевод',
    aggregator: 'Агрегатор',
    counterAgentContract: 'По договору',
  };

  const totalAmount = calculateTotalPrice();
  const totalChemicalGrams = calculateTotalChemicalConsumption();
  const acquiringFee = selectedPaymentMethod === 'card' && retailPriceConfig.cardAcquiringPercentage
      ? totalAmount * ((retailPriceConfig.cardAcquiringPercentage || 0) / 100)
      : 0;
  const netAmount = totalAmount - acquiringFee;

  const confirmWash = async () => {
    setIsLoading(true);

    if (shouldPersistOcrCorrection(normalizedVehicleNumber)) {
      await persistOcrCorrection(normalizedVehicleNumber, true);
    }
    if (shouldPersistCameraSessionCorrection(normalizedVehicleNumber)) {
      await persistCameraSessionCorrection(normalizedVehicleNumber, true);
    }

    let finalSelectedAggregator = selectedAggregator;

    if (selectedPaymentMethod === 'aggregator' && selectedAggregator) {
        finalSelectedAggregator = allAggregators.find(a => a.id === selectedAggregator.id) || selectedAggregator;
        if (!finalSelectedAggregator) {
            toast({ title: "Ошибка", description: "Не удалось определить выбранного агрегатора.", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        const carExists = finalSelectedAggregator.cars.some(
          car => normalizeLicensePlate(car.licensePlate) === normalizedVehicleNumber
        );
        if (!carExists) {
            const newCar: CarType = {
                id: `car_${finalSelectedAggregator.id}_${finalSelectedAggregator.cars.length + 1}_${normalizedVehicleNumber}`,
                licensePlate: normalizedVehicleNumber
            };
            const updatedAggregator = { ...finalSelectedAggregator, cars: [...finalSelectedAggregator.cars, newCar] };

            try {
                const response = await fetch(`/api/aggregators/${finalSelectedAggregator.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedAggregator)
                });
                if (!response.ok) {
                    console.error(`Не удалось добавить машину ${normalizedVehicleNumber} в автопарк агрегатора.`);
                } else {
                    setAllAggregators(prev => prev.map(a => a.id === updatedAggregator.id ? updatedAggregator : a));
                    // Cache invalidated by API PUT
                }
            } catch (error) {
                 console.error(`Сетевая ошибка при сохранении машины в автопарк агрегатора.`);
            }
        }
    }

    if (washServices.length === 0 || !selectedPaymentMethod || selectedEmployees.length === 0) {
        toast({ title: "Ошибка", description: "Недостаточно данных для сохранения: проверьте выбор исполнителей и услуг.", variant: "destructive" });
        setIsLoading(false);
        return;
    }

	    const createDefaultConsumptions = (service: PriceListItem): EmployeeConsumption[] => {
	        const totalConsumption = service.chemicalConsumption || 0;
	        const perEmployee = selectedEmployees.length > 0 ? totalConsumption / selectedEmployees.length : 0;
	        return selectedEmployees.map(emp => ({
	            employeeId: emp.id,
	            amount: perEmployee
	        }));
	    };

    const getPriceListNameForAggregator = () => {
      if (selectedPaymentMethod !== 'aggregator' || !finalSelectedAggregator) return undefined;
      const activeList = finalSelectedAggregator.priceLists.find(pl => pl.name === finalSelectedAggregator.activePriceListName) ?? finalSelectedAggregator.priceLists[0];
      return activeList?.name;
    }

    const mainService = washServices[0];
    const additional = washServices.slice(1);

    const newWashComment = driverComment ? { text: driverComment, authorId: loggedInEmployee!.id, date: new Date().toISOString() } : undefined;
    const cameraSessionLink = cameraSessionContext ? {
      dirName: cameraSessionContext.dirName,
      boxNumber: cameraSessionContext.boxNumber,
      originalPlate: cameraSessionContext.recognizedPlate || null,
      correctedPlate: normalizedVehicleNumber || null,
      vehicleClass: cameraSessionContext.vehicleClass,
      start: cameraSessionContext.start,
      end: cameraSessionContext.end,
      source: 'operations-camera' as const,
    } : undefined;

    // 🔥 ФИКС 11b: для ретроспективного оформления (camera-сессия из прошлого)
    // используем реальное время по камере, а не «сегодня сейчас». Иначе вчерашняя
    // мойка попадает в сегодняшнюю смену, ломая отчёты и зарплату.
    function normalizeCameraTimestamp(value: string | null | undefined): string | null {
      if (!value) return null;
      const normalized = value.includes('_') ? value.replace('_', 'T') : value;
      const parsed = new Date(normalized);
      return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }
    const isRetrospective = !!cameraSessionLink;
    const washTimestamp = isRetrospective
      ? (normalizeCameraTimestamp(cameraSessionLink!.end) ||
         normalizeCameraTimestamp(cameraSessionLink!.start) ||
         new Date().toISOString())
      : new Date().toISOString();

    // Phase 51c / V2-#4 split-pricing: подмешиваем driverKickback meta если split-услуга.
    const hasSplitServiceLocal = washServices.some((s) => (s as any).split?.driverBonus > 0);
    const driverKickbackPayload = hasSplitServiceLocal && selectedDriver?.name
      ? {
          driverName: selectedDriver.name,
          driverPhone: selectedDriver.phone || undefined,
          plate: normalizedVehicleNumber || undefined,
        }
      : undefined;

	    const washEventToSave: Omit<WashEvent, 'driverComments'> & { driverComments?: WashComment[] } = {
        id: `we_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: washTimestamp,
        vehicleNumber: normalizedVehicleNumber,
        employeeIds: selectedEmployees.map(e => e.id),
        paymentMethod: selectedPaymentMethod,
        sourceId: selectedPaymentMethod === 'aggregator' ? finalSelectedAggregator?.id : (selectedPaymentMethod === 'counterAgentContract' ? foundCounterAgent?.id : undefined),
        sourceName: selectedPaymentMethod === 'aggregator' ? finalSelectedAggregator?.name : (selectedPaymentMethod === 'counterAgentContract' ? foundCounterAgent?.name : undefined),
        priceListName: getPriceListNameForAggregator(),
        totalAmount: totalAmount,
        netAmount: netAmount,
        acquiringFee: acquiringFee,
        services: {
            main: {
                ...mainService,
                employeeConsumptions: createDefaultConsumptions(mainService)
            },
            additional: additional.map(s => ({
                ...s,
                employeeConsumptions: createDefaultConsumptions(s)
            })),
        },
        driverComments: newWashComment ? [newWashComment] : undefined,
        tips: tipsInput ? parseFloat(tipsInput) || 0 : undefined,
        washDurationSeconds: washTimerElapsed > 0 ? washTimerElapsed : undefined,
        shiftId: activeShiftId || undefined,
        boxNumber: selectedBoxNumber as 1 | 2,
        cameraSession: cameraSessionLink,
        // Phase 51c: метаданные водителя для backend Phase 50d
        // (создаст DriverKickback после atomic POST)
        ...(driverKickbackPayload ? { driverKickback: driverKickbackPayload } : {}),
        // Phase 60a/b — ФИО водителя + цифровая роспись (только для split-услуг + contract).
        // Поле UI скрыто для разовых/не-split, поэтому даже если state остался — не отправляем.
        ...(selectedPaymentMethod === 'counterAgentContract' && hasSplitServiceLocal && driverNameInput.trim()
          ? { driverName: driverNameInput.trim() } : {}),
        ...(selectedPaymentMethod === 'counterAgentContract' && hasSplitServiceLocal && driverSignatureDataUrl
          ? { driverSignature: driverSignatureDataUrl } : {}),
    };

    try {
        const response = await fetch('/api/wash-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(washEventToSave),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Не удалось сохранить мойку.');
        }

        // Phase 60c/e — fire-and-forget: сохранить роспись на CounterAgent.drivers[*].signature
        //   только если это СВЕЖАЯ роспись (cached уже лежит у водителя). Не блокируем UI.
        if (
          selectedPaymentMethod === 'counterAgentContract' &&
          hasSplitServiceLocal &&
          foundCounterAgent?.id &&
          driverNameInput.trim() &&
          driverSignatureDataUrl &&
          driverSignatureSource === 'fresh'
        ) {
          fetch(`/api/counter-agents/${foundCounterAgent.id}/drivers/save-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              driverName: driverNameInput.trim(),
              signature: driverSignatureDataUrl,
              // overwrite=false — не перетираем существующий образец
              overwrite: false,
            }),
          }).catch(err => console.warn('[Phase 60c] save driver signature failed (non-blocking):', err));
        }

        toast({
            title: "Мойка зарегистрирована!",
            description: `Данные о мойке для ${normalizedVehicleNumber} успешно сохранены в журнале.`,
            variant: "default",
        });
        setAllWashEvents(prev => [washEventToSave as WashEvent, ...prev]);
        resetFormStateForNewVehicle(false, true, true, true);
    } catch (error: any) {
        console.error("Error saving wash event:", error);
        toast({
            title: "Ошибка сохранения",
            description: error.message,
            variant: "destructive",
        });
    } finally {
        setIsLoading(false);
    }
  };

  const resetFormStateForNewVehicle = (soft = false, keepEmployees = false, clearOcr = true, clearCameraContext = false) => {
    if(!soft) {
      setVehicleNumberInput('');
      setNormalizedVehicleNumber('');
      if (!keepEmployees) {
        if ((isKioskMode || isAdminMode) && selectedBoxState.employees.length > 0) {
          setSelectedEmployees(selectedBoxState.employees);
        } else {
          setSelectedEmployees((loggedInEmployee && !isEmployeeAdmin(loggedInEmployee) && loggedInEmployee.role !== 'kiosk') ? [loggedInEmployee] : []);
        }
      }
    }
    setFoundCounterAgent(null);
    setFoundAggregators([]);
    setSelectedPaymentMethod(null);
    setSelectedAggregator(null);
    // Phase 51c: reset split-driver state на новую мойку
    setSelectedDriver(null);
    setDriverPickerOpen(false);
    setNewDriverName('');
    setNewDriverPhone('');
    // Phase 60a/b — reset driver name + signature
    setDriverNameInput('');
    setDriverSignatureDataUrl(null);
    setDriverSignatureSource(null);
    setWashServices([]);
    setCustomExtraServiceName('');
    setCustomExtraServicePrice('');
    setLastWashServices(null);
    setLastWashComment(null);
    setDriverComment('');
    setTipsInput('');
    setWashTimerStart(null);
    setWashTimerElapsed(0);
    setCurrentStep(isShiftActive ? "vehicleInput" : "idle");
    setServiceSearchQuery('');
    setTempSelectedAggregatorId(undefined);
    if (clearOcr) {
      setOcrData(null);
    }
    if (clearCameraContext) {
      setCameraSessionContext(null);
      setCameraPreviewKind('plate');
      clearCameraSessionFromUrl();
    }
  }

  const resetForm = () => {
    resetFormStateForNewVehicle(false, false, true, true);
  };

  const canAddCustomServices =
    (['cash', 'card', 'transfer'].includes(selectedPaymentMethod || '') && (retailPriceConfig.allowCustomRetailServices ?? true)) ||
    (selectedPaymentMethod === 'counterAgentContract' && (foundCounterAgent?.allowCustomServices ?? true));

  const predefinedExtraServices =
    ['cash', 'card', 'transfer'].includes(selectedPaymentMethod || '') ? retailPriceConfig.additionalPriceList :
    (selectedPaymentMethod === 'counterAgentContract' ? foundCounterAgent?.additionalPriceList :
    []);

  const getAggregatorActiveServices = () => {
    if (selectedPaymentMethod !== 'aggregator' || !selectedAggregator) return [];
    const activeList = selectedAggregator.priceLists.find(pl => pl.name === selectedAggregator.activePriceListName) ?? selectedAggregator.priceLists[0];
    return activeList?.services || [];
  };

  const servicesToShow =
    selectedPaymentMethod === 'counterAgentContract' && foundCounterAgent?.priceList ? foundCounterAgent.priceList :
    selectedPaymentMethod === 'aggregator' ? getAggregatorActiveServices() :
    ['cash', 'card', 'transfer'].includes(selectedPaymentMethod || '') ? retailPriceConfig.mainPriceList :
    [];

  const sortedServices = useMemo(() => {
      const allAvailableServices = [...servicesToShow];
      const serviceNames = new Set(allAvailableServices.map(s => s.serviceName));

      // Add services from the last wash if they don't already exist in the current price list
      if (lastWashServices) {
          lastWashServices.forEach(lastService => {
              if (!serviceNames.has(lastService.serviceName)) {
                  allAvailableServices.push(lastService);
                  serviceNames.add(lastService.serviceName);
              }
          });
      }

      return allAvailableServices.slice().sort((a, b) => {
          const aIsFromLast = lastWashServices?.some(s => s.serviceName === a.serviceName);
          const bIsFromLast = lastWashServices?.some(s => s.serviceName === b.serviceName);

          if (aIsFromLast && !bIsFromLast) return -1;
          if (!aIsFromLast && bIsFromLast) return 1;

          const aName = a.serviceName.toLowerCase();
          const bName = b.serviceName.toLowerCase();
          const aIsPriority = priorityServiceKeywords.some(keyword => aName.includes(keyword));
          const bIsPriority = priorityServiceKeywords.some(keyword => bName.includes(keyword));

          if (aIsPriority && !bIsPriority) return -1;
          if (!aIsPriority && bIsPriority) return 1;

          return a.serviceName.localeCompare(b.serviceName);
      });
  }, [servicesToShow, lastWashServices]);

  // Phase 58a: топ-3 услуг по реальной частоте использования за последние 60 дней,
  // фильтр по текущему источнику (counterAgent / aggregator / retail). Передаётся
  // в KioskServiceSelectionStep вместо `services.slice(0, 3)` как раньше.
  const topServicesForSource = useMemo<PriceListItem[]>(() => {
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const since = Date.now() - SIXTY_DAYS_MS;
    const isCounterAgent = selectedPaymentMethod === 'counterAgentContract' && foundCounterAgent;
    const isAggregator = selectedPaymentMethod === 'aggregator' && (selectedAggregator || foundAggregators?.[0]);
    const isRetail = ['cash', 'card', 'transfer'].includes(selectedPaymentMethod || '');
    const aggId = isAggregator ? ((selectedAggregator?.id) ?? (foundAggregators?.[0]?.id)) : undefined;
    const caId = isCounterAgent ? foundCounterAgent?.id : undefined;

    // Filter washEvents by source + period
    const relevant = allWashEvents.filter(we => {
      const ts = new Date(we.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < since) return false;
      if (isCounterAgent) {
        // legacy: paymentMethod might be 'transfer' for contractor — check counterAgentId via sourceId
        return we.paymentMethod === 'counterAgentContract' && (we as any).sourceId === caId;
      }
      if (isAggregator) {
        return we.paymentMethod === 'aggregator' && (we as any).sourceId === aggId;
      }
      if (isRetail) {
        return ['cash', 'card', 'transfer'].includes(we.paymentMethod);
      }
      return false;
    });

    // Count frequency per serviceName (main + additional)
    const freq = new Map<string, { count: number; price: number; src?: PriceListItem }>();
    relevant.forEach(we => {
      const list: any[] = [];
      if (we.services?.main?.serviceName) list.push(we.services.main);
      if (Array.isArray(we.services?.additional)) list.push(...we.services.additional);
      list.forEach(svc => {
        const name = svc?.serviceName;
        if (!name) return;
        const existing = freq.get(name);
        if (existing) existing.count += 1;
        else freq.set(name, { count: 1, price: svc.price ?? 0 });
      });
    });

    // Привяжем к актуальной цене из текущего прайса (если услуга всё ещё есть)
    const fromPrice = new Map(servicesToShow.map(s => [s.serviceName, s] as const));
    const result: PriceListItem[] = [];
    Array.from(freq.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([name, info]) => {
        const fromCurrent = fromPrice.get(name);
        if (fromCurrent) result.push(fromCurrent);
        // если услуги больше нет в прайсе — пропускаем (нечего предлагать)
      });
    return result;
  }, [allWashEvents, selectedPaymentMethod, foundCounterAgent, selectedAggregator, foundAggregators, servicesToShow]);

  const filteredServices = useMemo(() => {
    const query = serviceSearchQuery.trim().toLowerCase();
    if (!query) {
      return sortedServices;
    }

    const numericQuery = query.replace(/[^\d.,]/g, '').replace(',', '.');
    const hasNumericQuery = numericQuery.length > 0;

    const ranked = sortedServices
      .map((service, index) => {
        const name = service.serviceName.toLowerCase();
        const priceValue = service.price ?? '';
        const priceText = String(priceValue).toLowerCase();

        let score = 0;

        if (name === query) score += 120;
        else if (name.startsWith(query)) score += 90;
        else if (name.includes(query)) score += 60;

        if (hasNumericQuery) {
          if (priceText === numericQuery) score += 110;
          else if (priceText.startsWith(numericQuery)) score += 80;
          else if (priceText.includes(numericQuery)) score += 50;
        }

        return { service, score, index };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map(entry => entry.service);

    return ranked;
  }, [serviceSearchQuery, sortedServices]);

  const handleStartShift = async () => {
    if (selectedEmployees.length === 0) {
      toast({ title: "Ошибка", description: "Выберите хотя бы одного сотрудника", variant: "destructive" });
      return;
    }
    setIsShiftLoading(true);
    try {
      const res = await fetch('/api/workstation/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: selectedEmployees.map(e => e.id),
          boxNumber: selectedBoxNumber,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Не удалось начать смену');
      }
      const data = await res.json();
      const shiftId = data.shift?.id;
      if (shiftId) {
        setActiveShiftId(shiftId);
        sessionStorage.setItem('activeShiftId', shiftId);
      }
      updateBoxShiftState(selectedBoxNumber, (current) => ({
        ...current,
        employees: selectedEmployees,
        shiftId: shiftId || current.shiftId,
        isShiftActive: true,
      }));
      setIsShiftActive(true);
      sessionStorage.setItem('isShiftActive', 'true');
      router.refresh();
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } finally {
      setIsShiftLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (!activeShiftId) {
      setIsShiftActive(false);
      return;
    }
    setIsShiftLoading(true);
    try {
      const res = await fetch('/api/workstation/shift', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: activeShiftId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Не удалось завершить смену');
      }
      const data = await res.json();
      const summary = data.summary || { totalWashes: 0 };
      // Phase 60g — НЕ показываем общую выручку сотруднику (включает безнал/контрагентов).
      // Касса смены (нал/карта/перевод) была видна на главной /kiosk весь день.
      toast({
        title: "Смена завершена",
        description: `Моек за смену: ${summary.totalWashes}. Хорошая работа!`,
      });
      setActiveShiftId(null);
      setIsShiftActive(false);
      updateBoxShiftState(selectedBoxNumber, (current) => ({
        ...current,
        shiftId: null,
        isShiftActive: false,
      }));
      sessionStorage.removeItem('activeShiftId');
      sessionStorage.removeItem('isShiftActive');
      router.refresh();
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } finally {
      setIsShiftLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className={`zorin-workstation${isKioskMode ? ' kiosk-mode' : ''}`}>
      {/* Navigation Header */}
      {/* Header — hide in kiosk mode (kiosk has its own layout) */}
      {!isKioskMode && (
        isAdminMode ? (
          /* Admin header: back to operations + box indicator */
          <div className="bg-white border-b px-4 py-3 flex items-center justify-between mb-6 -mx-4 -mt-4 md:-mx-6 md:-mt-6">
            <div className="flex items-center gap-3">
              <Link href="/operations">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Центр управления
                </Button>
              </Link>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4 text-blue-600" />
                <h1 className="text-lg font-semibold">Оформление заказа — Бокс {selectedBoxNumber}</h1>
              </div>
            </div>
            {loggedInEmployee && (
              <span className="text-sm text-gray-500">{loggedInEmployee.fullName}</span>
            )}
          </div>
        ) : (
          /* Employee header: workstation + schedule link */
          <div className="bg-white border-b px-4 py-3 flex items-center justify-between mb-6 -mx-4 -mt-4 md:-mx-6 md:-mt-6">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Рабочая станция</h1>
              {loggedInEmployee && (
                <span className="text-sm text-gray-600">
                  • {loggedInEmployee.fullName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/employee/schedule">
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4 mr-1" />
                  Мой график
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      )}

      {/* Shift Control */}
      {isKioskMode ? (
        /* Kiosk: just box selector, no shift start/end */
        <div className="zorin-shift-card">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Бокс:</span>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selectedBoxNumber === 1 ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              onClick={() => syncSelectedBox(1)}
            >
              Бокс 1 {boxShiftStateByBox.box1.employees.length > 0 ? `(${boxShiftStateByBox.box1.employees.length})` : ''}
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selectedBoxNumber === 2 ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              onClick={() => syncSelectedBox(2)}
            >
              Бокс 2 {boxShiftStateByBox.box2.employees.length > 0 ? `(${boxShiftStateByBox.box2.employees.length})` : ''}
            </button>
          </div>
        </div>
      ) : isAdminMode ? null : (
        /* Employee: full shift management */
        <div className="zorin-shift-card">
          <h2 className="zorin-shift-title">Управление сменой</h2>
          {!isShiftActive && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">Бокс:</span>
              <button
                className={`px-3 py-1 rounded-lg text-sm font-medium ${selectedBoxNumber === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                onClick={() => syncSelectedBox(1)}
              >
                Бокс 1
              </button>
              <button
                className={`px-3 py-1 rounded-lg text-sm font-medium ${selectedBoxNumber === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                onClick={() => syncSelectedBox(2)}
              >
                Бокс 2
              </button>
            </div>
          )}
          <div className="zorin-shift-controls">
            <button
              onClick={handleStartShift}
              disabled={isShiftActive || isLoading || isShiftLoading}
              className="zorin-shift-btn start"
            >
              {(isLoading || isShiftLoading) && !isShiftActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              <CheckCircle size={20} />
              Начать смену
            </button>
            <button
              onClick={handleEndShift}
              disabled={!isShiftActive || isShiftLoading}
              className="zorin-shift-btn end"
            >
              {isShiftLoading && isShiftActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Завершить смену
            </button>
            <span className={`zorin-shift-status ${isShiftActive ? 'active' : 'inactive'}`}>
              {isShiftActive ? "Смена активна" : "Смена закрыта"}
            </span>
          </div>
        </div>
      )}

      {/* Wash Registration */}
      {isShiftActive && (
        <div className="zorin-registration-card">
          <h3 className="zorin-registration-title">Регистрация мойки</h3>
          <p className="zorin-registration-description">
            Выберите команду на смену, затем введите номер машины. Система автоматически определит тип клиента.
          </p>

          {/* Phase 60k — KIOSK FIX: на терминале нельзя выбрать сотрудников вручную (только из графика).
              Если график на сегодня пустой → кнопка «Проверить» disabled, и юзер не понимает почему.
              Показываем явное сообщение с инструкцией что делать. */}
          {isKioskMode && selectedEmployees.length === 0 && (
            <div className="my-4 rounded-xl border-2 border-amber-300 bg-amber-50/80 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-900 mb-1">
                    На боксе {selectedBoxNumber} нет назначенных сотрудников
                  </p>
                  <p className="text-xs text-amber-800 leading-snug mb-2">
                    Оформить мойку можно только когда в графике на сегодня есть бригада на этом боксе.
                    Откройте смену через админку или составьте график.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Link
                      href="/workstation"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700"
                    >
                      Открыть смену → /workstation
                    </Link>
                    <Link
                      href="/schedule"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-white text-amber-700 border border-amber-300 hover:bg-amber-50"
                    >
                      График → /schedule
                    </Link>
                    <button
                      type="button"
                      onClick={() => router.refresh()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      🔄 Обновить страницу
                    </button>
                  </div>
                  {boxShiftStateByBox.box1.employees.length === 0 && boxShiftStateByBox.box2.employees.length === 0 ? (
                    <p className="text-[10px] text-amber-700 italic mt-2">
                      Подсказка: ни на одном боксе нет сотрудников. Скорее всего график на сегодня вообще не составлен.
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-700 italic mt-2">
                      Подсказка: на другом боксе сотрудники есть — переключитесь кнопкой Бокс сверху.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {cameraSessionContext && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              {/* Header badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="secondary">Камера · бокс {cameraSessionContext.boxNumber}</Badge>
                <Badge variant="outline">
                  {cameraSessionContext.mode === 'edit' ? 'Исправление номера' : 'Быстрое оформление'}
                </Badge>
                {cameraSessionContext.vehicleClass && (
                  <Badge variant="outline">{cameraSessionContext.vehicleClass}</Badge>
                )}
              </div>

              {/* 🔥 ФИКС 2026-05-05: одно фото — крупный план номера. Раньше показывали
                  два (общий план + crop) — общий лишний, оператору важен только номер.
                  Fallback chain: plate_crop → plate → thumbnail (через бэкенд route) */}
              <div className="overflow-hidden rounded-lg border-2 border-blue-300 bg-black flex items-center justify-center mb-3 max-h-[260px]">
                <img
                  src={buildCameraSessionMediaUrl(cameraSessionContext, 'plate_crop')}
                  alt="Номер машины (крупный план)"
                  className="w-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    const fallbackUrl = buildCameraSessionMediaUrl(cameraSessionContext, 'plate');
                    if (!img.src.endsWith('kind=plate')) {
                      img.src = fallbackUrl;
                    } else {
                      // Если и plate.jpg нет — показываем thumbnail последним фолбэком
                      const thumbUrl = buildCameraSessionMediaUrl(cameraSessionContext, 'thumbnail');
                      if (img.src !== thumbUrl) {
                        img.src = thumbUrl;
                      } else {
                        img.style.display = 'none';
                      }
                    }
                  }}
                />
              </div>

              {/* Recognized plate — big and prominent */}
              <div className="rounded-lg bg-white border border-amber-200 px-4 py-3 mb-2">
                {cameraSessionContext.recognizedPlate ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Распознано камерой:</p>
                      <p className="text-2xl font-mono font-bold tracking-wider text-gray-900">
                        {cameraSessionContext.recognizedPlate}
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 max-w-[200px] text-right">
                      Проверьте номер по фото. Если неверно — исправьте ниже.
                    </p>
                  </div>
                ) : (
                  <p className="text-amber-900 text-sm">
                    Камера не распознала номер. Введите вручную по фото и нажмите «Проверить».
                  </p>
                )}
              </div>

              {cameraSessionContext.correctionSaved && (
                <p className="text-xs font-medium text-emerald-700">
                  Исправление OCR сохранено.
                </p>
              )}
            </div>
          )}

          {(currentStep !== "idle") && (
            <div className="zorin-form-section">
              <div className="zorin-form-grid">
                <div>
                  <label className="zorin-form-label">1. Команда на смене</label>
                  <div className="zorin-employee-tags">
                    {selectedEmployees.map(e => (
                      <span key={e.id} className="zorin-employee-tag">{e.fullName}</span>
                    ))}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="zorin-button secondary">
                        <PlusCircle size={16} />
                        Добавить/убрать
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <ScrollArea className="h-60">
                        <div className="p-2 space-y-1">
                          {allEmployees.map(employee => (
                            <div key={employee.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md">
                              <Checkbox
                                id={`emp-partner-${employee.id}`}
                                checked={selectedEmployees.some(e => e.id === employee.id)}
                                onCheckedChange={() => handleEmployeeSelect(employee)}
                              />
                              <label htmlFor={`emp-partner-${employee.id}`} className="font-normal flex-1 cursor-pointer">{employee.fullName}</label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="zorin-form-label">2. Введите номер машины</label>
                  <div className="zorin-vehicle-input-section">
                    <div className="flex items-center gap-3">
                      <LicensePlateInput
                        value={vehicleNumberInput}
                        onChange={(val) => {
                          setVehicleNumberInput(val);
                          const normalized = normalizeLicensePlate(val);
                          setNormalizedVehicleNumber(normalized);
                        }}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setIsPlateDialogOpen(true)}
                        disabled={isLoading}
                        className="p-2 rounded-lg border-2 border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Распознать номер"
                      >
                        <Upload className="h-6 w-6 text-gray-600" />
                      </button>
                    </div>
                    {normalizedVehicleNumber && (
                      <p className="text-sm text-muted-foreground mt-1">Нормализованный: {normalizedVehicleNumber}</p>
                    )}
                    <button
                      onClick={() => checkVehicleNumber()}
                      disabled={isLoading || !vehicleNumberInput.trim() || selectedEmployees.length === 0}
                      className="zorin-button primary zorin-check-button"
                      title={
                        selectedEmployees.length === 0
                          ? 'Сначала назначьте сотрудников на смену (см. жёлтую плашку выше)'
                          : !vehicleNumberInput.trim()
                          ? 'Введите номер машины'
                          : ''
                      }
                    >
                      {isLoading && normalizedVehicleNumber ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Car className="mr-2 h-4 w-4" />}
                      Проверить
                    </button>
                  </div>
                </div>
              </div>

              {lastWashComment?.text && (
                <Accordion type="single" collapsible className="w-full mt-3">
                  <AccordionItem value="item-1" className="border-amber-200 bg-amber-50 rounded-lg">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline text-amber-800">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-amber-600" />
                        <span className="font-semibold">Есть комментарий от предыдущей смены</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <blockquote className="border-l-2 border-amber-300 pl-4 text-amber-900 italic">
                        {lastWashComment.text}
                      </blockquote>
                      <p className="text-xs text-amber-800/70 mt-2 text-right">
                        Автор: {employeeMap.get(lastWashComment.authorId) || 'Неизвестно'} ({format(new Date(lastWashComment.date), 'dd.MM.yyyy HH:mm', { locale: ru })})
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {foundCounterAgent && (
                <div className="zorin-alert info">
                  <Users className="h-4 w-4" />
                  <span>Контрагент: {foundCounterAgent.name}</span>
                </div>
              )}

              {selectedAggregator && (
                <div className="zorin-alert info">
                  <Briefcase className="h-4 w-4" />
                  <span>Агрегатор: {selectedAggregator.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Payment Selection */}
          {currentStep === "paymentSelection" && (
            <div className="zorin-form-section">
              <h4 className="flex items-center gap-2 mb-4">
                <Car size={20} />
                Розничный клиент
              </h4>
              <p className="mb-4 text-gray-600">Выберите способ оплаты для машины с номером {normalizedVehicleNumber}.</p>

              {foundAggregators && foundAggregators.length > 0 && (
                <div className="zorin-alert warning mb-4">
                  <Briefcase className="h-4 w-4" />
                  <div>
                    <strong>Машина найдена в базе агрегаторов!</strong>
                    <p className="text-sm">Эта машина числится у агрегатора(ов): <strong>{foundAggregators.map(a => a.name).join(', ')}</strong>.</p>
                  </div>
                </div>
              )}

              <RadioGroup
                onValueChange={(value) => handlePaymentMethodSelect(value as "cash" | "card" | "transfer" | "aggregator")}
                className="zorin-payment-methods"
              >
                <label className="zorin-payment-card">
                  <RadioGroupItem value="cash" className="sr-only" />
                  <div className="zorin-payment-icon cash">
                    <DollarSign size={24} />
                  </div>
                  <span className="font-semibold">Наличные</span>
                </label>

                <label className="zorin-payment-card">
                  <RadioGroupItem value="card" className="sr-only"/>
                  <div className="zorin-payment-icon card">
                    <CreditCard size={24} />
                  </div>
                  <span className="font-semibold">Карта</span>
                </label>

                <label className="zorin-payment-card">
                  <RadioGroupItem value="transfer" className="sr-only"/>
                  <div className="zorin-payment-icon transfer">
                    <Landmark size={24} />
                  </div>
                  <span className="font-semibold">Перевод</span>
                </label>

                <label className="zorin-payment-card">
                  <RadioGroupItem value="aggregator" className="sr-only"/>
                  <div className="zorin-payment-icon aggregator">
                    <Briefcase size={24} />
                  </div>
                  <span className="font-semibold">Агрегатор</span>
                </label>
              </RadioGroup>
            </div>
          )}

          {/* Aggregator Selection */}
          {currentStep === "aggregatorSelection" && (
            <div className="zorin-form-section">
              <h4 className="flex items-center gap-2 mb-4">
                <Briefcase size={20} />
                Выберите агрегатора
              </h4>

              {allAggregators.length > 0 ? (
                <>
                  <RadioGroup
                    onValueChange={setTempSelectedAggregatorId}
                    value={tempSelectedAggregatorId}
                    className="space-y-2"
                  >
                    {allAggregators.map(agg => (
                      <label key={agg.id} htmlFor={`agg-${agg.id}`} className={cn("flex items-center space-x-2 p-3 border rounded-md hover:bg-background cursor-pointer", foundAggregators.some(fa => fa.id === agg.id) && "bg-blue-50 border-blue-200")}>
                        <RadioGroupItem value={agg.id} id={`agg-${agg.id}`} />
                        <span className="font-medium text-base">{agg.name}</span>
                        {foundAggregators.some(fa => fa.id === agg.id) && <Badge variant="secondary">В автопарке</Badge>}
                      </label>
                    ))}
                  </RadioGroup>
                  <div className="flex justify-end mt-4">
                    <button onClick={confirmAggregatorSelection} disabled={!tempSelectedAggregatorId} className="zorin-button primary">
                      Далее
                    </button>
                  </div>
                </>
              ) : (
                <div className="zorin-alert error">
                  <span>В системе нет зарегистрированных агрегаторов. Пожалуйста, добавьте их.</span>
                </div>
              )}
            </div>
          )}

          {/* Service Selection — новый компактный UI из прототипа (kiosk-style).
              Включён везде с 2026-05-12 (был только для isKioskMode). */}
          {currentStep === "serviceSelection" && (
            <KioskServiceSelectionStep
              vehicleNumber={normalizedVehicleNumber || vehicleNumberInput}
              boxNumber={selectedBoxNumber}
              clientType={
                selectedPaymentMethod === 'aggregator'
                  ? 'aggregator'
                  : selectedPaymentMethod === 'counterAgentContract'
                    ? 'counterAgent'
                    : 'retail'
              }
              clientTypeLabel={
                selectedPaymentMethod === 'counterAgentContract' && foundCounterAgent
                  ? `Контрагент: ${foundCounterAgent.name} (по договору)`
                  : selectedPaymentMethod === 'aggregator' && selectedAggregator
                    ? `Агрегатор: ${selectedAggregator.name}`
                    : selectedPaymentMethod && ['cash', 'card', 'transfer'].includes(selectedPaymentMethod)
                      ? `Розница: ${paymentMethodLabels[selectedPaymentMethod] || 'оплата'}`
                      : 'Розничный клиент'
              }
              paymentMethod={(selectedPaymentMethod ?? 'cash') as KioskPaymentMethod}
              timerLabel={washTimerStart ? formatTimer(washTimerElapsed) : '00:00'}
              services={servicesToShow}
              selectedServices={washServices.map((s) => ({
                id: s.id,
                serviceName: s.serviceName,
                price: s.price,
              }))}
              searchQuery={serviceSearchQuery}
              onSearchChange={setServiceSearchQuery}
              onServiceToggle={handleServiceSelect}
              onServiceRemove={handleRemoveService}
              onServiceAddMore={handleServiceAddMore}
              topServices={topServicesForSource}
              predefinedExtraServices={predefinedExtraServices}
              lastWashServices={lastWashServices ?? undefined}
              onRepeatLast={
                lastWashServices && lastWashServices.length > 0
                  ? () => {
                      setWashServices(
                        lastWashServices.map((s) => ({
                          ...s,
                          id: `service-${s.serviceName}-${Date.now()}-${Math.random()}`,
                        })),
                      );
                      toast({
                        title: 'Услуги добавлены',
                        description: 'Выбраны услуги из предыдущего визита.',
                      });
                    }
                  : undefined
              }
              canAddCustomServices={canAddCustomServices}
              customExtraServiceName={customExtraServiceName}
              customExtraServicePrice={customExtraServicePrice}
              onCustomNameChange={setCustomExtraServiceName}
              onCustomPriceChange={setCustomExtraServicePrice}
              onAddCustomService={handleAddCustomExtraService}
              totalAmount={totalAmount}
              showPrices={showPrices}
              onProceed={proceedToConfirmation}
            />
          )}

          {/* Service Selection — старый UI удалён 2026-05-12, теперь только новый KioskServiceSelectionStep выше */}

          {/* Confirmation */}
          {currentStep === "confirmation" && washServices.length > 0 && (
            <div className="zorin-confirmation-card">
              <h3 className="zorin-confirmation-title">
                <CheckCircle size={24} />
                Подтверждение мойки
                {washTimerStart && (
                  <span className="ml-auto flex items-center gap-1 text-base font-mono text-blue-600">
                    <Timer size={18} />
                    {formatTimer(washTimerElapsed)}
                  </span>
                )}
              </h3>

              <div className="space-y-3">
                <p><strong>Номер машины:</strong> {normalizedVehicleNumber} (Введено: {vehicleNumberInput})</p>
                <p><strong>Клиент:</strong> {
                  selectedPaymentMethod === 'counterAgentContract' && foundCounterAgent ? `${foundCounterAgent.name} (Контрагент по договору)` :
                  selectedPaymentMethod === 'aggregator' && selectedAggregator ? `Клиент агрегатора (${selectedAggregator.name})` :
                  'Розничный клиент'
                }</p>
                <p><strong>Способ оплаты:</strong> {
                  selectedPaymentMethod ? (paymentMethodLabels[selectedPaymentMethod] || 'Не определен') : 'Не определен'
                }</p>
                <p><strong>Исполнители:</strong> {selectedEmployees.map(e => e.fullName).join(', ')}</p>

                {/* Phase 57c: бейдж «От имени ИП» — какое наше юр.лицо оформит мойку.
                    Логика дублирует серверный resolveOurCompanyIdForWashEvent: counterAgent.preferredOurCompanyId
                    → aggregator.preferredOurCompanyId → primary. Сотрудник видит куда пойдут деньги. */}
                {(() => {
                  if (allOurCompanies.length === 0) return null;
                  const active = allOurCompanies.filter(c => !c.archived);
                  let targetOc: OurCompany | undefined;
                  let reasonHint = '';
                  if (selectedPaymentMethod === 'counterAgentContract' && foundCounterAgent?.preferredOurCompanyId) {
                    targetOc = active.find(c => c.id === foundCounterAgent.preferredOurCompanyId);
                    reasonHint = `назначено контрагенту ${foundCounterAgent.name}`;
                  } else if (selectedPaymentMethod === 'aggregator' && selectedAggregator?.preferredOurCompanyId) {
                    targetOc = active.find(c => c.id === selectedAggregator.preferredOurCompanyId);
                    reasonHint = `назначено агрегатору ${selectedAggregator.name}`;
                  }
                  if (!targetOc) {
                    targetOc = active.find(c => c.isPrimary);
                    reasonHint = 'основное ИП по умолчанию';
                  }
                  if (!targetOc) return null;
                  return (
                    <p style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px', margin: '8px 0' }}>
                      <strong>От имени ИП:</strong>{' '}
                      <span style={{ fontWeight: 700 }}>{targetOc.shortName}</span>
                      {targetOc.isPrimary && <span style={{ marginLeft: 6 }}>⭐</span>}
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#6366f1' }}>({reasonHint})</span>
                    </p>
                  );
                })()}

                {/* Phase 51c / V2-#4: split-services карточка водителя */}
                <SplitDriverCard
                  washServices={washServices}
                  counterAgent={foundCounterAgent}
                  normalizedVehicleNumber={normalizedVehicleNumber}
                  selectedDriver={selectedDriver}
                  onPickDriver={() => setDriverPickerOpen(true)}
                  onClearDriver={() => setSelectedDriver(null)}
                />

                {/* Phase 60a/b — ФИО водителя + цифровая роспись.
                    Показывается ТОЛЬКО когда среди услуг есть split (мойка скотовоза и т.п.) —
                    именно там нужен водитель/роспись для Ведомости. Обычные contract-мойки
                    без split (например, легковая по договору) — не требуют. */}
                {selectedPaymentMethod === 'counterAgentContract' &&
                  washServices.some((s) => (s as any).split?.driverBonus > 0) && (
                  <div className="space-y-3 pt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      🖊️ Водитель — ФИО и роспись
                      <span className="text-xs font-normal text-slate-500 italic">(для Ведомости учёта)</span>
                    </p>
                    {(() => {
                      const drivers = ((foundCounterAgent as any)?.drivers || []) as Array<{
                        id?: string; name: string; phone?: string; position?: string; plates?: string[]; signature?: string;
                      }>;
                      // Phase 60e — найти водителя в списке CA по текущему ФИО (case-insensitive)
                      // для auto-prefill подписи при ручном вводе совпадающего имени.
                      const matchedDriver = drivers.find(d => d.name.trim().toLowerCase() === driverNameInput.trim().toLowerCase());
                      return (
                        <>
                          {/* Phase 60d — умный селектор водителей: pills для ≤6, combobox с поиском для больших списков.
                              Авто-выбор по plate если водитель закреплён за этим номером. */}
                          {drivers.length > 0 && (
                            <div className="space-y-1.5">
                              <label className="zorin-form-label text-xs">Водители контрагента ({drivers.length})</label>
                              <DriverComboBox
                                drivers={drivers}
                                selectedName={driverNameInput}
                                vehiclePlate={normalizedVehicleNumber}
                                onPick={(d) => {
                                  setDriverNameInput(d.name);
                                  if (d.signature) {
                                    setDriverSignatureDataUrl(d.signature);
                                    setDriverSignatureSource('cached');
                                  } else {
                                    setDriverSignatureDataUrl(null);
                                    setDriverSignatureSource(null);
                                  }
                                }}
                                onClear={() => {
                                  setDriverNameInput('');
                                  setDriverSignatureDataUrl(null);
                                  setDriverSignatureSource(null);
                                }}
                              />
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <label className="zorin-form-label text-xs">ФИО водителя</label>
                            <input
                              type="text"
                              placeholder="Иванов И.И."
                              value={driverNameInput}
                              onChange={(e) => {
                                const newName = e.target.value;
                                setDriverNameInput(newName);
                                // Phase 60e — авто-подгрузить роспись, если введённое ФИО совпадает с водителем CA
                                const m = drivers.find(d => d.name.trim().toLowerCase() === newName.trim().toLowerCase());
                                if (m?.signature) {
                                  setDriverSignatureDataUrl(m.signature);
                                  setDriverSignatureSource('cached');
                                } else if (driverSignatureSource === 'cached') {
                                  // если ушли с матчевого имени и роспись была подтянутая — снять (т.к. это не его подпись)
                                  setDriverSignatureDataUrl(null);
                                  setDriverSignatureSource(null);
                                }
                              }}
                              className="zorin-input"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="zorin-form-label text-xs flex items-center justify-between">
                              <span>
                                Роспись водителя
                                <span className="ml-2 text-[10px] text-slate-500 italic font-normal">
                                  (можно отрывать — рисуй по частям)
                                </span>
                              </span>
                            </label>
                            {/* Phase 60e — плашка-подтверждение когда роспись из библиотеки */}
                            {driverSignatureSource === 'cached' && driverSignatureDataUrl && (
                              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 text-[12px] text-emerald-800">
                                  <span className="text-base">✓</span>
                                  <span>
                                    <strong>Подпись водителя сохранена ранее</strong> — будет использована автоматически.
                                    {' '}Водителю не нужно расписываться повторно.
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDriverSignatureDataUrl(null);
                                    setDriverSignatureSource(null);
                                  }}
                                  className="px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 rounded whitespace-nowrap"
                                  title="Очистить и расписаться заново"
                                >
                                  Расписаться заново
                                </button>
                              </div>
                            )}
                            <SignaturePad
                              value={driverSignatureDataUrl}
                              onChange={(dataUrl) => {
                                setDriverSignatureDataUrl(dataUrl);
                                // если рисовал — это свежая роспись (а не sticky из CA)
                                if (dataUrl) {
                                  setDriverSignatureSource('fresh');
                                } else {
                                  setDriverSignatureSource(null);
                                }
                              }}
                              height={130}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <hr />
                <p className="font-semibold">Оказанные услуги:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {washServices.map((s, i) => (
                      <li key={`confirm-${s.id}`}>
                        {s.serviceName}
                        {showPrices && ` - ${s.price} руб.`}
                        {i === 0 && ' (Основная)'}
                        {(s as any).split?.driverBonus > 0 && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700"
                            title="Услуга с разделением расчёта водителю"
                          >
                            🔀 split
                          </span>
                        )}
                      </li>
                  ))}
                </ul>

                <div className="space-y-2 pt-2">
                  <label className="zorin-form-label">Комментарий к мойке (клиент, машина)</label>
                  <textarea
                    placeholder="Например: водитель просил не использовать сильную химию на дисках..."
                    value={driverComment}
                    onChange={(e) => setDriverComment(e.target.value)}
                    className="zorin-input"
                    rows={3}
                  />
                </div>

                {/* Чаевые */}
                {showPrices && (
                  <div className="pt-2">
                    <label className="zorin-form-label flex items-center gap-1 mb-2">
                      <Coins size={16} className="text-amber-500" />
                      Чаевые
                      <span className="ml-auto text-xs text-muted-foreground italic font-normal">опционально</span>
                    </label>
                    {/* 🔥 ФИКС 2026-05-11: quick-buttons +50/+100/+200/+500 + ручной ввод
                        для kiosk-режима — не нужно вводить с экранной клавиатуры мокрыми руками */}
                    {isKioskMode && (
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {[50, 100, 200, 500].map((amt) => {
                          const cur = parseInt(tipsInput || '0', 10) || 0;
                          const isActive = cur === amt;
                          return (
                            <button
                              key={amt}
                              onClick={() => setTipsInput(isActive ? '' : String(amt))}
                              className={`rounded-xl py-3 text-base font-bold transition active:scale-95 ${
                                isActive
                                  ? 'bg-amber-100 ring-2 ring-amber-400 text-amber-800 shadow-sm'
                                  : 'bg-gray-50 ring-1 ring-gray-200 text-gray-700'
                              }`}
                            >
                              +{amt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder={isKioskMode ? "Своя сумма..." : "0"}
                        value={tipsInput}
                        onChange={(e) => setTipsInput(e.target.value)}
                        className="zorin-input flex-1"
                        min="0"
                      />
                      <span className="text-sm text-muted-foreground">руб.</span>
                    </div>
                  </div>
                )}

                <hr />

                {showPrices ? (
                  <div className="text-right space-y-1">
                    <p className="zorin-total-amount"><strong>Итого к оплате:</strong> {totalAmount.toFixed(2)} руб.</p>
                    {selectedPaymentMethod === 'card' && acquiringFee > 0 && (
                      <div className="text-sm">
                        <p className="text-muted-foreground">Комиссия за эквайринг ({retailPriceConfig.cardAcquiringPercentage}%): -{acquiringFee.toFixed(2)} руб.</p>
                        <p className="font-semibold text-foreground">К получению: {netAmount.toFixed(2)} руб.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xl font-bold text-right"><strong>Оплата:</strong> По договору</p>
                )}

                <div className="flex space-x-3 pt-3">
                  {(() => {
                    const hasSplitConfirm = washServices.some((s) => (s as any).split?.driverBonus > 0);
                    const splitBlockedNoDriver = hasSplitConfirm && !selectedDriver?.name;
                    return (
                      <button
                        onClick={confirmWash}
                        disabled={isLoading || splitBlockedNoDriver}
                        className="zorin-button primary flex-1"
                        title={splitBlockedNoDriver ? 'Выберите водителя для split-услуги' : ''}
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {splitBlockedNoDriver ? 'Выберите водителя →' : 'Подтвердить и зарегистрировать'}
                      </button>
                    );
                  })()}
                  <button onClick={() => setCurrentStep("serviceSelection")} className="zorin-button secondary">
                    Назад к услугам
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep !== 'idle' && currentStep !== 'vehicleInput' && (
            <button onClick={() => resetFormStateForNewVehicle(false, false, true, true)} className="zorin-button secondary mt-4">
              Начать заново (другая машина)
            </button>
          )}
        </div>
      )}

      {/* Phase 51c / V2-#4: Driver picker modal — открывается из SplitDriverCard */}
      <DriverPickerModal
        open={driverPickerOpen}
        onOpenChange={setDriverPickerOpen}
        counterAgent={foundCounterAgent}
        normalizedVehicleNumber={normalizedVehicleNumber}
        onPick={(driver) => setSelectedDriver(driver)}
        newDriverName={newDriverName}
        setNewDriverName={setNewDriverName}
        newDriverPhone={newDriverPhone}
        setNewDriverPhone={setNewDriverPhone}
      />

      <PlateRecognitionDialog
        open={isPlateDialogOpen}
        onOpenChange={setIsPlateDialogOpen}
        onPlateRecognized={handlePlateRecognized}
        onRecognitionFailed={handlePlateRecognitionFailed}
      />
    </div>
  );
}
