import { FormControl } from '@angular/forms';

import { positiveDecimalAmountValidator } from './positive-decimal-amount.validator';

function validate(value: string) {
  return positiveDecimalAmountValidator(new FormControl(value));
}

describe('positiveDecimalAmountValidator', () => {
  it('accepts a plain positive integer amount', () => {
    expect(validate('100')).toBeNull();
  });

  it('accepts up to 2 decimals', () => {
    expect(validate('100.5')).toBeNull();
    expect(validate('100.50')).toBeNull();
  });

  it('rejects zero (mismo criterio que @IsPositiveDecimalString del backend)', () => {
    expect(validate('0')).toEqual({ positiveDecimalAmount: true });
    expect(validate('0.00')).toEqual({ positiveDecimalAmount: true });
  });

  it('rejects negative amounts', () => {
    expect(validate('-10')).toEqual({ positiveDecimalAmount: true });
  });

  it('rejects more than 2 decimals', () => {
    expect(validate('10.123')).toEqual({ positiveDecimalAmount: true });
  });

  it('rejects non-numeric input', () => {
    expect(validate('abc')).toEqual({ positiveDecimalAmount: true });
    expect(validate('10,50')).toEqual({ positiveDecimalAmount: true });
  });

  it('leaves the empty value alone (Validators.required ya lo cubre)', () => {
    expect(validate('')).toBeNull();
  });

  it('ignores non-string control values defensively', () => {
    expect(positiveDecimalAmountValidator(new FormControl(null))).toBeNull();
  });
});
