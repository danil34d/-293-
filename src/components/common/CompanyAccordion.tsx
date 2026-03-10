
"use client";

import { useFieldArray, type Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Briefcase, Building, Mail, Phone, Hash, MessageSquare, PlusCircle, Trash2 } from "lucide-react";

export const companySchema = z.object({
  companyName: z.string().min(2, "Название компании должно содержать не менее 2 символов."),
  ownerName: z.string().min(2, "Имя владельца должно содержать не менее 2 символов."),
  managerSocialContact: z.string().optional(),
  accountantSocialContact: z.string().optional(),
  
  customerName: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  ogrnNumber: z.string().optional(),
  ogrnDate: z.string().optional(),
  legalAddress: z.string().optional(),
  bankName: z.string().optional(),
  settlementAccount: z.string().optional(),
  correspondentAccount: z.string().optional(),
  bik: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email({ message: "Неверный формат e-mail." }).optional().or(z.literal('')),
});

export const baseCompany = {
  companyName: "", ownerName: "", managerSocialContact: "", accountantSocialContact: "",
  customerName: "", inn: "", kpp: "", ogrnNumber: "", ogrnDate: "", legalAddress: "",
  bankName: "", settlementAccount: "", correspondentAccount: "", bik: "", phone: "", email: "",
};

interface CompanyAccordionProps<T> {
  control: Control<T | any>;
}

export function CompanyAccordion<T>({ control }: CompanyAccordionProps<T>) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "companies",
  });

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="font-headline text-lg">Связанные компании</CardTitle>
        <CardDescription>Перечислите компании, их владельцев, контакты и реквизиты для счетов.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field, index) => (
          <div key={field.id} className="p-4 border rounded-lg space-y-4 relative bg-background shadow-sm">
            <h4 className="text-md font-semibold text-primary border-b pb-2 mb-3">Компания №{index + 1}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name={`companies.${index}.companyName`} render={({ field: f }) => (
                <FormItem><FormLabel>Название компании</FormLabel><FormControl><Input placeholder="ООО 'Глобал Транспорт'" {...f} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name={`companies.${index}.ownerName`} render={({ field: f }) => (
                <FormItem><FormLabel>Имя владельца/представителя</FormLabel><FormControl><Input placeholder="Иван Иванов" {...f} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name={`companies.${index}.managerSocialContact`} render={({ field: f }) => (
                <FormItem><FormLabel>Контакт соц. сети начальника</FormLabel><FormControl><Input placeholder="@ivan_ivanov_tg (необязательно)" {...f} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name={`companies.${index}.accountantSocialContact`} render={({ field: f }) => (
                <FormItem><FormLabel>Контакт соц. сети бухгалтера</FormLabel><FormControl><Input placeholder="@anna_buh_vk (необязательно)" {...f} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            
            <Accordion type="single" collapsible className="w-full pt-2">
              <AccordionItem value="item-1" className="border-t">
                <AccordionTrigger className="hover:no-underline py-3">
                  <h5 className="text-sm font-semibold text-muted-foreground flex items-center"><Briefcase className="w-4 h-4 mr-2" />Реквизиты для выставления счетов (нажмите, чтобы развернуть)</h5>
                </AccordionTrigger>
                <AccordionContent className="pt-2 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name={`companies.${index}.customerName`} render={({ field: f }) => (
                        <FormItem><FormLabel>Заказчик (если отличается)</FormLabel><FormControl><Input placeholder="ООО 'Покупатель Плюс'" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`companies.${index}.inn`} render={({ field: f }) => (
                        <FormItem><FormLabel>ИНН</FormLabel><FormControl><Input placeholder="1234567890" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`companies.${index}.kpp`} render={({ field: f }) => (
                        <FormItem><FormLabel>КПП</FormLabel><FormControl><Input placeholder="123450001" {...f} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={control} name={`companies.${index}.legalAddress`} render={({ field: f }) => (
                      <FormItem><FormLabel>Юридический адрес</FormLabel><FormControl><Input placeholder="г. Город, ул. Улица, д. 1, оф. 2" {...f} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <h6 className="text-xs font-semibold text-muted-foreground pt-2 flex items-center"><Building className="w-3 h-3 mr-1.5" />Банковские реквизиты:</h6>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={control} name={`companies.${index}.bankName`} render={({ field: f }) => (
                          <FormItem><FormLabel>Название банка</FormLabel><FormControl><Input placeholder="ПАО СБЕРБАНК" {...f} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={control} name={`companies.${index}.bik`} render={({ field: f }) => (
                          <FormItem><FormLabel>БИК</FormLabel><FormControl><Input placeholder="044525225" {...f} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={control} name={`companies.${index}.settlementAccount`} render={({ field: f }) => (
                          <FormItem><FormLabel>Расчетный счет (р/с)</FormLabel><FormControl><Input placeholder="40702810000000000000" {...f} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={control} name={`companies.${index}.correspondentAccount`} render={({ field: f }) => (
                          <FormItem><FormLabel>Корреспондентский счет (к/с)</FormLabel><FormControl><Input placeholder="30101810000000000225" {...f} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                  <h6 className="text-xs font-semibold text-muted-foreground pt-2">Контактные данные компании:</h6>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={control} name={`companies.${index}.phone`} render={({ field: f }) => (
                          <FormItem><FormLabel>Телефон</FormLabel><FormControl><Input type="tel" placeholder="+7 (XXX) XXX-XX-XX" {...f} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={control} name={`companies.${index}.email`} render={({ field: f }) => (
                          <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input type="email" placeholder="company@example.com" {...f} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" onClick={() => remove(index)} aria-label="Удалить компанию">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => append(baseCompany)} className="mt-2">
          <PlusCircle className="mr-2 h-4 w-4" /> Добавить компанию
        </Button>
      </CardContent>
    </Card>
  );
}
