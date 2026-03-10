
"use client";

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export function Pagination({ currentPage, totalPages }: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createPageURL = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Страница {currentPage} из {totalPages}
      </div>
      <div className="flex items-center space-x-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
        >
          <Link href={createPageURL(currentPage - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Назад
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
        >
          <Link href={createPageURL(currentPage + 1)}>
            Вперед
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
