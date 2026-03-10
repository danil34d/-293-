
"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { CounterAgentCompany } from "@/types";
import { Briefcase, Building, Mail, Phone, Hash, MessageSquare } from "lucide-react";

interface CompanyDetailsProps {
    companies: CounterAgentCompany[];
    parentId: string;
}

const renderDetail = (label: string, value?: string, Icon?: React.ElementType) => {
    if (!value) return null;
    return (
      <p className="text-muted-foreground flex items-center">
        {Icon && <Icon className="h-3 w-3 mr-1.5" />}
        <span className="font-medium text-foreground/80">{label}:</span>&nbsp;{value}
      </p>
    );
};

export function CompanyDetails({ companies, parentId }: CompanyDetailsProps) {
    if (!companies || companies.length === 0) {
        return <span className="text-sm text-muted-foreground italic">Компании не указаны</span>;
    }

    return (
        <Accordion type="single" collapsible className="w-full">
            {companies.map((c, idx) => (
                <AccordionItem value={`item-${idx}`} key={`${parentId}-company-${idx}`} className="border-b-0 py-0">
                    <AccordionTrigger className="text-sm py-1.5 hover:no-underline [&[data-state=open]>svg]:text-primary">
                        <div className="flex items-center">
                            <Briefcase className="h-4 w-4 mr-2 text-muted-foreground"/>
                            <span className="font-semibold text-foreground">{c.companyName}</span>
                            {c.ownerName && <span className="text-muted-foreground ml-1">({c.ownerName})</span>}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2 pl-6 space-y-1.5 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                            {renderDetail("Начальник", c.managerSocialContact, MessageSquare)}
                            {renderDetail("Бухгалтер", c.accountantSocialContact, MessageSquare)}
                        </div>
                        
                        { (c.customerName || c.inn || c.kpp || c.ogrnNumber || c.legalAddress || c.bankName || c.phone || c.email) && <Separator className="my-2"/>}
                        
                        {renderDetail("Заказчик", c.customerName)}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                            {renderDetail("ИНН", c.inn, Hash)}
                            {renderDetail("КПП", c.kpp, Hash)}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                            {renderDetail("ОГРН", c.ogrnNumber, Hash)}
                            {renderDetail("Дата ОГРН", c.ogrnDate)}
                        </div>
                        {renderDetail("Адрес", c.legalAddress, Building)}
                        
                        { (c.bankName || c.settlementAccount || c.correspondentAccount || c.bik) && (
                            <>
                                <p className="font-medium text-foreground/90 mt-1.5">Банк. реквизиты:</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 pl-2 border-l border-muted-foreground/20">
                                    {renderDetail("Банк", c.bankName)}
                                    {renderDetail("БИК", c.bik)}
                                    {renderDetail("р/с", c.settlementAccount)}
                                    {renderDetail("к/с", c.correspondentAccount)}
                                </div>
                            </>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 mt-1.5">
                          {renderDetail("Тел.", c.phone, Phone)}
                          {renderDetail("Email", c.email, Mail)}
                        </div>
                        {!c.managerSocialContact && !c.accountantSocialContact && !c.customerName && !c.inn && !c.kpp && !c.ogrnNumber && !c.legalAddress && !c.bankName && !c.phone && !c.email && (
                            <p className="text-muted-foreground/70 italic">Дополнительные реквизиты и контакты не указаны.</p>
                        )}
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}
