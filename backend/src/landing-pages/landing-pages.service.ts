import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import {
  LandingPage,
  LandingPageStatus,
  LandingPageCaptureType,
} from '../database/entities/landing-page.entity';
import { ContactSource } from '../database/entities/contact.entity';
import { FormsService } from '../forms/forms.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { SubmitLandingPageDto } from './dto/submit-landing-page.dto';

export interface LandingPageSubmitResult {
  success: boolean;
  successMessage?: string;
  redirectUrl?: string;
}

@Injectable()
export class LandingPagesService {
  private readonly logger = new Logger(LandingPagesService.name);

  constructor(
    @InjectRepository(LandingPage)
    private readonly landingPageRepository: Repository<LandingPage>,
    private readonly formsService: FormsService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    dto: CreateLandingPageDto,
  ): Promise<LandingPage> {
    const slug = dto.slug
      ? await this.assertSlugFree(dto.slug)
      : await this.generateUniqueSlug(dto.name);

    const page = this.landingPageRepository.create({
      ...dto,
      slug,
      workspaceId,
      createdById: userId,
      viewCount: 0,
      uniqueViewCount: 0,
      submissionCount: 0,
    });

    if (dto.status === LandingPageStatus.ACTIVE) {
      page.publishedAt = new Date();
    }

    return this.landingPageRepository.save(page);
  }

  async findAll(workspaceId: string, status?: LandingPageStatus): Promise<LandingPage[]> {
    const query = this.landingPageRepository
      .createQueryBuilder('lp')
      .where('lp.workspaceId = :workspaceId', { workspaceId });

    if (status) {
      query.andWhere('lp.status = :status', { status });
    }

    return query.orderBy('lp.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, workspaceId: string): Promise<LandingPage> {
    const page = await this.landingPageRepository.findOne({
      where: { id, workspaceId },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }
    return page;
  }

  async update(
    id: string,
    workspaceId: string,
    dto: UpdateLandingPageDto,
  ): Promise<LandingPage> {
    const page = await this.findOne(id, workspaceId);

    if (dto.slug && dto.slug !== page.slug) {
      await this.assertSlugFree(dto.slug);
    }

    const becomingActive =
      dto.status === LandingPageStatus.ACTIVE && !page.publishedAt;

    Object.assign(page, dto);

    if (becomingActive) {
      page.publishedAt = new Date();
    }

    return this.landingPageRepository.save(page);
  }

  async remove(id: string, workspaceId: string): Promise<void> {
    const page = await this.findOne(id, workspaceId);
    await this.landingPageRepository.remove(page);
  }

  async duplicate(id: string, workspaceId: string, userId: string): Promise<LandingPage> {
    const orig = await this.findOne(id, workspaceId);
    const slug = await this.generateUniqueSlug(`${orig.slug}-copy`);

    const copy = this.landingPageRepository.create({
      name: `${orig.name} (copy)`,
      slug,
      status: LandingPageStatus.DRAFT,
      content: orig.content,
      captureType: orig.captureType,
      formId: orig.formId,
      typeformConfig: orig.typeformConfig,
      postSubmit: orig.postSubmit,
      seo: orig.seo,
      experimentId: orig.experimentId,
      variantGroup: orig.variantGroup,
      viewCount: 0,
      uniqueViewCount: 0,
      submissionCount: 0,
      lastSubmittedAt: null,
      publishedAt: null,
      workspaceId,
      createdById: userId,
    });

    return this.landingPageRepository.save(copy);
  }

  async findPublicBySlug(
    slug: string,
    opts: { countUnique: boolean; skipView?: boolean },
  ): Promise<LandingPage> {
    const page = await this.landingPageRepository.findOne({
      where: { slug, status: LandingPageStatus.ACTIVE },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    if (!opts.skipView) {
      const updates: Partial<LandingPage> = { viewCount: page.viewCount + 1 };
      if (opts.countUnique) {
        updates.uniqueViewCount = page.uniqueViewCount + 1;
      }
      await this.landingPageRepository.update(page.id, updates);
    }

    return page;
  }

  async getPublicView(
    slug: string,
    opts: { countUnique: boolean; skipView?: boolean },
  ): Promise<{
    page: LandingPage;
    form: { id: string; name: string; fields: any; settings: any } | null;
  }> {
    const page = await this.findPublicBySlug(slug, opts);
    let form: { id: string; name: string; fields: any; settings: any } | null = null;
    if (page.captureType === LandingPageCaptureType.NATIVE && page.formId) {
      const f = await this.formsService.findFormById(page.formId, page.workspaceId);
      if (f) {
        form = { id: f.id, name: f.name, fields: f.fields, settings: f.settings };
      }
    }
    return { page, form };
  }

  async submitPublic(
    slug: string,
    dto: SubmitLandingPageDto,
    metadata: { ipAddress?: string; userAgent?: string; referrer?: string },
  ): Promise<LandingPageSubmitResult> {
    const page = await this.landingPageRepository.findOne({
      where: { slug, status: LandingPageStatus.ACTIVE },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    if (page.captureType !== LandingPageCaptureType.NATIVE) {
      throw new BadRequestException('This landing page does not accept native submissions');
    }
    if (!page.formId) {
      throw new BadRequestException('No form configured for this landing page');
    }

    const form = await this.formsService.findFormById(page.formId, page.workspaceId);
    if (!form) {
      throw new BadRequestException('The form for this landing page is unavailable');
    }

    const trackingData = {
      ...(dto.trackingData || {}),
      landingPageId: page.id,
      ...(page.experimentId ? { experimentId: page.experimentId } : {}),
      ...(page.variantGroup ? { variantGroup: page.variantGroup } : {}),
    };

    const { submission, contact } = await this.formsService.createSubmissionForForm(
      form,
      dto.data,
      { ...metadata, trackingData },
      ContactSource.LANDING_PAGE,
    );

    await this.landingPageRepository.update(page.id, {
      submissionCount: page.submissionCount + 1,
      lastSubmittedAt: new Date(),
    });

    await this.maybeSendWhatsAppWelcome(page, form, submission, contact);

    return {
      success: true,
      successMessage: page.postSubmit?.successMessage,
      redirectUrl: page.postSubmit?.redirectUrl,
    };
  }

  private async maybeSendWhatsAppWelcome(
    page: LandingPage,
    form: any,
    submission: any,
    contact: any,
  ): Promise<void> {
    try {
      if (!page.postSubmit?.whatsapp?.enabled || !page.postSubmit.whatsapp.message) {
        return;
      }
      const phoneField = form.fields?.find((f: any) => f.type === 'phone');
      const phone = phoneField ? submission.data?.[phoneField.id] : undefined;
      if (!phone) {
        return;
      }

      const name = contact?.firstName || '';
      const message = page.postSubmit.whatsapp.message.replace(/\{\{\s*name\s*\}\}/g, name);

      await this.whatsappService.sendMessageForWorkspace(page.workspaceId, {
        to: String(phone),
        type: 'text',
        content: message,
      });
    } catch (error: any) {
      this.logger.error(
        `WhatsApp welcome for landing page ${page.id} failed (submit still succeeded): ${error?.message}`,
      );
    }
  }

  private async assertSlugFree(slug: string): Promise<string> {
    const existing = await this.landingPageRepository.findOne({ where: { slug } });
    if (existing) {
      throw new BadRequestException('A landing page with this slug already exists');
    }
    return slug;
  }

  private async generateUniqueSlug(source: string): Promise<string> {
    const base = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${base}-${nanoid(6)}`;
  }
}
