import { useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, IconButton, Input } from '../../../components/ui';
import {
  isAtLatest,
  isToday,
  rangeLabel,
  stepRange,
  todayString,
  type SalesDateMode,
  type SalesDateRange,
} from '../utils/sales-order-dates';

const MODES: Array<{ value: SalesDateMode; label: string }> = [
  { value: 'day', label: 'Day / يوم' },
  { value: 'month', label: 'Month / شهر' },
  { value: 'all', label: 'All / الكل' },
];

/** Horizontal drag distance, in px, before a swipe counts as a step. */
const SWIPE_THRESHOLD = 60;

export function SalesOrderDateNavigator({
  range,
  onAnchorChange,
  onModeChange,
}: {
  range: SalesDateRange;
  onAnchorChange: (anchor: string) => void;
  onModeChange: (mode: SalesDateMode) => void;
}) {
  const swipeStart = useRef<number | null>(null);
  const atLatest = isAtLatest(range);
  const showingAll = range.mode === 'all';

  const step = (direction: -1 | 1) => {
    if (showingAll || (direction === 1 && atLatest)) return;
    onAnchorChange(stepRange(range, direction));
  };

  return (
    <Card dense>
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        // Swiping left moves back in time, matching the arrow on the left.
        onTouchStart={(event) => { swipeStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start === null || end === undefined) return;
          const distance = end - start;
          if (Math.abs(distance) < SWIPE_THRESHOLD) return;
          step(distance > 0 ? -1 : 1);
        }}
      >
        <div className="flex items-center gap-2">
          <IconButton
            label="Previous / السابق"
            variant="secondary"
            icon={<ChevronLeft />}
            disabled={showingAll}
            onClick={() => step(-1)}
          />
          <div className="min-w-[13rem] text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-900">{rangeLabel(range)}</p>
            <p className="text-xs text-slate-500">
              {showingAll ? 'Showing every order / عرض كل الطلبات' : 'Swipe or use ← → to change'}
            </p>
          </div>
          <IconButton
            label="Next / التالي"
            variant="secondary"
            icon={<ChevronRight />}
            disabled={showingAll || atLatest}
            onClick={() => step(1)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isToday(range) && (
            <Button variant="secondary" size="sm" icon={<CalendarDays />} onClick={() => { onModeChange('day'); onAnchorChange(todayString()); }}>
              Today / اليوم
            </Button>
          )}
          <Input
            type={range.mode === 'month' ? 'month' : 'date'}
            aria-label={range.mode === 'month' ? 'Pick a month / اختر الشهر' : 'Pick a date / اختر التاريخ'}
            className="w-auto"
            max={range.mode === 'month' ? todayString().slice(0, 7) : todayString()}
            disabled={showingAll}
            value={range.mode === 'month' ? range.anchor.slice(0, 7) : range.anchor}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              onAnchorChange(range.mode === 'month' ? `${value}-01` : value);
            }}
          />
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Date range mode">
            {MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={range.mode === mode.value}
                onClick={() => onModeChange(mode.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  range.mode === mode.value
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
