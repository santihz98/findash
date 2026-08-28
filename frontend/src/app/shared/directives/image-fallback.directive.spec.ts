import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ImageFallbackDirective } from './image-fallback.directive';

@Component({
  selector: 'app-test-host',
  imports: [ImageFallbackDirective],
  template: `<img src="https://broken.example/avatar.png" appImageFallback alt="test" />`,
})
class TestHostComponent {}

describe('ImageFallbackDirective', () => {
  it('replaces the src with the placeholder when the image fails to load', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;
    expect(img.src).toContain('broken.example');

    img.dispatchEvent(new Event('error'));

    expect(img.src).toContain('assets/avatar-placeholder.svg');
  });
});
