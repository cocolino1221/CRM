import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Form, FormStatus } from '../database/entities/form.entity';
import { FormSubmission, SubmissionStatus } from '../database/entities/form-submission.entity';
import { Contact, ContactSource } from '../database/entities/contact.entity';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';
import { nanoid } from 'nanoid';

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  constructor(
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    @InjectRepository(FormSubmission)
    private submissionRepository: Repository<FormSubmission>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
  ) {}

  async create(userId: string, workspaceId: string, createFormDto: CreateFormDto): Promise<Form> {
    const slug = createFormDto.slug || this.generateSlug(createFormDto.name);

    // Check if slug already exists
    const existingForm = await this.formRepository.findOne({ where: { slug } });
    if (existingForm) {
      throw new BadRequestException('A form with this slug already exists');
    }

    const form = this.formRepository.create({
      ...createFormDto,
      slug,
      workspaceId,
      createdById: userId,
      submissionCount: 0,
      viewCount: 0,
    });

    return await this.formRepository.save(form);
  }

  async findAll(workspaceId: string, status?: FormStatus): Promise<Form[]> {
    const query = this.formRepository
      .createQueryBuilder('form')
      .leftJoinAndSelect('form.createdBy', 'createdBy')
      .where('form.workspaceId = :workspaceId', { workspaceId });

    if (status) {
      query.andWhere('form.status = :status', { status });
    }

    return await query
      .orderBy('form.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, workspaceId: string): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { id, workspaceId },
      relations: ['createdBy', 'submissions'],
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    return form;
  }

  async findBySlug(slug: string): Promise<Form> {
    const form = await this.formRepository.findOne({
      where: { slug, status: FormStatus.ACTIVE },
    });

    if (!form) {
      throw new NotFoundException('Form not found or inactive');
    }

    // Increment view count
    await this.formRepository.update(form.id, {
      viewCount: form.viewCount + 1,
    });

    return form;
  }

  async update(id: string, workspaceId: string, updateFormDto: UpdateFormDto): Promise<Form> {
    const form = await this.findOne(id, workspaceId);

    // If slug is being updated, check for conflicts
    if (updateFormDto.slug && updateFormDto.slug !== form.slug) {
      const existingForm = await this.formRepository.findOne({
        where: { slug: updateFormDto.slug },
      });
      if (existingForm) {
        throw new BadRequestException('A form with this slug already exists');
      }
    }

    Object.assign(form, updateFormDto);
    return await this.formRepository.save(form);
  }

  async remove(id: string, workspaceId: string): Promise<void> {
    const form = await this.findOne(id, workspaceId);
    await this.formRepository.remove(form);
  }

  async submitForm(
    slug: string,
    submitFormDto: SubmitFormDto,
    metadata?: { ipAddress?: string; userAgent?: string; referrer?: string },
  ): Promise<FormSubmission> {
    const form = await this.findBySlug(slug);

    // Check if authentication is required
    if (form.settings?.requireAuthentication) {
      throw new BadRequestException('Authentication required for this form');
    }

    // Check if multiple submissions are allowed
    if (!form.settings?.allowMultipleSubmissions && metadata?.ipAddress) {
      const existingSubmission = await this.submissionRepository.findOne({
        where: {
          formId: form.id,
          ipAddress: metadata.ipAddress,
        },
      });

      if (existingSubmission) {
        throw new BadRequestException('You have already submitted this form');
      }
    }

    // Validate required fields
    this.validateSubmission(form, submitFormDto.data);

    // Create submission
    const submission = this.submissionRepository.create({
      formId: form.id,
      data: submitFormDto.data,
      status: SubmissionStatus.NEW,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      referrer: metadata?.referrer,
      trackingData: submitFormDto.trackingData,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    // Update form stats
    await this.formRepository.update(form.id, {
      submissionCount: form.submissionCount + 1,
      lastSubmittedAt: new Date(),
    });

    // Try to create or link contact if email is provided
    await this.processSubmissionContact(form, savedSubmission);

    this.logger.log(`Form submission received for form: ${form.name}`);

    return savedSubmission;
  }

  async getSubmissions(
    formId: string,
    workspaceId: string,
    status?: SubmissionStatus,
  ): Promise<FormSubmission[]> {
    const form = await this.findOne(formId, workspaceId);

    const query = this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoinAndSelect('submission.contact', 'contact')
      .where('submission.formId = :formId', { formId: form.id });

    if (status) {
      query.andWhere('submission.status = :status', { status });
    }

    return await query
      .orderBy('submission.createdAt', 'DESC')
      .getMany();
  }

  async updateSubmissionStatus(
    submissionId: string,
    workspaceId: string,
    status: SubmissionStatus,
    notes?: string,
  ): Promise<FormSubmission> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['form'],
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Verify workspace access
    const form = await this.findOne(submission.formId, workspaceId);

    submission.status = status;
    submission.reviewedAt = new Date();
    if (notes) {
      submission.notes = notes;
    }

    return await this.submissionRepository.save(submission);
  }

  async getFormAnalytics(formId: string, workspaceId: string): Promise<any> {
    const form = await this.findOne(formId, workspaceId);

    const submissions = await this.submissionRepository.find({
      where: { formId: form.id },
    });

    const statusCounts = submissions.reduce((acc, sub) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1;
      return acc;
    }, {} as Record<SubmissionStatus, number>);

    return {
      totalSubmissions: form.submissionCount,
      totalViews: form.viewCount,
      conversionRate: form.conversionRate,
      statusBreakdown: statusCounts,
      lastSubmittedAt: form.lastSubmittedAt,
    };
  }

  private validateSubmission(form: Form, data: Record<string, any>): void {
    for (const field of form.fields) {
      if (field.required && !data[field.id]) {
        throw new BadRequestException(`Field "${field.label}" is required`);
      }

      // Additional validation based on field type
      if (data[field.id]) {
        switch (field.type) {
          case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data[field.id])) {
              throw new BadRequestException(`Invalid email format for "${field.label}"`);
            }
            break;
          case 'phone':
            const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
            if (!phoneRegex.test(data[field.id])) {
              throw new BadRequestException(`Invalid phone format for "${field.label}"`);
            }
            break;
        }

        // Custom validation
        if (field.validation) {
          if (field.validation.pattern) {
            const regex = new RegExp(field.validation.pattern);
            if (!regex.test(data[field.id])) {
              throw new BadRequestException(
                field.validation.message || `Invalid format for "${field.label}"`,
              );
            }
          }
        }
      }
    }
  }

  private async processSubmissionContact(
    form: Form,
    submission: FormSubmission,
  ): Promise<void> {
    try {
      const emailField = form.fields.find((f) => f.type === 'email');
      if (!emailField || !submission.data[emailField.id]) {
        return;
      }

      const email = submission.data[emailField.id];

      // Look for name fields
      const firstNameField = form.fields.find((f) =>
        f.label.toLowerCase().includes('first') && f.label.toLowerCase().includes('name')
      );
      const lastNameField = form.fields.find((f) =>
        f.label.toLowerCase().includes('last') && f.label.toLowerCase().includes('name')
      );
      const phoneField = form.fields.find((f) => f.type === 'phone');

      // Check if contact exists
      let contact = await this.contactRepository.findOne({
        where: { email, workspaceId: form.workspaceId },
      });

      if (!contact) {
        // Create new contact
        contact = this.contactRepository.create({
          email,
          firstName: firstNameField ? submission.data[firstNameField.id] : 'Form',
          lastName: lastNameField ? submission.data[lastNameField.id] : 'Lead',
          phone: phoneField ? submission.data[phoneField.id] : undefined,
          source: ContactSource.WEBSITE,
          workspaceId: form.workspaceId,
          ownerId: form.createdById,
          notes: `Submitted form: ${form.name}`,
        });

        contact = await this.contactRepository.save(contact);
      }

      // Link submission to contact
      submission.contactId = contact.id;
      await this.submissionRepository.save(submission);
    } catch (error) {
      this.logger.error(`Failed to process submission contact: ${error.message}`);
    }
  }

  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${baseSlug}-${nanoid(6)}`;
  }
}
