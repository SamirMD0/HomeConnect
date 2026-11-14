import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatBusinessDate } from '@shared/money-format';
import type { DateRange } from '@shared/lookup-contracts';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { SearchBar } from '../components/SearchBar';
import { Sheet } from '../components/Sheet';
import { ListRow } from '../components/ListRow';
import { validDateRange } from './filters';
import { readStyles } from './ReadUI';
export function RangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [error, setError] = useState('');
  return (
    <>
      <AppButton
        label={`${formatBusinessDate(value.from)} – ${formatBusinessDate(value.to)}`}
        variant="tonal"
        icon="calendar-outline"
        onPress={() => {
          setDraft(value);
          setError('');
          setOpen(true);
        }}
      />
      <Sheet title="Date range" visible={open} onClose={() => setOpen(false)}>
        <View style={{ padding: 16, gap: 12 }}>
          <AppInput
            label="From date"
            value={draft.from}
            onChangeText={(from) => setDraft({ ...draft, from })}
            placeholder="YYYY-MM-DD"
          />
          <AppInput
            label="To date"
            value={draft.to}
            onChangeText={(to) => setDraft({ ...draft, to })}
            placeholder="YYYY-MM-DD"
          />
          {error && (
            <Text accessibilityRole="alert" style={readStyles.subtitle}>
              {error}
            </Text>
          )}
          <AppButton
            label="Apply dates"
            onPress={() => {
              if (!validDateRange(draft)) {
                setError('Enter valid dates as YYYY-MM-DD, with the start before the end.');
                return;
              }
              onChange(draft);
              setOpen(false);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}
export function SelectFilter({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Button text when nothing is picked; default "Label: All". */
  emptyLabel?: string;
}) {
  const picked = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(''),
    [limit, setLimit] = useState(25);
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <AppButton
        label={picked ? `${label}: ${picked.label}` : (emptyLabel ?? `${label}: All`)}
        variant="tonal"
        icon="options-outline"
        onPress={() => {
          setSearch('');
          setLimit(25);
          setOpen(true);
        }}
      />
      <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
        <View style={{ padding: 16, gap: 12 }}>
          <SearchBar
            label={`Search ${label.toLowerCase()}`}
            value={search}
            onChangeText={(text) => {
              setSearch(text);
              setLimit(25);
            }}
          />
          {filtered.slice(0, limit).map((option) => (
            <ListRow
              key={option.value}
              title={`${option.value === value ? '✓ ' : ''}${option.label}`}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
          {!filtered.length && <Text style={readStyles.subtitle}>No matching options.</Text>}
          {limit < filtered.length && (
            <AppButton
              label="More options"
              variant="secondary"
              onPress={() => setLimit(limit + 25)}
            />
          )}
        </View>
      </Sheet>
    </>
  );
}
export function useDebouncedSearch(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
