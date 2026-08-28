import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';

import { authActions } from '../../state/auth/auth.actions';
import { selectError, selectLoading } from '../../state/auth/auth.reducer';

/**
 * Container (RNF-03): el único componente de features/auth/ que despacha
 * `login()` — no inyecta HttpClient, no llama a AuthService directo. Solo
 * lee/escribe el Store.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  template: `
    <main class="login-page">
      <div class="login-card">
        <div class="login-card__brand">
          <span class="login-card__logo">F</span>
          <h1>FinDash</h1>
        </div>
        <p class="login-card__subtitle">Ingresá con tu cuenta para continuar.</p>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <label class="field">
            Email
            <input
              type="email"
              formControlName="email"
              autocomplete="username"
              placeholder="nombre@findash.dev"
            />
          </label>

          <label class="field">
            Password
            <input type="password" formControlName="password" autocomplete="current-password" />
          </label>

          @if (error()) {
            <p class="login-error error-banner" role="alert">{{ error() }}</p>
          }

          <button
            type="submit"
            class="btn btn--primary"
            [class.btn--loading]="loading()"
            [disabled]="form.invalid || loading()"
          >
            {{ loading() ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>
      </div>
    </main>
  `,
  styles: `
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-5);
      background:
        radial-gradient(circle at 15% 15%, var(--color-primary-soft), transparent 45%),
        var(--color-bg);
    }

    .login-card {
      width: 100%;
      max-width: 22rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .login-card__brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .login-card__logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-md);
      background: var(--color-primary);
      color: var(--color-primary-contrast);
      font-weight: 800;
      font-size: var(--fs-lg);
    }

    .login-card__subtitle {
      color: var(--color-ink-muted);
      font-size: var(--fs-sm);
      margin-bottom: var(--space-4);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .login-error {
      margin: 0;
    }

    button[type='submit'] {
      margin-top: var(--space-2);
      width: 100%;
    }
  `,
})
export class LoginPage {
  private readonly store = inject(Store);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = this.store.selectSignal(selectLoading);
  readonly error = this.store.selectSignal(selectError);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.store.dispatch(authActions.login({ email, password }));
  }
}
