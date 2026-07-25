import { AppError } from '../../../lib/errors';

export class InvalidMoneyError extends AppError {
  constructor(message = 'Invalid money amount') {
    super(message, 400, 'INVALID_MONEY');
  }
}

export class InvalidBusinessDateError extends AppError {
  constructor(message = 'Invalid business date') {
    super(message, 400, 'INVALID_BUSINESS_DATE');
  }
}

export class OverpaymentError extends AppError {
  constructor(message = 'Payment amount exceeds remaining balance') {
    super(message, 409, 'OVERPAYMENT');
  }
}

export class InvalidInstallmentCountError extends AppError {
  constructor(message = 'Invalid installment count') {
    super(message, 400, 'INVALID_INSTALLMENT_COUNT');
  }
}

export class InstallmentScheduleError extends AppError {
  constructor(message = 'Invalid installment schedule') {
    super(message, 400, 'INSTALLMENT_SCHEDULE_ERROR');
  }
}

export class FinancialRecordCancelledError extends AppError {
  constructor(message = 'Financial record is cancelled') {
    super(message, 409, 'FINANCIAL_RECORD_CANCELLED');
  }
}

export class FinancialRecordAlreadyPaidError extends AppError {
  constructor(message = 'Financial record is already paid') {
    super(message, 409, 'FINANCIAL_RECORD_ALREADY_PAID');
  }
}

export class PaymentIdempotencyConflictError extends AppError {
  constructor(message = 'Idempotency key was already used for a different request') {
    super(message, 409, 'PAYMENT_IDEMPOTENCY_CONFLICT');
  }
}

export class FinancialInvariantError extends AppError {
  constructor(message = 'Financial invariant failed') {
    super(message, 500, 'FINANCIAL_INVARIANT_ERROR');
  }
}
