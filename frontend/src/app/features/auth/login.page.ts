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
      <h1>FinDash</h1>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="username" />
        </label>

        <label>
          Password
          <input type="password" formControlName="password" autocomplete="current-password" />
        </label>

        @if (error()) {
          <p class="login-error" role="alert">{{ error() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || loading()">
          {{ loading() ? 'Ingresando…' : 'Ingresar' }}
        </button>
      </form>
    </main>
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
