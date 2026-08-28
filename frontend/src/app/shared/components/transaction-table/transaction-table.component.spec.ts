import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { TransactionRow, TransactionTableComponent } from './transaction-table.component';

const sent: TransactionRow = {
  id: 'tx-1',
  originAccountId: 'acc-1111111-aaaa',
  destAccountId: 'acc-2222222-bbbb',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T15:30:00.000Z',
  direction: 'SENT',
};

const received: TransactionRow = {
  ...sent,
  id: 'tx-2',
  status: 'REJECTED',
  commission: null,
  authorizationCode: null,
  direction: 'RECEIVED',
};

function create(inputs: {
  transactions: TransactionRow[];
  page: number;
  totalPages: number;
  refetching?: boolean;
  showDirection?: boolean;
}) {
  const fixture = TestBed.createComponent(TransactionTableComponent);
  fixture.componentRef.setInput('transactions', inputs.transactions);
  fixture.componentRef.setInput('page', inputs.page);
  fixture.componentRef.setInput('totalPages', inputs.totalPages);
  if (inputs.refetching !== undefined) {
    fixture.componentRef.setInput('refetching', inputs.refetching);
  }
  if (inputs.showDirection !== undefined) {
    fixture.componentRef.setInput('showDirection', inputs.showDirection);
  }
  fixture.detectChanges();
  return fixture;
}

describe('TransactionTableComponent', () => {
  it('renders one row per transaction with the expected data', () => {
    const fixture = create({ transactions: [sent, received], page: 1, totalPages: 1 });

    const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain('100.00');
    expect(rows[0].nativeElement.textContent).toContain('2.00');
    expect(rows[0].nativeElement.textContent).toContain('ABC123');
  });

  it('renders zero rows for an empty array without throwing', () => {
    const fixture = create({ transactions: [], page: 1, totalPages: 0 });
    expect(fixture.debugElement.queryAll(By.css('tbody tr')).length).toBe(0);
  });

  it('shows null commission/authorizationCode as "—" (REJECTED/FAILED attempts)', () => {
    const fixture = create({ transactions: [received], page: 1, totalPages: 1 });
    const cells = fixture.debugElement.queryAll(By.css('tbody tr td'));
    const text = cells.map((c) => c.nativeElement.textContent.trim());
    expect(text).toContain('—');
  });

  describe('showDirection (CLIENT history vs. ADMIN audit)', () => {
    it('hides the "Dirección" column by default (ADMIN audit)', () => {
      const fixture = create({ transactions: [sent], page: 1, totalPages: 1 });
      expect(fixture.debugElement.query(By.css('.direction-badge'))).toBeFalsy();
      expect(fixture.nativeElement.textContent).not.toContain('Dirección');
    });

    it('shows a distinguishable badge (icon + label) per direction when showDirection is true', () => {
      const fixture = create({
        transactions: [sent, received],
        page: 1,
        totalPages: 1,
        showDirection: true,
      });

      const badges = fixture.debugElement.queryAll(By.css('.direction-badge'));
      expect(badges.length).toBe(2);
      expect(badges[0].nativeElement.classList).toContain('direction-badge--SENT');
      expect(badges[0].nativeElement.textContent).toContain('Enviada');
      expect(badges[0].nativeElement.textContent).toContain('↑');
      expect(badges[1].nativeElement.classList).toContain('direction-badge--RECEIVED');
      expect(badges[1].nativeElement.textContent).toContain('Recibida');
      expect(badges[1].nativeElement.textContent).toContain('↓');
    });
  });

  it('gives each status its own distinguishable badge class (verde/rojo/ámbar system)', () => {
    const failed: TransactionRow = { ...sent, id: 'tx-3', status: 'FAILED' };
    const fixture = create({ transactions: [sent, received, failed], page: 1, totalPages: 1 });

    const badges = fixture.debugElement.queryAll(By.css('.status-badge'));
    expect(badges[0].nativeElement.classList).toContain('status-badge--COMPLETED');
    expect(badges[0].nativeElement.textContent).toContain('Completada');
    expect(badges[1].nativeElement.classList).toContain('status-badge--REJECTED');
    expect(badges[1].nativeElement.textContent).toContain('Rechazada');
    expect(badges[2].nativeElement.classList).toContain('status-badge--FAILED');
    expect(badges[2].nativeElement.textContent).toContain('Fallida');
  });

  it('shows the current page / total pages', () => {
    const fixture = create({ transactions: [sent], page: 2, totalPages: 5 });
    expect(fixture.nativeElement.textContent).toContain('Página 2 de 5');
  });

  it('disables "Anterior" on the first page and "Siguiente" on the last page', () => {
    const fixture = create({ transactions: [sent], page: 1, totalPages: 1 });
    const buttons = fixture.debugElement.queryAll(By.css('.pagination button'));
    expect((buttons[0].nativeElement as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1].nativeElement as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits pageChange with page - 1 / page + 1 when the buttons are enabled', () => {
    const fixture = create({ transactions: [sent], page: 2, totalPages: 5 });
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

    const buttons = fixture.debugElement.queryAll(By.css('.pagination button'));
    (buttons[0].nativeElement as HTMLButtonElement).click();
    (buttons[1].nativeElement as HTMLButtonElement).click();

    expect(emitted).toEqual([1, 3]);
  });

  it('applies the "refetching" class when refetching is true', () => {
    const fixture = create({ transactions: [sent], page: 1, totalPages: 1, refetching: true });
    const table = fixture.debugElement.query(By.css('table')).nativeElement as HTMLElement;
    expect(table.classList.contains('refetching')).toBe(true);
  });
});
