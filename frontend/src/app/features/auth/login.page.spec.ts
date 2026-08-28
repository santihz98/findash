import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { authActions } from '../../state/auth/auth.actions';
import { initialAuthState } from '../../state/auth/auth.model';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let store: MockStore;

  function createFixture() {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideMockStore({ initialState: { auth: initialAuthState } })],
    });
    store = TestBed.inject(Store) as MockStore;
  });

  it('does not dispatch login() when the form is submitted invalid (empty fields)', () => {
    const fixture = createFixture();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', undefined);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches login() with the entered email/password on a valid submit', () => {
    const fixture = createFixture();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const emailInput = fixture.debugElement.query(By.css('input[type=email]'))
      .nativeElement as HTMLInputElement;
    const passwordInput = fixture.debugElement.query(By.css('input[type=password]'))
      .nativeElement as HTMLInputElement;

    emailInput.value = 'basic@findash.dev';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'Demo1234!';
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', undefined);

    expect(dispatchSpy).toHaveBeenCalledWith(
      authActions.login({ email: 'basic@findash.dev', password: 'Demo1234!' }),
    );
  });

  it('disables the submit button and shows a loading label while loading$ is true', () => {
    store.setState({ auth: { ...initialAuthState, loading: true } });
    const fixture = createFixture();

    const button = fixture.debugElement.query(By.css('button')).nativeElement as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Ingresando');
  });

  it('shows the backend error message tal cual when present in state', () => {
    store.setState({ auth: { ...initialAuthState, error: 'Credenciales inválidas' } });
    const fixture = createFixture();

    const errorEl = fixture.debugElement.query(By.css('.login-error'));
    expect(errorEl.nativeElement.textContent).toContain('Credenciales inválidas');
  });

  it('renders no error element when there is no error', () => {
    const fixture = createFixture();
    const errorEl = fixture.debugElement.query(By.css('.login-error'));
    expect(errorEl).toBeNull();
  });
});
