import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { LoansService } from './loans.service';
import { CreateLoanDto, UpdateLoanDto, ReplaceScheduleDto } from './dto/loan.dto';

/** multer が渡すファイル形状（@types/multer 非導入のため最小限で定義） */
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// FileInterceptor の上限は service の厳密チェック(10MB)より少し緩め、
// 10〜12MB は service 側でクリーンな 400 を返す。真に巨大なものだけ multer が弾く。
const MULTER_LIMIT_BYTES = 12 * 1024 * 1024;

@Controller('organizations/:orgId/loans')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LoansController {
  constructor(private service: LoansService) {}

  @Get()
  @RequirePermission('org:loans:read')
  async list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.list(orgId);
  }

  @Post('extract')
  @RequirePermission('org:loans:manage')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTER_LIMIT_BYTES } }),
  )
  async extract(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Request() req: { user?: { id: string } },
    @UploadedFile() file: UploadedPdf,
  ) {
    return this.service.extract(orgId, req.user?.id, file);
  }

  @Get(':loanId')
  @RequirePermission('org:loans:read')
  async get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.service.get(orgId, loanId);
  }

  @Get(':loanId/documents/:docId/download')
  @RequirePermission('org:loans:read')
  async download(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.service.getDocumentDownloadUrl(orgId, loanId, docId);
  }

  @Post()
  @RequirePermission('org:loans:manage')
  async create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Request() req: { user?: { id: string } },
    @Body() dto: CreateLoanDto,
  ) {
    return this.service.create(orgId, req.user?.id, dto);
  }

  @Put(':loanId')
  @RequirePermission('org:loans:manage')
  async update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Request() req: { user?: { id: string } },
    @Body() dto: UpdateLoanDto,
  ) {
    return this.service.update(orgId, req.user?.id, loanId, dto);
  }

  @Put(':loanId/schedule')
  @RequirePermission('org:loans:manage')
  async replaceSchedule(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: ReplaceScheduleDto,
  ) {
    return this.service.replaceSchedule(orgId, loanId, dto.entries);
  }

  @Delete(':loanId')
  @RequirePermission('org:loans:manage')
  async remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.service.remove(orgId, loanId);
  }
}
