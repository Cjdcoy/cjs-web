import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { classNames } from "./classNames";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: ReactNode;
  accessibleLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<Value extends string> {
  ariaLabel: string;
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
  disabled?: boolean;
}

type SegmentStyle = CSSProperties & {
  "--cjs-segment-count": number;
};

export function SegmentedControl<Value extends string>({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  value,
}: SegmentedControlProps<Value>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstEnabledIndex = options.findIndex((option) => !option.disabled);
  const hasEnabledSelection = options.some((option) => option.value === value && !option.disabled);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }

    const enabledOptions = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ??
        [],
    );

    if (enabledOptions.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = Math.max(enabledOptions.indexOf(event.currentTarget), 0);
    let nextIndex: number;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledOptions.length - 1;
    } else {
      const movesBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";
      nextIndex =
        (currentIndex + (movesBackward ? -1 : 1) + enabledOptions.length) % enabledOptions.length;
    }

    const nextOption = enabledOptions[nextIndex];
    nextOption.focus();
    onChange(nextOption.dataset.value as Value);
  };

  return (
    <div
      ref={containerRef}
      className={classNames("cjs-segmented-control", className)}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      style={{ "--cjs-segment-count": options.length } as SegmentStyle}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isDisabled = disabled || option.disabled;
        const isFallbackTabStop = !hasEnabledSelection && index === firstEnabledIndex;

        return (
          <button
            key={option.value}
            type="button"
            className="cjs-segmented-control__option"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.accessibleLabel}
            data-value={option.value}
            disabled={isDisabled}
            tabIndex={!isDisabled && (isSelected || isFallbackTabStop) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={handleKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
