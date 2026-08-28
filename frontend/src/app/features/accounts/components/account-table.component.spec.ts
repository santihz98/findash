import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { Account } from '../../../state/accounts/accounts.model';
import { AccountTableComponent } from './account-table.component';

const accounts: Account[] = [
  {
    id: 'acc-1',
    accountNumber: '1000000001',
    balance: '979.60',
    accountType: 'BASIC',
    status: 'ACTIVE',
    avatarUrl: null,
    documentNumber: '1010000002',
    email: 'basic@findash.dev',
  },
  {
    id: 'acc-2',
    accountNumber: '1000000002',
    balance: '1020.00',
    accountType: 'PREMIUM',
    status: 'BLOCKED',
    avatarUrl: null,
    documentNumber: '1010000003',
    email: 'premium@findash.dev',
  },
];

function create(inputs: {
  accounts: Account[];
  page: number;
  totalPages: number;
  refetching?: boolean;
}) {
  const fixture = TestBed.createComponent(AccountTableComponent);
  fixture.componentRef.setInput('accounts', inputs.accounts);
  fixture.componentRef.setInput('page', inputs.page);
  fixture.componentRef.setInput('totalPages', inputs.totalPages);
  if (inputs.refetching !== undefined) {
    fixture.componentRef.setInput('refetching', inputs.refetching);
  }
  fixture.detectChanges();
  return fixture;
}

describe('AccountTableComponent', () => {
  it('renders one row per account with the expected data (dado un @Input() con datos)', () => {
    const fixture = create({ accounts, page: 1, totalPages: 1 });

    const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain('1000000001');
    expect(rows[0].nativeElement.textContent).toContain('basic@findash.dev');
    expect(rows[0].nativeElement.textContent).toContain('979.60');
    expect(rows[1].nativeElement.textContent).toContain('premium@findash.dev');
  });

  it('renders zero rows for an empty accounts array without throwing', () => {
    const fixture = create({ accounts: [], page: 1, totalPages: 0 });
    expect(fixture.debugElement.queryAll(By.css('tbody tr')).length).toBe(0);
  });

  it('shows the current page / total pages', () => {
    const fixture = create({ accounts, page: 2, totalPages: 5 });
    expect(fixture.nativeElement.textContent).toContain('Página 2 de 5');
  });

  it('disables "Anterior" on the first page and "Siguiente" on the last page', () => {
    const fixture = create({ accounts, page: 1, totalPages: 1 });
    const buttons = fixture.debugElement.queryAll(By.css('.pagination button'));
    expect((buttons[0].nativeElement as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1].nativeElement as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits pageChange with page - 1 / page + 1 when the buttons are enabled', () => {
    const fixture = create({ accounts, page: 2, totalPages: 5 });
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

    const buttons = fixture.debugElement.queryAll(By.css('.pagination button'));
    (buttons[0].nativeElement as HTMLButtonElement).click();
    (buttons[1].nativeElement as HTMLButtonElement).click();

    expect(emitted).toEqual([1, 3]);
  });

  it('applies the "refetching" class when refetching is true, for the stale-while-revalidate UX', () => {
    const fixture = create({ accounts, page: 1, totalPages: 1, refetching: true });
    const table = fixture.debugElement.query(By.css('table')).nativeElement as HTMLElement;
    expect(table.classList.contains('refetching')).toBe(true);
  });
});
