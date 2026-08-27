import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsPositiveDecimalString } from './validators/is-positive-decimal-string.validator';

export class CreateTransferDto {
  @ApiProperty({
    example: '558944c9-2eaf-431d-b6e0-a3d9b59c2001',
    description:
      'id de la cuenta destino. La cuenta origen NUNCA se recibe acá — sale siempre de la cuenta del usuario autenticado (RN-04).',
  })
  @IsString()
  @IsNotEmpty()
  destAccountId!: string;

  @ApiProperty({
    example: '150.00',
    description:
      'Monto a transferir, como string decimal positivo con hasta 2 decimales (nunca number, para no perder precisión). La comisión se calcula aparte según el tipo de cuenta origen (RN-03) y se descuenta además de este monto.',
  })
  @IsPositiveDecimalString()
  amount!: string;
}
