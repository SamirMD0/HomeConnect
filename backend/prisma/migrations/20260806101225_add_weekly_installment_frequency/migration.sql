-- Add weekly installment schedules without changing existing monthly plans.
ALTER TYPE "InstallmentPlanFrequency" ADD VALUE IF NOT EXISTS 'WEEKLY';
