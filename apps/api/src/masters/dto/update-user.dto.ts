import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(['ADMIN', 'CFO', 'VIEWER', 'ADVISOR'])
  @IsOptional()
  role?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
