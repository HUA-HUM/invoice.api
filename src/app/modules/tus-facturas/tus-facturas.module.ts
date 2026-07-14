import { Module } from '@nestjs/common';
import { TusFacturasController } from '../../controllers/tus-facturas.controller';
import { TusFacturasAfipInfoService } from '../../services/tus-facturas-afip-info.service';
import { InternalAuthModule } from '../shared/internal-auth/internal-auth.module';
import { getTusFacturasAfipInfoInteractorProvider } from './tus-facturas.providers';

@Module({
  imports: [InternalAuthModule],
  controllers: [TusFacturasController],
  providers: [
    getTusFacturasAfipInfoInteractorProvider,
    TusFacturasAfipInfoService,
  ],
  exports: [TusFacturasAfipInfoService],
})
export class TusFacturasModule {}
