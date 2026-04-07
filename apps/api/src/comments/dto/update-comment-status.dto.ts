import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class UpdateCommentStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVED', 'MODIFIED', 'REJECTED'])
  status: 'APPROVED' | 'MODIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  rejectReason?: string;
}
