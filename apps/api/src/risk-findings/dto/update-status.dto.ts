import { IsIn } from 'class-validator';
import { FindingStatus } from '@prisma/client';

export class UpdateRiskFindingStatusDto {
  @IsIn([
    FindingStatus.OPEN,
    FindingStatus.CONFIRMED,
    FindingStatus.DISMISSED,
    FindingStatus.RESOLVED,
  ])
  status!: FindingStatus;
}
