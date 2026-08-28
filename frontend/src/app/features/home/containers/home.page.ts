import { Component } from '@angular/core';

@Component({
  selector: 'app-home-page',
  template: `
    <main class="home-page">
      <span class="home-page__logo">F</span>
      <h1>FinDash — en construcción</h1>
      <a class="btn btn--primary" href="/login">Ir a Ingresar</a>
    </main>
  `,
  styles: `
    .home-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
      text-align: center;
      padding: var(--space-5);
      background: var(--color-bg);
    }

    .home-page__logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      border-radius: var(--radius-md);
      background: var(--color-primary);
      color: var(--color-primary-contrast);
      font-weight: 800;
      font-size: var(--fs-xl);
    }
  `,
})
export class HomePage {}
