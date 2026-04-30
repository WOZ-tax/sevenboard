import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class AddAdvisorsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}
