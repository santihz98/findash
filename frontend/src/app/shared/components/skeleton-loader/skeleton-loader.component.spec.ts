import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { SkeletonLoaderComponent } from './skeleton-loader.component';

describe('SkeletonLoaderComponent', () => {
  it('renders 5 placeholder rows by default', () => {
    const fixture = TestBed.createComponent(SkeletonLoaderComponent);
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.skeleton-row')).length).toBe(5);
  });

  it('renders as many rows as the "rows" input says', () => {
    const fixture = TestBed.createComponent(SkeletonLoaderComponent);
    fixture.componentRef.setInput('rows', 3);
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.skeleton-row')).length).toBe(3);
  });
});
