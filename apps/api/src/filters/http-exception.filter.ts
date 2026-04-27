import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string' ? res : (res as any).message || message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'データが重複しています';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'データが見つかりません';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          // 開発中は Prisma の詳細メッセージを返す（meta も含めて原因究明用）
          message = `Database error: ${exception.code} ${exception.message?.split('\n').slice(-3).join(' / ') ?? ''}`;
          // server log にも残す
          // eslint-disable-next-line no-console
          console.error('[Prisma error]', exception.code, exception.meta, exception.message);
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
