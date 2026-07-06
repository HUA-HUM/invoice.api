import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '../controllers/app.controller';
import { XubioComprobantesController } from '../controllers/xubio-comprobantes.controller';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { AppService } from '../services/app.service';
import { XubioComprobantesBackfillQueueService } from '../services/xubio-comprobantes-backfill-queue.service';
import { XubioComprobantesBackfillService } from '../services/xubio-comprobantes-backfill.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, XubioComprobantesController],
  providers: [
    AppService,
    InternalApiKeyGuard,
    XubioComprobantesBackfillService,
    XubioComprobantesBackfillQueueService,
  ],
})
export class AppModule {}
