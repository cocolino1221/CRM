import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { User } from '../database/entities/user.entity';
import { Integration } from '../database/entities/integration.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

// Global so feature modules (integrations, users, payflow) can check plan limits.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Workspace, User, Integration])],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
