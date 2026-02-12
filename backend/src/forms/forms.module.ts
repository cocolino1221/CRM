import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';
import { Form } from '../database/entities/form.entity';
import { FormSubmission } from '../database/entities/form-submission.entity';
import { Contact } from '../database/entities/contact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Form, FormSubmission, Contact]),
  ],
  controllers: [FormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
