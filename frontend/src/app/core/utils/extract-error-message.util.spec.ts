import { HttpErrorResponse } from '@angular/common/http';

import { extractErrorMessage } from './extract-error-message.util';

describe('extractErrorMessage', () => {
  it('returns the backend message tal cual for a domain error (ej. "Credenciales inválidas")', () => {
    const error = new HttpErrorResponse({
      status: 401,
      error: { message: 'Credenciales inválidas' },
    });
    expect(extractErrorMessage(error, 'fallback')).toBe('Credenciales inválidas');
  });

  it('joins an array of validation messages (class-validator) into a single string', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { message: ['email must be an email', 'password should not be empty'] },
    });
    expect(extractErrorMessage(error, 'fallback')).toBe(
      'email must be an email, password should not be empty',
    );
  });

  it('falls back when the error body has no message field (ej. backend caído, sin JSON)', () => {
    const error = new HttpErrorResponse({ status: 0, error: null });
    expect(extractErrorMessage(error, 'No se pudo conectar con el servidor')).toBe(
      'No se pudo conectar con el servidor',
    );
  });

  it('falls back when message is neither a string nor an array', () => {
    const error = new HttpErrorResponse({ status: 500, error: { message: 42 } });
    expect(extractErrorMessage(error, 'fallback')).toBe('fallback');
  });
});
