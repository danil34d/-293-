
"use client";
import React, { useMemo } from 'react';
import type { CounterAgent, Aggregator, MyCompanyDetails, PriceListItem, CounterAgentCompany } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface EditableService extends PriceListItem {
    id?: string; // For stable rendering
    count: number;
    total: number;
}
interface InvoiceTemplateProps {
    myCompany: MyCompanyDetails;
    customer: CounterAgent | Aggregator;
    services: EditableService[];
    invoiceNumber: string;
    invoiceDate: Date;
}

// Вспомогательная функция для преобразования числа в пропись
function numberToWords(num: number): string {
    const to_19 = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const to_99 = ['', 'десять', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const to_999 = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    const to_1000s = [['копейка', 'копейки', 'копеек'], ['рубль', 'рубля', 'рублей'], ['тысяча', 'тысячи', 'тысяч'], ['миллион', 'миллиона', 'миллионов']];
    
    function declension(n: number, titles: string[]): string {
      const cases = [2, 0, 1, 1, 1, 2];
      return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : cases[Math.min(n % 10, 5)]];
    }
  
    function numToWords(n: number, gender: 'male' | 'female'): string {
      let str = '';
      if (n > 999) str += numToWords(Math.floor(n / 1000), 'female') + ' ' + declension(Math.floor(n / 1000), to_1000s[2]) + ' ';
      n %= 1000;
      if (n > 99) str += to_999[Math.floor(n / 100)] + ' ';
      n %= 100;
      if (n > 19) str += to_99[Math.floor(n / 10)] + ' ';
      n %= 10;
      if (n > 0) {
        if (gender === 'female' && (n === 1 || n === 2)) str += (n === 1 ? 'одна' : 'две');
        else str += to_19[n];
      }
      return str.trim();
    }
  
    const rub = Math.floor(num);
    const kop = Math.round((num - rub) * 100);
    let result = numToWords(rub, 'male') + ' ' + declension(rub, to_1000s[1]);
    result = result.charAt(0).toUpperCase() + result.slice(1);
    result += ' ' + (kop < 10 ? '0' : '') + kop + ' ' + declension(kop, to_1000s[0]);
    return result;
}

export function InvoiceTemplate({ myCompany, customer, services, invoiceNumber, invoiceDate }: InvoiceTemplateProps) {
    
    const totalSum = services.reduce((sum, service) => sum + service.total, 0);
    const totalSumInWords = numberToWords(totalSum);
    const customerCompany: Partial<CounterAgentCompany> = customer.companies?.[0] || {};
    const formattedInvoiceDate = format(invoiceDate, 'dd.MM.yyyy');

    return (
        <div className="p-4 bg-white text-black font-['Arial'] text-xs">
            <style>
                {`
                @media print {
                    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                    .print-page-break { page-break-after: always; }
                    @page { size: A4; margin: 20mm; }
                }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid black; padding: 2px 4px; }
                .borderless-td { border: none !important; }
                `}
            </style>
            
            {/* --- СЧЕТ НА ОПЛАТУ --- */}
            <div className="print-page-break">
                <table className="w-full mb-4">
                    <tbody>
                        <tr>
                            <td className="w-1/2 p-1 borderless-td align-top">
                                <p className="text-xs">Банк получателя</p>
                                <p className="font-bold">{myCompany.bankName}</p>
                            </td>
                            <td className="p-1 borderless-td align-top">
                                <p>БИК</p>
                                <p>Сч. №</p>
                            </td>
                            <td className="w-1/3 p-1 text-left borderless-td align-top">
                                <p className="font-bold">{myCompany.bik}</p>
                                <p className="font-bold">{myCompany.correspondentAccount}</p>
                            </td>
                        </tr>
                        <tr>
                            <td className="p-1 borderless-td">
                                <p>ИНН {myCompany.inn}</p>
                                <p>Получатель</p>
                            </td>
                            <td colSpan={2} className="p-1 borderless-td">
                                <p>КПП {myCompany.kpp || ''}</p>
                                <p className="font-bold">{myCompany.companyName}</p>
                            </td>
                        </tr>
                         <tr>
                            <td className="p-1 borderless-td">
                                <p>Сч. №</p>
                            </td>
                            <td colSpan={2} className="p-1 borderless-td">
                                <p className="font-bold">{myCompany.settlementAccount}</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <h1 className="font-bold text-base my-4 border-b-2 border-black pb-1">Счет на оплату № {invoiceNumber} от {formattedInvoiceDate} г.</h1>
                <table className="w-full border-0">
                    <tbody>
                        <tr>
                            <td className="w-24 border-0 pr-2 align-top">Исполнитель:</td>
                            <td className="border-0 font-bold">{myCompany.companyName}, ИНН {myCompany.inn}, {myCompany.legalAddress}</td>
                        </tr>
                         <tr>
                            <td className="w-24 border-0 pr-2 align-top">Заказчик:</td>
                            <td className="border-0 font-bold">{customerCompany.customerName || customerCompany.companyName}, ИНН {customerCompany.inn}, КПП {customerCompany.kpp}, {customerCompany.legalAddress}</td>
                        </tr>
                    </tbody>
                </table>
                <table className="w-full my-4 text-xs">
                    <thead>
                        <tr className="font-bold">
                            <th className="p-1">№</th>
                            <th className="p-1 text-left">Товары (работы, услуги)</th>
                            <th className="p-1">Кол-во</th>
                            <th className="p-1">Ед.</th>
                            <th className="p-1">Цена</th>
                            <th className="p-1">Сумма</th>
                        </tr>
                    </thead>
                     <tbody>
                        {services.map((service, index) => (
                            <tr key={service.id || index}>
                                <td className="text-center p-1">{index + 1}</td>
                                <td className="p-1">{service.serviceName}</td>
                                <td className="text-right p-1">{service.count}</td>
                                <td className="text-left p-1">шт</td>
                                <td className="text-right p-1">{service.price.toFixed(2).replace('.', ',')}</td>
                                <td className="text-right p-1">{service.total.toFixed(2).replace('.', ',')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <table className="w-full border-0">
                    <tbody>
                        <tr>
                            <td className="border-0 text-right font-bold">Итого:</td>
                            <td className="border-0 text-right font-bold w-32">{totalSum.toFixed(2).replace('.', ',')}</td>
                        </tr>
                         <tr>
                            <td className="border-0 text-right font-bold">В том числе НДС:</td>
                            <td className="border-0 text-right font-bold w-32">Без НДС</td>
                        </tr>
                         <tr>
                            <td className="border-0 text-right font-bold">Всего к оплате:</td>
                            <td className="border-0 text-right font-bold w-32">{totalSum.toFixed(2).replace('.', ',')}</td>
                        </tr>
                    </tbody>
                </table>
                <p className="mt-2">Всего наименований {services.length}, на сумму {totalSum.toLocaleString('ru-RU', {minimumFractionDigits: 2})} руб.</p>
                <p className="font-bold">{totalSumInWords}</p>
                <div className="mt-8 pt-4 border-t-2 border-black flex items-end">
                    <p className="font-bold mr-4">Директор</p>
                    <div className="flex-grow border-b border-black"></div>
                    <p className="ml-4">/ {myCompany.ownerName || ''} /</p>
                </div>
            </div>

            {/* --- АКТ ВЫПОЛНЕННЫХ РАБОТ --- */}
            <div>
                 <div className="text-center font-bold text-lg my-6">
                    АКТ № {invoiceNumber} от {formattedInvoiceDate} г.
                </div>
                <div className="space-y-2 mb-6">
                    <p><strong>Исполнитель:</strong> {myCompany.companyName}, ИНН: {myCompany.inn}, ОГРНИП: {myCompany.ogrnip}, Адрес: {myCompany.legalAddress}</p>
                    <p><strong>Заказчик:</strong> {customerCompany.customerName || customerCompany.companyName}, ИНН: {customerCompany.inn}, КПП: {customerCompany.kpp || 'не указан'}, Адрес: {customerCompany.legalAddress}</p>
                </div>
                 <table className="w-full my-4 text-xs">
                    <thead>
                        <tr className="font-bold">
                            <th className="p-1">№</th>
                            <th className="p-1 text-left">Наименование работы (услуги)</th>
                            <th className="p-1">Ед.изм.</th>
                            <th className="p-1">Кол-во</th>
                            <th className="p-1">Цена</th>
                            <th className="p-1">Сумма</th>
                        </tr>
                    </thead>
                    <tbody>
                        {services.map((service, index) => (
                            <tr key={service.id || index}>
                                <td className="text-center p-1">{index + 1}</td>
                                <td className="p-1">{service.serviceName}</td>
                                <td className="text-center p-1">шт</td>
                                <td className="text-right p-1">{service.count}</td>
                                <td className="text-right p-1">{service.price.toFixed(2).replace('.', ',')}р.</td>
                                <td className="text-right p-1">{service.total.toFixed(2).replace('.', ',')}р.</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={5} className="text-right font-bold pr-2">Итого:</td>
                            <td className="text-right font-bold p-1">{totalSum.toFixed(2).replace('.', ',')}р.</td>
                        </tr>
                    </tfoot>
                </table>
                 <div className="mt-4">
                    <p>Всего оказано услуг {services.length}, на сумму {totalSum.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}.</p>
                    <p><strong>{totalSumInWords}</strong></p>
                    <p className="font-bold">Без налога (НДС).</p>
                </div>
                <div className="mt-6">
                    <p>Вышеперечисленные работы (услуги) выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.</p>
                </div>
                <div className="flex justify-between mt-12 pt-8">
                    <div className="w-2/5">
                        <p className="font-bold mb-1">Исполнитель</p>
                        <div className="mt-8 border-b border-black"></div>
                        <p className="text-xs text-center">(подпись)</p>
                    </div>
                    <div className="w-2/5">
                        <p className="font-bold mb-1">Заказчик</p>
                        <div className="mt-8 border-b border-black"></div>
                        <p className="text-xs text-center">(подпись)</p>
                    </div>
                </div>
                 <div className="flex justify-between mt-4">
                    <div className="w-2/5">
                        <p className="text-xs text-center">М.П.</p>
                    </div>
                    <div className="w-2/5">
                        <p className="text-xs text-center">М.П.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
