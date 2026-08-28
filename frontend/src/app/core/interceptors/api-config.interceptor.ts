import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ConfigService } from '../config/config.service';

/**
 * Reescribe cada request relativa (ej. 'auth/login') a una URL absoluta
 * contra la `apiUrl` cargada en runtime por ConfigService — así ningún
 * servicio individual hardcodea la URL del backend. Requests ya absolutas
 * (http/https) pasan sin tocar, para no romper llamadas a otros orígenes.
 */
export const apiConfigInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//i.test(req.url)) {
    return next(req);
  }

  const configService = inject(ConfigService);
  const base = configService.apiUrl.replace(/\/$/, '');
  const path = req.url.replace(/^\//, '');

  return next(req.clone({ url: `${base}/${path}` }));
};
