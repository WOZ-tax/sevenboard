import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KintoneApiService } from './kintone-api.service';
import { KintoneController } from './kintone.controller';

@Module({
  imports: [HttpModule],
  controllers: [KintoneController],
  providers: [KintoneApiService],
  exports: [KintoneApiService],
})
export class KintoneModule {}
