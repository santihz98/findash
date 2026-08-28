import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { DashboardKpis } from '../../../state/dashboard/dashboard.model';
import { KpiCardsComponent } from './kpi-cards.component';

function create(kpis: DashboardKpis) {
  const fixture = TestBed.createComponent(KpiCardsComponent);
  fixture.componentRef.setInput('kpis', kpis);
  fixture.detectChanges();
  return fixture;
}

describe('KpiCardsComponent', () => {
  it('renders totalVolumeTransacted exactly as the backend formats it (no currency symbol added)', () => {
    const fixture = create({ totalVolumeTransacted: '434.00', failedOrRejectedCount: 48 });

    const value = fixture.debugElement.query(By.css('.kpi-card--primary .kpi-card__value'));
    expect(value.nativeElement.textContent.trim()).toBe('434.00');
  });

  it('renders failedOrRejectedCount as a plain number', () => {
    const fixture = create({ totalVolumeTransacted: '0.00', failedOrRejectedCount: 0 });

    const value = fixture.debugElement.query(By.css('.kpi-card--danger .kpi-card__value'));
    expect(value.nativeElement.textContent.trim()).toBe('0');
  });
});
