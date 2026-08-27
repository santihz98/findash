import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNTA2YjYyOS0y...',
    description: 'Refresh token emitido por POST /auth/login (válido 7 días por defecto).',
  })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
