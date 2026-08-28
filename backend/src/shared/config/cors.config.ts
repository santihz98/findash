import { ConfigService } from '@nestjs/config';

// CORS_ORIGIN es una lista separada por comas — permite tener localhost:4200
// (desarrollo) y la URL del bucket S3 del frontend (producción) habilitados
// a la vez, sin desplegar nada distinto entre entornos. `getOrThrow`, sin
// fallback: mismo criterio que JWT_SECRET/JWT_REFRESH_SECRET (TokenService)
// — la app no debe arrancar sirviendo con CORS mal configurado por defecto.
export function parseCorsOrigins(configService: ConfigService): string[] {
  return configService
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim());
}
