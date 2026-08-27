import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

// Valores por defecto y tope de `limit` (RF-03): un admin nunca necesita
// más de 100 filas por página en un listado paginado con UI; permitir un
// `limit` arbitrario (ej. 999999) sería, en la práctica, un endpoint sin
// paginación real — cualquiera podría pedir la tabla completa de una sola
// vez. ValidationPipe (global, ver main.ts) rechaza con 400 cualquier valor
// fuera de este rango, no lo recorta en silencio.
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class ListAccountsQueryDto {
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

  @ApiPropertyOptional({
    description:
      'Prefijo del documento de identidad del titular (User.documentNumber, no Account.accountNumber) — RF-03.',
    example: '1010000',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  documentNumber?: string;

  @ApiPropertyOptional({ enum: AccountStatus, description: 'Filtra por estado de la cuenta.', example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
}
