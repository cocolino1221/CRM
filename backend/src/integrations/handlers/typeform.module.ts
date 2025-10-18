import { Module } from '@nestjs/common';
import { TypeformIntegrationHandler } from './typeform.handler';

@Module({
  providers: [TypeformIntegrationHandler],
  exports: [TypeformIntegrationHandler],
})
export class TypeformModule {}
