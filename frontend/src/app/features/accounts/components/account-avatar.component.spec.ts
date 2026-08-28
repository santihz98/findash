import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AccountAvatarComponent } from './account-avatar.component';

describe('AccountAvatarComponent', () => {
  function create(avatarUrl: string | null) {
    const fixture = TestBed.createComponent(AccountAvatarComponent);
    fixture.componentRef.setInput('avatarUrl', avatarUrl);
    fixture.detectChanges();
    return fixture;
  }

  it('caso 1 — avatarUrl ausente (null): usa el placeholder directamente, sin depender del evento error de la imagen', () => {
    const fixture = create(null);
    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;

    expect(img.src).toContain('assets/avatar-placeholder.svg');
  });

  it('caso 2 — avatarUrl presente pero roto: carga la URL real primero, y solo cambia al placeholder cuando el <img> dispara "error"', () => {
    const fixture = create('https://broken.example/avatar.png');
    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;

    expect(img.src).toContain('broken.example');
    expect(img.src).not.toContain('avatar-placeholder.svg');

    img.dispatchEvent(new Event('error'));

    expect(img.src).toContain('assets/avatar-placeholder.svg');
  });

  it('usa el alt provisto', () => {
    const fixture = TestBed.createComponent(AccountAvatarComponent);
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.componentRef.setInput('alt', 'Avatar de basic@findash.dev');
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;
    expect(img.alt).toBe('Avatar de basic@findash.dev');
  });
});
