import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LookupAccountQueryDto {
  @ApiProperty({
    description: 'Número de cuenta legible (Account.accountNumber) a resolver.',
    example: '1000000003',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;
}
