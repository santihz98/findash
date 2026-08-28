import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Mismos valores/criterio que ListAccountsQueryDto (accounts/, Sesión 3):
// límite explícito con 400 si se excede, nunca un recorte silencioso.
// Constantes propias en vez de importar las de accounts/interfaces/dto —
// cruzar la capa `interfaces` de un módulo hacia la de otro para 3 números
// no vale el acoplamiento; esta clase base sí se reusa DENTRO de
// transactions/ (GET /transactions/me y GET /transactions, ver subclases).
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Número de página, empieza en 1.',
    default: DEFAULT_PAGE,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: `Filas por página. Máximo ${MAX_LIMIT} — valores mayores se rechazan con 400, no se recortan en silencio.`,
    default: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;
}
