"use client";

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="relative overflow-hidden transition-all duration-300 hover:bg-primary/10 hover:scale-110"
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      <Sun
        className={`h-5 w-5 transition-all duration-300 ${
          theme === 'light'
            ? 'rotate-0 scale-100 text-amber-500'
            : 'rotate-90 scale-0 text-transparent'
        }`}
      />
      <Moon
        className={`absolute h-5 w-5 transition-all duration-300 ${
          theme === 'dark'
            ? 'rotate-0 scale-100 text-blue-400'
            : '-rotate-90 scale-0 text-transparent'
        }`}
      />
    </Button>
  );
}
