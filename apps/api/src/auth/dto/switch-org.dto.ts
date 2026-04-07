import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class SwitchOrgDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  orgId: string;
}
