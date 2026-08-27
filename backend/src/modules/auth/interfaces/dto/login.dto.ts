import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'basic@findash.dev', description: 'Email del usuario registrado en FinDash.' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Demo1234!',
    description: 'Password en texto plano (se compara contra el hash con bcrypt, nunca se guarda así).',
  })
  @IsString()
  @MinLength(1)
  password!: string;
}
