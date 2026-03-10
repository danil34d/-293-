
"use client";

import { useFieldArray, type Control } from "react-hook-form";
import { FormField, FormControl, FormLabel, FormItem, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPlus, Trash2 } from "lucide-react";
import React from "react";

export const priceListItemSchema = z.object({
  serviceName: z.string().min(1, "Название услуги не может быть пустым."),
  price: z.coerce.number().min(0, "Цена должна быть положительным числом или нулем."),
  chemicalConsumption: z.coerce.number().min(0, "Расход должен быть положительным числом или нулем.").optional(),
});

interface PriceListEditorProps<T> {
  control: Control<T | any>;
  fieldArrayName: string;
  emptyListMessage?: string;
  buttonText?: string;
}

export function PriceListEditor<T>({ 
    control, 
    fieldArrayName, 
    emptyListMessage = "Прайс-лист пуст.",
    buttonText = "Добавить услугу",
}: PriceListEditorProps<T>) {
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldArrayName,
  });

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3 italic">
          {emptyListMessage}
        </p>
      )}
      {fields.map((field, index) => (
        <div key={field.id} className="p-4 border rounded-lg space-y-3 relative bg-background shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <FormField
              control={control}
              name={`${fieldArrayName}.${index}.serviceName`}
              render={({ field: serviceNameField }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Название услуги №{index + 1}</FormLabel>
                  <FormControl>
                    <Input placeholder="например, Мойка тягача Евро (спец.)" {...serviceNameField} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`${fieldArrayName}.${index}.price`}
              render={({ field: priceField }) => (
                <FormItem>
                  <FormLabel>Цена (руб.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="например, 500" {...priceField} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`${fieldArrayName}.${index}.chemicalConsumption`}
              render={({ field: chemicalField }) => (
                <FormItem>
                  <FormLabel>Расход химии (гр.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="300" {...chemicalField} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {fields.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              aria-label="Удалить услугу из прайс-листа"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ serviceName: "", price: 0, chemicalConsumption: 0 })}
        className="mt-2"
      >
        <ListPlus className="mr-2 h-4 w-4" /> {buttonText}
      </Button>
    </div>
  );
}
