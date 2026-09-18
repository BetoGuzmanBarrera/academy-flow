import { useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { classNames } from './classNames';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({
  ariaLabel = 'Pestañas',
  className,
  defaultValue,
  items,
  onValueChange,
  value,
}: TabsProps) {
  const generatedId = useId();
  const firstEnabledId = items.find((item) => !item.disabled)?.id;
  const [internalValue, setInternalValue] = useState(defaultValue ?? firstEnabledId ?? '');
  const activeValue = value ?? internalValue;
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = (tabId: string) => {
    if (value === undefined) setInternalValue(tabId);
    onValueChange?.(tabId);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabledIndexes = items
      .map((item, itemIndex) => (item.disabled ? -1 : itemIndex))
      .filter((itemIndex) => itemIndex >= 0);
    if (enabledIndexes.length === 0) return;

    const currentPosition = enabledIndexes.indexOf(index);
    let targetPosition = currentPosition;
    if (event.key === 'Home') targetPosition = 0;
    if (event.key === 'End') targetPosition = enabledIndexes.length - 1;
    if (event.key === 'ArrowRight') targetPosition = (currentPosition + 1) % enabledIndexes.length;
    if (event.key === 'ArrowLeft') targetPosition = (currentPosition - 1 + enabledIndexes.length) % enabledIndexes.length;
    buttonRefs.current[enabledIndexes[targetPosition]]?.focus();
  };

  const activeItem = items.find((item) => item.id === activeValue && !item.disabled) ?? items.find((item) => !item.disabled);

  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-academy-border">
        {items.map((item, index) => {
          const selected = item.id === activeItem?.id;
          return (
            <button
              key={item.id}
              ref={(element) => { buttonRefs.current[index] = element; }}
              id={`${generatedId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${generatedId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={classNames(
                'min-h-touch whitespace-nowrap border-b-2 px-4 py-2 text-af-label transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-academy-primary',
                selected
                  ? 'border-academy-primary text-academy-primary'
                  : 'border-transparent text-academy-text-muted hover:text-academy-text',
                item.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {activeItem && (
        <div
          id={`${generatedId}-panel-${activeItem.id}`}
          role="tabpanel"
          aria-labelledby={`${generatedId}-tab-${activeItem.id}`}
          tabIndex={0}
          className="py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
