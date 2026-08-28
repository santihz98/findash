import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AccountFilters, AccountFiltersComponent } from './account-filters.component';

function create() {
  const fixture = TestBed.createComponent(AccountFiltersComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AccountFiltersComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not emit on every keystroke — waits for the debounce (no un request por cada tecla)', () => {
    const fixture = create();
    const emitted: AccountFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    const input = fixture.debugElement.query(By.css('input')).nativeElement as HTMLInputElement;
    for (const char of '1010000') {
      input.value += char;
      input.dispatchEvent(new Event('input'));
    }

    expect(emitted).toEqual([]);

    vi.advanceTimersByTime(400);

    expect(emitted).toEqual([{ documentNumber: '1010000', status: '' }]);
  });

  it('emits status changes immediately (no debounce) merged with the current documentNumber', () => {
    const fixture = create();
    const emitted: AccountFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    const select = fixture.debugElement.query(By.css('select')).nativeElement as HTMLSelectElement;
    select.value = 'ACTIVE';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([{ documentNumber: '', status: 'ACTIVE' }]);
  });

  it('syncs incoming documentNumber/status inputs into the form without re-emitting filtersChange (no feedback loop)', () => {
    const fixture = create();
    const emitted: AccountFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));

    fixture.componentRef.setInput('documentNumber', '1010000002');
    fixture.componentRef.setInput('status', 'BLOCKED');
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input')).nativeElement as HTMLInputElement;
    const select = fixture.debugElement.query(By.css('select')).nativeElement as HTMLSelectElement;
    expect(input.value).toBe('1010000002');
    expect(select.value).toBe('BLOCKED');
    expect(emitted).toEqual([]);
  });
});
