import React from 'react';

interface ZorinPageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function ZorinPageHeader({ title, description, actions }: ZorinPageHeaderProps) {
  return (
    <div className="zorin-page-header">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="zorin-page-title">{title}</h1>
          {description && (
            <p className="zorin-page-description">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}