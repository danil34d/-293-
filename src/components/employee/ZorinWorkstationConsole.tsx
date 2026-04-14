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
  Coins
} from 'lucide-react';
import type { CounterAgent, Aggregator, PriceListItem, Car as CarType, RetailPriceConfig, PaymentType, Employee, WashEvent, EmployeeConsumption, WashComment } from '@/types';
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
import { useRouter } from 'next/navigation';
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
  /** Is this running in kiosk mode */
  isKioskMode?: boolean;
  /** Pre-select box number (from URL param) */
  initialBoxNumber?: number;
}

export function ZorinWorkstationConsole({ scheduleByBox, isKioskMode, initialBoxNumber }: WorkstationProps = {}) {
  const { employee: loggedInEmployee } = useAuth();
  const router = useRouter();
  const [isShiftActive, setIsShiftActive] = useState(() => {
    // Kiosk mode: shift is always active
    if (isKioskMode) return true;
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

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Map<string, string>>(new Map());
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>(() => {
    // Kiosk mode: initialize from schedule for selected box
    if (isKioskMode && scheduleByBox) {
      return scheduleByBox.box1;
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

  const [currentStep, setCurrentStep] = useState<CurrentStep>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [allCounterAgents, setAllCounterAgents] = useState<CounterAgent[]>([]);
  const [allAggregators, setAllAggregators] = useState<Aggregator[]>([]);
  const [allWashEvents, setAllWashEvents] = useState<WashEvent[]>([]);
  const [retailPriceConfig, setRetailPriceConfig] = useState<RetailPriceConfig>({ mainPriceList: [], additionalPriceList: [], allowCustomRetailServices: true, cardAcquiringPercentage: 1.2 });

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
    console.log('[SAVE] selectedEmployees changed:', selectedEmployees);
    if (selectedEmployees.length > 0) {
      sessionStorage.setItem('selectedEmployees', JSON.stringify(selectedEmployees));
      console.log('[SAVE] Saved to sessionStorage:', JSON.stringify(selectedEmployees));
    }
  }, [selectedEmployees]);

  useEffect(() => {
    async function fetchData() {
      if (isShiftActive) {
        setIsLoading(true);
        try {
          const [agentsRes, aggregatorsRes, retailRes, employeesRes, washEventsRes] = await Promise.all([
            fetch('/api/counter-agents'),
            fetch('/api/aggregators'),
            fetch('/api/retail-price-config'),
            fetch('/api/employees'),
            fetch('/api/wash-events'),
          ]);

          if (!agentsRes.ok || !aggregatorsRes.ok || !retailRes.ok || !employeesRes.ok || !washEventsRes.ok) {
            throw new Error('API error');
          }

          const [agentsData, aggregatorsData, retailData, employeesData, washEventsData] = await Promise.all([
            agentsRes.json(),
            aggregatorsRes.json(),
            retailRes.json(),
            employeesRes.json(),
            washEventsRes.json(),
          ]);

          // Filter active counter agents
          const activeAgents = (agentsData as any[]).filter((a: any) => !a.isArchived);
          setAllCounterAgents(activeAgents);
          setAllAggregators(aggregatorsData);
          setRetailPriceConfig(retailData);
          const activeEmployees = (employeesData as any[]).filter((e: any) => e.role !== 'admin' && e.role !== 'kiosk');
          setAllEmployees(activeEmployees);
          setEmployeeMap(new Map(activeEmployees.map((e: any) => [e.id, e.fullName])));
          setAllWashEvents(washEventsData);
        } catch (error) {
          console.error("Error fetching data for workstation:", error);
          toast({ title: "Ошибка", description: "Не удалось загрузить данные для рабочей станции.", variant: "destructive"});
          setAllCounterAgents([]);
          setAllAggregators([]);
          setAllEmployees([]);
          setAllWashEvents([]);
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
        resetFormStateForNewVehicle(true, false, !ocrData);
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

    if (!isAutoCheck) {
      // Ручная проверка — сохраняем OCR-исправление если номер изменён
      let clearOcrAfterReset = !ocrData;
      if (shouldPersistOcrCorrection(normalizedInput)) {
        clearOcrAfterReset = await persistOcrCorrection(normalizedInput);
      } else if (ocrData) {
        setOcrData(null); // номер совпал — сохранять не нужно
      }

      resetFormStateForNewVehicle(true, false, clearOcrAfterReset);
      if (ocrData && !shouldPersistOcrCorrection(normalizedInput)) {
        setOcrData(ocrData);
      }
    } else {
      // Авто-проверка после OCR — НЕ трогаем ocrData (stale closure issue)
      resetFormStateForNewVehicle(true, false, false);
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
    }

    const agent = allCounterAgents.find(ca =>
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

    const aggregatorsWithCar = allAggregators.filter(agg =>
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

  const handleEmployeeSelect = (employee: Employee) => {
    if (loggedInEmployee && employee.id === loggedInEmployee.id && !isEmployeeAdmin(loggedInEmployee)) {
        toast({ title: "Нельзя снять себя", description: "Вы не можете убрать себя из команды.", variant: "destructive"});
        return;
    }

    setSelectedEmployees(prev =>
      prev.some(e => e.id === employee.id)
        ? prev.filter(e => e.id !== employee.id)
        : [...prev, employee]
    );
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

	    const washEventToSave: Omit<WashEvent, 'driverComments'> & { driverComments?: WashComment[] } = {
        id: `we_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date().toISOString(),
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

        toast({
            title: "Мойка зарегистрирована!",
            description: `Данные о мойке для ${normalizedVehicleNumber} успешно сохранены в журнале.`,
            variant: "default",
        });
        setAllWashEvents(prev => [washEventToSave as WashEvent, ...prev]);
        resetFormStateForNewVehicle(false, true);
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

  const resetFormStateForNewVehicle = (soft = false, keepEmployees = false, clearOcr = true) => {
    console.log('[RESET_FORM] Called with soft:', soft, 'keepEmployees:', keepEmployees);
    console.trace('[RESET_FORM] Stack trace:');
    if(!soft) {
      setVehicleNumberInput('');
      setNormalizedVehicleNumber('');
      if (!keepEmployees) {
        if (isKioskMode && scheduleByBox) {
          const boxEmps = selectedBoxNumber === 2 ? scheduleByBox.box2 : scheduleByBox.box1;
          setSelectedEmployees(boxEmps);
        } else {
          setSelectedEmployees((loggedInEmployee && !isEmployeeAdmin(loggedInEmployee) && loggedInEmployee.role !== 'kiosk') ? [loggedInEmployee] : []);
        }
      }
    }
    setFoundCounterAgent(null);
    setFoundAggregators([]);
    setSelectedPaymentMethod(null);
    setSelectedAggregator(null);
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
  }

  const resetForm = () => {
    resetFormStateForNewVehicle();
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
      setIsShiftActive(true);
      sessionStorage.setItem('isShiftActive', 'true');
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
      const summary = data.summary || { totalWashes: 0, totalAmount: 0 };
      toast({
        title: "Смена завершена",
        description: `Моек: ${summary.totalWashes}, Выручка: ${summary.totalAmount.toLocaleString('ru-RU')} ₽`,
      });
      setActiveShiftId(null);
      setIsShiftActive(false);
      sessionStorage.removeItem('activeShiftId');
      sessionStorage.removeItem('isShiftActive');
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
    <div className="zorin-workstation">
      {/* Navigation Header */}
      {/* Header — hide in kiosk mode (kiosk has its own layout) */}
      {!isKioskMode && (
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
      )}

      {/* Shift Control — kiosk mode: just box selector, no shift start/end */}
      {isKioskMode ? (
        <div className="zorin-shift-card">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Бокс:</span>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selectedBoxNumber === 1 ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              onClick={() => {
                setSelectedBoxNumber(1);
                sessionStorage.setItem('selectedBoxNumber', '1');
                if (scheduleByBox) setSelectedEmployees(scheduleByBox.box1);
              }}
            >
              Бокс 1 {scheduleByBox && scheduleByBox.box1.length > 0 ? `(${scheduleByBox.box1.length})` : ''}
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selectedBoxNumber === 2 ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              onClick={() => {
                setSelectedBoxNumber(2);
                sessionStorage.setItem('selectedBoxNumber', '2');
                if (scheduleByBox) setSelectedEmployees(scheduleByBox.box2);
              }}
            >
              Бокс 2 {scheduleByBox && scheduleByBox.box2.length > 0 ? `(${scheduleByBox.box2.length})` : ''}
            </button>
          </div>
        </div>
      ) : (
        <div className="zorin-shift-card">
          <h2 className="zorin-shift-title">Управление сменой</h2>
          {!isShiftActive && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">Бокс:</span>
              <button
                className={`px-3 py-1 rounded-lg text-sm font-medium ${selectedBoxNumber === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                onClick={() => { setSelectedBoxNumber(1); sessionStorage.setItem('selectedBoxNumber', '1'); }}
              >
                Бокс 1
              </button>
              <button
                className={`px-3 py-1 rounded-lg text-sm font-medium ${selectedBoxNumber === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                onClick={() => { setSelectedBoxNumber(2); sessionStorage.setItem('selectedBoxNumber', '2'); }}
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
                    <button onClick={() => checkVehicleNumber()} disabled={isLoading || !vehicleNumberInput.trim() || selectedEmployees.length === 0} className="zorin-button primary zorin-check-button">
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

          {/* Service Selection */}
          {currentStep === "serviceSelection" && (
            <div className="zorin-form-section">
              <h4 className="flex items-center gap-2 mb-4">
                <CheckCircle size={20} />
                Выберите услуги
                {washTimerStart && (
                  <span className="ml-auto flex items-center gap-1 text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    <Timer size={14} />
                    {formatTimer(washTimerElapsed)}
                  </span>
                )}
              </h4>

              {selectedPaymentMethod && ['cash', 'card', 'transfer'].includes(selectedPaymentMethod) && !foundCounterAgent && (
                <p className="mb-4 text-gray-600">Услуга для розничного клиента ({paymentMethodLabels[selectedPaymentMethod]}).</p>
              )}
              {selectedPaymentMethod === 'counterAgentContract' && foundCounterAgent && (
                <p className="mb-4 text-gray-600">Специальные услуги для контрагента: <strong>{foundCounterAgent.name}</strong> (по договору).</p>
              )}
              {selectedPaymentMethod === 'aggregator' && selectedAggregator && (
                <p className="mb-4 text-gray-600">Услуги для агрегатора: <strong>{selectedAggregator.name}</strong></p>
              )}

              {/* Repeat Visit */}
              {lastWashServices && lastWashServices.length > 0 && (
                <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="flex items-center gap-2 font-semibold text-amber-800">
                        <Repeat size={18} />
                        Повторный визит
                      </h4>
                      <p className="text-sm text-amber-700 mt-1">
                        Услуги в прошлый раз: {lastWashServices.map(s => s.serviceName).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setWashServices(lastWashServices.map(s => ({
                          ...s,
                          id: `service-${s.serviceName}-${Date.now()}-${Math.random()}`
                        })));
                        toast({ title: "Услуги добавлены", description: "Выбраны услуги из предыдущего визита." });
                      }}
                      className="zorin-button primary"
                    >
                      <Repeat size={16} className="mr-2" />
                      Повторить
                    </button>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Поиск по названию услуги..."
                  value={serviceSearchQuery}
                  onChange={(e) => setServiceSearchQuery(e.target.value)}
                  className="zorin-input pl-8"
                />
              </div>

              {/* Services List */}
              <div className="zorin-service-list mb-4">
                {filteredServices.length > 0 ? (
                  filteredServices.map(service => {
                    const isFromLast = (service as any).isFromLastWash;
                    return (
                    <div
                      key={service.serviceName}
                      className={cn(
                        "zorin-service-item",
                        washServices.some(s => s.serviceName === service.serviceName) && "selected",
                        isFromLast && "from-last-wash"
                      )}
                      onClick={() => handleServiceSelect(service)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="zorin-service-name flex items-center gap-2">
                          {service.serviceName}
                        </span>
                        {isFromLast && (
                          <span className="last-wash-badge">
                            <Repeat className="h-3 w-3" />
                            В прошлый раз
                          </span>
                        )}
                      </div>
                      {showPrices && <span className="zorin-service-price">{service.price} руб.</span>}
                    </div>
                    );
                  })
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    {servicesToShow.length > 0 ? "Услуги, соответствующие поиску, не найдены." : "Для данного клиента нет доступных услуг."}
                  </p>
                )}
              </div>

              {/* Additional Services */}
              {(predefinedExtraServices && predefinedExtraServices.length > 0) && (
                <div className="mb-4">
                  <label className="zorin-form-label">Добавить предопределенные доп. услуги:</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {predefinedExtraServices.map(service => (
                      <button key={service.serviceName} onClick={() => handleServiceSelect(service)} className="zorin-button secondary">
                        <PlusCircle size={16} className="mr-1"/>
                        {service.serviceName} {showPrices && `(${service.price} руб.)`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Services */}
              {washServices.length > 0 && (
                <div className="mb-4">
                  <label className="zorin-form-label">Выбранные услуги:</label>
                  {washServices.map((service) => (
                    <div key={service.id} className="flex items-center justify-between p-3 border rounded-md bg-background mb-2">
                      <span className="font-medium">{service.serviceName}</span>
                      <div className="flex items-center gap-2">
                        {showPrices && <span className="font-semibold">{service.price} руб.</span>}
                        <button onClick={() => handleRemoveService(service.id)} className="zorin-action-btn delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom Service */}
              {canAddCustomServices && (
                <div className="p-3 border rounded-md bg-muted/20 space-y-2">
                  <label className="text-sm font-medium">Добавить произвольную доп. услугу</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={customExtraServiceName}
                      onChange={(e) => setCustomExtraServiceName(e.target.value)}
                      placeholder="Название услуги"
                      className="zorin-input text-sm sm:col-span-2"
                    />
                    <input
                      type="number"
                      value={customExtraServicePrice}
                      onChange={(e) => setCustomExtraServicePrice(e.target.value)}
                      placeholder="Цена"
                      className="zorin-input text-sm"
                      hidden={!showPrices}
                    />
                  </div>
                  <button onClick={handleAddCustomExtraService} className="zorin-button secondary">
                    <PlusCircle size={16} className="mr-2" /> Добавить
                  </button>
                </div>
              )}

              {/* Summary */}
              {washServices.length > 0 && (
                <div className="text-right">
                  {showPrices ? (
                    <div className="flex flex-col items-end gap-1">
                      <p className="zorin-total-amount">Итого: {totalAmount.toFixed(2)} руб.</p>
                      {selectedPaymentMethod === 'card' && acquiringFee > 0 && (
                        <p className="text-sm text-muted-foreground">К получению: {netAmount.toFixed(2)} руб. (вкл. комиссию {acquiringFee.toFixed(2)} руб.)</p>
                      )}
                      {totalChemicalGrams > 0 && (
                        <p className="text-sm text-blue-600 font-medium mt-1">
                          🧪 Химия: {(totalChemicalGrams / 1000).toFixed(3)} кг ({totalChemicalGrams}г)
                          {selectedEmployees.length > 1 && (
                            <span className="text-xs ml-1">
                              (по {(totalChemicalGrams / selectedEmployees.length).toFixed(0)}г на чел.)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xl font-bold">Оплата по договору</p>
                  )}
                  <button onClick={proceedToConfirmation} className="zorin-button primary mt-4">
                    Далее к подтверждению
                  </button>
                </div>
              )}
            </div>
          )}

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

                <hr />
                <p className="font-semibold">Оказанные услуги:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {washServices.map((s, i) => (
                      <li key={`confirm-${s.id}`}>{s.serviceName}{showPrices && ` - ${s.price} руб.`}{i === 0 && ' (Основная)'}</li>
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
                  <div className="flex items-center gap-3 pt-2">
                    <label className="zorin-form-label flex items-center gap-1 mb-0 whitespace-nowrap">
                      <Coins size={16} className="text-amber-500" />
                      Чаевые
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={tipsInput}
                      onChange={(e) => setTipsInput(e.target.value)}
                      className="zorin-input w-32"
                      min="0"
                    />
                    <span className="text-sm text-muted-foreground">руб.</span>
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
                  <button onClick={confirmWash} disabled={isLoading} className="zorin-button primary flex-1">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Подтвердить и зарегистрировать
                  </button>
                  <button onClick={() => setCurrentStep("serviceSelection")} className="zorin-button secondary">
                    Назад к услугам
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep !== 'idle' && currentStep !== 'vehicleInput' && (
            <button onClick={() => resetFormStateForNewVehicle()} className="zorin-button secondary mt-4">
              Начать заново (другая машина)
            </button>
          )}
        </div>
      )}

      <PlateRecognitionDialog
        open={isPlateDialogOpen}
        onOpenChange={setIsPlateDialogOpen}
        onPlateRecognized={handlePlateRecognized}
        onRecognitionFailed={handlePlateRecognitionFailed}
      />
    </div>
  );
}
