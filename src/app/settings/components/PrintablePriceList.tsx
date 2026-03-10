
import React from 'react';
import type { PriceListItem } from '@/types';
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface PrintablePriceListProps {
    mainPriceList: PriceListItem[];
    additionalPriceList: PriceListItem[];
}

export const PrintablePriceList: React.FC<PrintablePriceListProps> = ({ mainPriceList, additionalPriceList }) => {
    const today = format(new Date(), "dd MMMM yyyy", { locale: ru });

    return (
        <div className="p-8 bg-white text-black font-sans">
             <style>
                {`
                @media print {
                    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                    @page { size: A4; margin: 20mm; }
                }
                table { border-collapse: collapse; width: 100%; font-size: 10pt; }
                th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                h1, h2, h3 { font-family: 'Arial', sans-serif; }
                `}
            </style>
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold">Прайс-лист на услуги грузовой автомойки</h1>
                <p className="text-sm text-gray-600">Актуально на {today} г.</p>
            </div>

            {mainPriceList.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold border-b-2 border-black pb-2 mb-4">Основные услуги</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Наименование услуги</th>
                                <th className="w-32 text-right">Цена, руб.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mainPriceList.map((service, index) => (
                                <tr key={`main-${index}`} className="hover:bg-gray-50">
                                    <td>{service.serviceName}</td>
                                    <td className="text-right font-medium">{service.price.toLocaleString('ru-RU')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {additionalPriceList.length > 0 && (
                 <div>
                    <h2 className="text-xl font-semibold border-b-2 border-black pb-2 mb-4">Дополнительные услуги</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Наименование услуги</th>
                                <th className="w-32 text-right">Цена, руб.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {additionalPriceList.map((service, index) => (
                                <tr key={`add-${index}`} className="hover:bg-gray-50">
                                    <td>{service.serviceName}</td>
                                    <td className="text-right font-medium">{service.price.toLocaleString('ru-RU')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
