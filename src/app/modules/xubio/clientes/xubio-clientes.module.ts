import { Module } from '@nestjs/common';
import { XubioClientesController } from '../../../controllers/xubio-clientes.controller';
import { XubioClientesService } from '../../../services/xubio-clientes.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { createXubioClienteInteractorProvider } from './xubio-clientes.providers';

@Module({
  imports: [InternalAuthModule],
  controllers: [XubioClientesController],
  providers: [createXubioClienteInteractorProvider, XubioClientesService],
  exports: [XubioClientesService],
})
export class XubioClientesModule {}
