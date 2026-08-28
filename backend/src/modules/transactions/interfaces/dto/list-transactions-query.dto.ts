import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus } from '@prisma/client';
import { PaginationQueryDto } from './pagination-query.dto';

// GET /transactions (solo ADMIN, auditoría) — status y rango de fechas,
// combinables e independientes entre sí (RF-02, "auditar transacciones").
export class ListTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TransactionStatus,
    description: 'Filtra por estado de la transacción.',
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    description:
      'Límite inferior (inclusive) sobre createdAt, formato ISO 8601 (fecha o datetime). Si pasás solo la fecha (ej. "2026-08-01"), se interpreta como las 00:00:00 UTC de ese día.',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Límite superior (inclusive) sobre createdAt, formato ISO 8601. Si pasás solo la fecha, se interpreta como las 00:00:00 UTC de ese día (no el final del día) — para incluir el día completo, pasá el datetime de fin de día (ej. "2026-08-28T23:59:59.999Z").',
    example: '2026-08-28T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
