import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useThermalReconcileNotes } from '../hooks/useThermalReconcileNotes';
import { ThermalReconcileNotesPanel } from './ThermalReconcileNotesPanel';

vi.mock('../hooks/useThermalReconcileNotes', () => ({ useThermalReconcileNotes: vi.fn() }));

const mockedHook = vi.mocked(useThermalReconcileNotes);

describe('ThermalReconcileNotesPanel', () => {
  it('shows outcomes, reasons, dates, and changed fields', () => {
    mockedHook.mockReturnValue({
      data: { status: 'READY', hint: '2 audit rows', notes: [
        { id: 1, runAt: '2026-09-28T08:00:00.000Z', outcome: 'SKIPPED_CUSTOMISED', reason: 'Custom layout preserved', diffFields: ['config', 'description'] },
        { id: 2, runAt: '2026-09-28T09:00:00.000Z', outcome: 'CONVERGED_FROM_VARIANT_A', reason: 'Original seed converged', diffFields: [] },
      ] },
      isLoading: false, isError: false,
    } as unknown as ReturnType<typeof useThermalReconcileNotes>);
    const html = renderToStaticMarkup(<ThermalReconcileNotesPanel />);
    expect(html).toContain('READY');
    expect(html).toContain('SKIPPED_CUSTOMISED');
    expect(html).toContain('CONVERGED_FROM_VARIANT_A');
    expect(html).toContain('Custom layout preserved');
    expect(html).toContain('config, description');
    expect(html).toContain('2026-09-28T08:00:00.000Z');
  });

  it('explains when the migration table is absent', () => {
    mockedHook.mockReturnValue({
      data: { status: 'TABLE_ABSENT', hint: 'Migration not applied', notes: [] },
      isLoading: false, isError: false,
    } as unknown as ReturnType<typeof useThermalReconcileNotes>);
    const html = renderToStaticMarkup(<ThermalReconcileNotesPanel />);
    expect(html).toContain('TABLE_ABSENT');
    expect(html).toContain('Migration not applied');
    expect(html).not.toContain('<li');
  });
});
