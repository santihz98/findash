import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { TransactionAuditFilters, TransactionAuditFiltersComponent } from './transaction-audit-filters.component';

function create() {
  const fixture = TestBed.createComponent(TransactionAuditFiltersComponent);
  fixture.detectChanges();
  return fixture;
}

describe('TransactionAuditFiltersComponent', () => {
  it('emits immediately (no debounce) when the status select changes', () => {
    const fixture = create();
    const emitted: TransactionAuditFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    const select = fixture.debugElement.query(By.css('select')).nativeElement as HTMLSelectElement;
    select.value = 'REJECTED';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([{ status: 'REJECTED', dateFrom: '', dateTo: '' }]);
  });

  it('emits immediately when dateFrom changes, merged with the current status/dateTo', () => {
    const fixture = create();
    const emitted: TransactionAuditFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    const [dateFromInput] = fixture.debugElement.queryAll(By.css('input[type=date]'));
    (dateFromInput.nativeElement as HTMLInputElement).value = '2026-08-01';
    dateFromInput.nativeElement.dispatchEvent(new Event('input'));

    expect(emitted).toEqual([{ status: '', dateFrom: '2026-08-01', dateTo: '' }]);
  });

  it('emits immediately when dateTo changes', () => {
    const fixture = create();
    const emitted: TransactionAuditFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    const [, dateToInput] = fixture.debugElement.queryAll(By.css('input[type=date]'));
    (dateToInput.nativeElement as HTMLInputElement).value = '2026-08-28';
    dateToInput.nativeElement.dispatchEvent(new Event('input'));

    expect(emitted).toEqual([{ status: '', dateFrom: '', dateTo: '2026-08-28' }]);
  });

  it('syncs incoming status/dateFrom/dateTo inputs into the form without re-emitting filtersChange (no feedback loop)', () => {
    const fixture = create();
    const emitted: TransactionAuditFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentRef.setInput('status', 'FAILED');
    fixture.componentRef.setInput('dateFrom', '2026-08-01');
    fixture.componentRef.setInput('dateTo', '2026-08-28');
    fixture.detectChanges();

    const select = fixture.debugElement.query(By.css('select')).nativeElement as HTMLSelectElement;
    const [dateFromInput, dateToInput] = fixture.debugElement.queryAll(By.css('input[type=date]'));
    expect(select.value).toBe('FAILED');
    expect((dateFromInput.nativeElement as HTMLInputElement).value).toBe('2026-08-01');
    expect((dateToInput.nativeElement as HTMLInputElement).value).toBe('2026-08-28');
    expect(emitted).toEqual([]);
  });
});
