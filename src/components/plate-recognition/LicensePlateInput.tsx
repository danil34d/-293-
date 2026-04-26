"use client";

import { useEffect, useRef, useState } from 'react';

interface LicensePlateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LicensePlateInput({
  value,
  onChange,
  disabled = false,
  className = ''
}: LicensePlateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [clickedPosition, setClickedPosition] = useState<number | null>(null);

  // Нормализуем значение для отображения (сохраняем пробелы как пустые позиции)
  const normalizedValue = value.toUpperCase();

  // Разбиваем номер на части: X000XX RR
  // Пробелы отображаются как подчеркивания
  const char1 = !normalizedValue[0] || normalizedValue[0] === ' ' ? '_' : normalizedValue[0];
  const char2 = !normalizedValue[1] || normalizedValue[1] === ' ' ? '_' : normalizedValue[1];
  const char3 = !normalizedValue[2] || normalizedValue[2] === ' ' ? '_' : normalizedValue[2];
  const char4 = !normalizedValue[3] || normalizedValue[3] === ' ' ? '_' : normalizedValue[3];
  const char5 = !normalizedValue[4] || normalizedValue[4] === ' ' ? '_' : normalizedValue[4];
  const char6 = !normalizedValue[5] || normalizedValue[5] === ' ' ? '_' : normalizedValue[5];
  const region = normalizedValue.slice(6).replace(/\s/g, '') || '';

  // Форматируем регион с подчеркиваниями (2 по умолчанию, 3 если введено)
  const formattedRegion = region.length >= 3
    ? region.slice(0, 3)
    : region.padEnd(2, '_');

  const handleClick = () => {
    inputRef.current?.focus();
  };

  // Клик на конкретную позицию для редактирования
  const handlePositionClick = (position: number | 'region', e: React.MouseEvent) => {
    if (disabled) {
      return;
    }

    // Останавливаем всплытие, чтобы не сработал общий handleClick
    e.stopPropagation();
    e.preventDefault();

    const currentVal = value.toUpperCase();

    if (position === 'region') {
      // Удаляем весь регион
      const newValue = currentVal.slice(0, 6).trimEnd();
      onChange(newValue);
    } else if (typeof position === 'number' && position >= 0 && position <= 5) {
      // Заменяем символ на пробел, сохраняя остальные позиции
      // ВАЖНО: берём только первые 6 символов для основной части
      const mainPart = currentVal.slice(0, 6).padEnd(6, ' ');
      const chars = mainPart.split('');
      chars[position] = ' ';
      const newMainPart = chars.join('');
      const regionPart = currentVal.slice(6);
      const newValue = (newMainPart + regionPart).trimEnd();
      // Запоминаем позицию для следующего ввода
      setClickedPosition(position);
      onChange(newValue);

      // Устанавливаем курсор на позицию удаленного символа
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(position, position);
        }
      }, 10);
      return; // Не выполняем общий setTimeout ниже
    }

    // Устанавливаем фокус на input (для региона)
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Если был клик на позицию - обрабатываем ввод символа
    if (clickedPosition !== null && clickedPosition >= 0 && clickedPosition <= 5) {
      const key = e.key.toUpperCase();

      // Автоматическая замена кириллицы на латиницу
      const cyrToLat: { [key: string]: string } = {
        'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M',
        'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
        'У': 'Y', 'Х': 'X'
      };

      const char = cyrToLat[key] || key;

      // Проверяем что символ подходит для этой позиции
      let isValid = false;
      if (clickedPosition === 0 || clickedPosition === 4 || clickedPosition === 5) {
        // Должна быть буква
        isValid = /[ABEKMHOPCTYX]/.test(char);
      } else {
        // Должна быть цифра
        isValid = /[0-9]/.test(char);
      }

      if (isValid && char.length === 1) {
        e.preventDefault(); // Предотвращаем стандартный ввод

        // Вставляем символ на кликнутую позицию
        const chars = value.slice(0, 6).padEnd(6, ' ').split('');
        chars[clickedPosition] = char;
        const mainPart = chars.join('');
        const regionPart = value.slice(6);
        const newValue = (mainPart + regionPart).trimEnd();

        setClickedPosition(null);
        onChange(newValue);
        return;
      } else if (key === 'BACKSPACE' || key === 'DELETE') {
        // Разрешаем удаление
        setClickedPosition(null);
      } else {
        e.preventDefault();
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.toUpperCase();

    // Автоматическая замена кириллицы на латиницу
    const cyrToLat: { [key: string]: string } = {
      'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M',
      'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
      'У': 'Y', 'Х': 'X'
    };

    input = input.split('').map(char => cyrToLat[char] || char).join('');

    // Если пользователь полностью очистил поле - очищаем все
    if (!input || input.replace(/\s/g, '').length === 0) {
      onChange('');
      setClickedPosition(null);
      return;
    }

    // Получаем текущее состояние (с пробелами как пустыми позициями)
    // ВАЖНО: берём только первые 6 символов для основной части, регион отдельно
    const currentChars = value.slice(0, 6).padEnd(6, ' ').split('');
    const currentRegion = value.slice(6) || '';

    // Извлекаем только новые символы (разница между input и value)
    const inputClean = input.replace(/\s/g, '');
    const valueClean = value.replace(/\s/g, '');

    // Если новое значение короче - значит удаляли символы, не обрабатываем
    if (inputClean.length < valueClean.length) {
      // Пользователь удалил символы - обрабатываем как обычный ввод
      let validated = '';
      for (let i = 0; i < inputClean.length && i < 9; i++) {
        const char = inputClean[i];
        if (i === 0 && /[ABEKMHOPCTYX]/.test(char)) {
          validated += char;
        } else if (i >= 1 && i <= 3 && /[0-9]/.test(char)) {
          validated += char;
        } else if ((i === 4 || i === 5) && /[ABEKMHOPCTYX]/.test(char)) {
          validated += char;
        } else if (i >= 6 && /[0-9]/.test(char)) {
          validated += char;
        } else {
          break;
        }
      }
      onChange(validated);
      return;
    }

    // Новые символы для добавления
    const newChars = inputClean.slice(valueClean.length);

    // Заполняем пустые позиции новыми символами
    let result = currentChars.slice();
    let newCharIndex = 0;

    for (let i = 0; i < 6 && newCharIndex < newChars.length; i++) {
      if (result[i] === ' ') {
        const char = newChars[newCharIndex];

        if (i === 0 || i === 4 || i === 5) {
          // Должна быть буква
          if (/[ABEKMHOPCTYX]/.test(char)) {
            result[i] = char;
            newCharIndex++;
          }
        } else {
          // Должна быть цифра
          if (/[0-9]/.test(char)) {
            result[i] = char;
            newCharIndex++;
          }
        }
      }
    }

    // Добавляем оставшиеся символы в регион
    let newRegion = currentRegion;
    while (newCharIndex < newChars.length) {
      const char = newChars[newCharIndex];
      if (/[0-9]/.test(char) && newRegion.length < 3) {
        newRegion += char;
      }
      newCharIndex++;
    }

    const finalValue = (result.join('') + newRegion).trimEnd();
    onChange(finalValue);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Визуальное представление номера */}
      <div
        className={`
          relative inline-flex items-center gap-1
          bg-white border-[3px] border-black rounded-md
          px-3 py-2
          font-mono font-bold text-2xl tracking-wider
          shadow-lg
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
          transition-all hover:shadow-xl
        `}
        style={{
          fontFamily: '"Courier New", Courier, monospace',
          letterSpacing: '0.15em'
        }}
      >
        {/* Основная часть номера */}
        <div className="flex items-center gap-0.5">
          <span
            onMouseDown={(e) => handlePositionClick(0, e)}
            className={`
              inline-block select-none relative z-10
              ${char1 === '_' ? 'text-gray-400' : 'text-black'}
              ${char1 !== '_' && !disabled ? 'cursor-pointer hover:bg-gray-200 hover:rounded px-0.5 transition-colors' : ''}
            `}
            style={{ pointerEvents: char1 !== '_' && !disabled ? 'auto' : 'none' }}
          >
            {char1}
          </span>
          <span
            onMouseDown={(e) => handlePositionClick(1, e)}
            className={`
              inline-block select-none relative z-10
              ${char2 === '_' ? 'text-gray-400' : 'text-black'}
              ${char2 !== '_' && !disabled ? 'cursor-pointer hover:bg-gray-200 hover:rounded px-0.5 transition-colors' : ''}
            `}
            style={{ pointerEvents: char2 !== '_' && !disabled ? 'auto' : 'none' }}
          >
            {char2}
          </span>
          <span
            onMouseDown={(e) => handlePositionClick(2, e)}
            className={`
              inline-block select-none relative z-10
              ${char3 === '_' ? 'text-gray-400' : 'text-black'}
              ${char3 !== '_' && !disabled ? 'cursor-pointer hover:bg-gray-200 hover:rounded px-0.5 transition-colors' : ''}
            `}
            style={{ pointerEvents: char3 !== '_' && !disabled ? 'auto' : 'none' }}
          >
            {char3}
          </span>
          <span
            onMouseDown={(e) => handlePositionClick(3, e)}
            className={`
              inline-block select-none relative z-10
              ${char4 === '_' ? 'text-gray-400' : 'text-black'}
              ${char4 !== '_' && !disabled ? 'cursor-pointer hover:bg-gray-200 hover:rounded px-0.5 transition-colors' : ''}
            `}
            style={{ pointerEvents: char4 !== '_' && !disabled ? 'auto' : 'none' }}
          >
            {char4}
          </span>
          <span
            onMouseDown={(e) => handlePositionClick(4, e)}
            className={`
              inline-block select-none relative z-10
              ${char5 === '_' ? 'text-gray-400' : 'text-black'}
              ${char5 !== '_' && !disabled ? 'cursor-pointer hover:bg-gray-200 hover:rounded px-0.5 transition-colors' : ''}
            `}
            style={{ pointerEvents: char5 !== '_' && !disabled ? 'auto' : 'none' }}
          >
            {char5}
          </span>
          <span
            onMouseDown={(e) => handlePositionClick(5, e)}
            className={`
              inline-block select-none relative z-10
              ${char6 === '_' ? 'text-gray-400' : 'text-black'}
              ${char6 !== '_' && !disabled ? 'cursor-pointer hover:bg-gray-200 hover:rounded px-0.5 transition-colors' : ''}
            `}
            style={{ pointerEvents: char6 !== '_' && !disabled ? 'auto' : 'none' }}
          >
            {char6}
          </span>
        </div>

        {/* Разделитель */}
        <div className="w-3" />

        {/* Регион */}
        <div
          onMouseDown={(e) => handlePositionClick('region', e)}
          className={`
            flex flex-col items-center justify-center border-l-2 border-black pl-2 relative z-10
            ${region && !disabled ? 'cursor-pointer hover:bg-gray-200 rounded transition-colors px-1' : ''}
          `}
          style={{ pointerEvents: region && !disabled ? 'auto' : 'none' }}
        >
          <div className="flex items-center gap-0.5 text-xl">
            {formattedRegion.split('').map((char, idx) => (
              <span key={idx} className={char === '_' ? 'text-gray-400' : 'text-black'}>
                {char}
              </span>
            ))}
          </div>
          <div className="text-[10px] font-semibold text-black mt-[-2px]">RUS</div>
        </div>

        {/* Флаг РФ (упрощенный) */}
        <div className="absolute top-1 right-1 flex flex-col w-4 h-3 text-[6px] overflow-hidden rounded-sm">
          <div className="h-1/3 bg-white"></div>
          <div className="h-1/3 bg-blue-600"></div>
          <div className="h-1/3 bg-red-600"></div>
        </div>
      </div>

      {/* Скрытый input для ввода */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="absolute inset-0 opacity-0 cursor-text"
        placeholder="А123ВС777"
        maxLength={10}
      />
    </div>
  );
}
