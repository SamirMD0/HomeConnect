import { prisma } from '../../lib/prisma';

/**
 * Read-only view of the audit rows the thermal-template reconciliation
 * migration writes into `_thermal_template_reconcile_notes`. The table is
 * created by the forward migration
 * `20260928010000_reconcile_thermal_template_variants`; installations that
 * have not yet applied that migration return an empty list with a hint,
 * never an error, so the maintenance UI can call this without pre-checks.
 *
 * Read-only by design — the migration is the sole writer.
 */

export interface ThermalReconcileNote {
  id: number;
  runAt: string;
  outcome:
    | 'CONVERGED_FROM_VARIANT_A'
    | 'CONVERGED_FROM_VARIANT_B'
    | 'ALREADY_CURRENT'
    | 'SKIPPED_CUSTOMISED'
    | 'NO_ROW'
    | string;
  reason: string;
  diffFields: string[];
}

export interface ThermalReconcileNotesView {
  status: 'READY' | 'TABLE_ABSENT';
  hint: string;
  notes: ThermalReconcileNote[];
}

export class ThermalReconcileNotesService {
  static async list(): Promise<ThermalReconcileNotesView> {
    // Existence check first, so the call never throws on a fresh install.
    const [{ exists }] = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass('public."_thermal_template_reconcile_notes"') IS NOT NULL AS exists`
    );
    if (!exists) {
      return {
        status: 'TABLE_ABSENT',
        hint: 'The thermal-template reconciliation migration has not been applied on this database, so no audit rows exist yet.',
        notes: [],
      };
    }
    const rows = await prisma.$queryRawUnsafe<
      { id: bigint; runAt: Date; outcome: string; reason: string; diffFields: string[] }[]
    >(
      `SELECT id, "runAt", outcome, reason, "diffFields"
         FROM "_thermal_template_reconcile_notes"
         ORDER BY id DESC
         LIMIT 500`
    );
    return {
      status: 'READY',
      hint: rows.length === 0
        ? 'The reconciliation migration has been applied but wrote no audit rows on this database.'
        : `${rows.length} audit row(s) available; most recent first.`,
      notes: rows.map((row) => ({
        id: Number(row.id),
        runAt: row.runAt.toISOString(),
        outcome: row.outcome,
        reason: row.reason,
        diffFields: row.diffFields ?? [],
      })),
    };
  }
}
