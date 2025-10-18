import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../database/entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async findAll(workspaceId: string, query: QueryCompaniesDto) {
    const {
      page = 1,
      limit = 20,
      search,
      industry,
      size,
      minEmployees,
      maxEmployees,
      country,
      state,
      city,
      tags,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;
    const queryBuilder = this.companyRepository
      .createQueryBuilder('company')
      .where('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.deletedAt IS NULL');

    if (search) {
      queryBuilder.andWhere(
        '(company.name ILIKE :search OR company.domain ILIKE :search OR company.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (industry) {
      queryBuilder.andWhere('company.industry = :industry', { industry });
    }

    if (size) {
      queryBuilder.andWhere('company.size = :size', { size });
    }

    if (minEmployees !== undefined) {
      queryBuilder.andWhere('company.employeeCount >= :minEmployees', { minEmployees });
    }

    if (maxEmployees !== undefined) {
      queryBuilder.andWhere('company.employeeCount <= :maxEmployees', { maxEmployees });
    }

    if (country) {
      queryBuilder.andWhere('company.country ILIKE :country', { country: `%${country}%` });
    }

    if (state) {
      queryBuilder.andWhere('company.state ILIKE :state', { state: `%${state}%` });
    }

    if (city) {
      queryBuilder.andWhere('company.city ILIKE :city', { city: `%${city}%` });
    }

    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      queryBuilder.andWhere('company.tags && :tags', { tags: tagArray });
    }

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'employeeCount'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`company.${sortField}`, sortOrder);

    queryBuilder.skip(skip).take(limit);

    const [companies, total] = await queryBuilder.getManyAndCount();

    this.logger.log(`Found ${companies.length} companies for workspace ${workspaceId}`);

    return {
      data: companies,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(workspaceId: string, id: string, relations: string[] = []) {
    const queryBuilder = this.companyRepository
      .createQueryBuilder('company')
      .where('company.id = :id', { id })
      .andWhere('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.deletedAt IS NULL');

    if (relations.includes('contacts')) {
      queryBuilder.leftJoinAndSelect('company.contacts', 'contacts');
    }

    if (relations.includes('deals')) {
      queryBuilder.leftJoinAndSelect('company.deals', 'deals');
    }

    const company = await queryBuilder.getOne();

    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    this.logger.log(`Retrieved company: ${id}`);
    return company;
  }

  async create(workspaceId: string, createCompanyDto: CreateCompanyDto) {
    const company = this.companyRepository.create({
      ...createCompanyDto,
      workspaceId,
    });

    const savedCompany = await this.companyRepository.save(company);
    this.logger.log(`Created company: ${savedCompany.id}`);

    return savedCompany;
  }

  async update(workspaceId: string, id: string, updateCompanyDto: UpdateCompanyDto) {
    const company = await this.findOne(workspaceId, id);

    Object.assign(company, updateCompanyDto);

    const updatedCompany = await this.companyRepository.save(company);
    this.logger.log(`Updated company: ${id}`);

    return this.findOne(workspaceId, id);
  }

  async remove(workspaceId: string, id: string) {
    const company = await this.findOne(workspaceId, id);

    company.deletedAt = new Date();
    await this.companyRepository.save(company);

    this.logger.log(`Soft deleted company: ${id}`);
  }

  async getStats(workspaceId: string) {
    const queryBuilder = this.companyRepository
      .createQueryBuilder('company')
      .where('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.deletedAt IS NULL');

    const total = await queryBuilder.getCount();

    const byIndustry = await this.companyRepository
      .createQueryBuilder('company')
      .select('company.industry', 'industry')
      .addSelect('COUNT(*)', 'count')
      .where('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.deletedAt IS NULL')
      .andWhere('company.industry IS NOT NULL')
      .groupBy('company.industry')
      .getRawMany();

    const bySize = await this.companyRepository
      .createQueryBuilder('company')
      .select('company.size', 'size')
      .addSelect('COUNT(*)', 'count')
      .where('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.deletedAt IS NULL')
      .andWhere('company.size IS NOT NULL')
      .groupBy('company.size')
      .getRawMany();

    const totalEmployees = await this.companyRepository
      .createQueryBuilder('company')
      .select('SUM(company.employeeCount)', 'total')
      .where('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.deletedAt IS NULL')
      .andWhere('company.employeeCount IS NOT NULL')
      .getRawOne();

    this.logger.log(`Generated company stats for workspace ${workspaceId}`);

    return {
      total,
      byIndustry: byIndustry.map(item => ({
        industry: item.industry,
        count: parseInt(item.count, 10),
      })),
      bySize: bySize.map(item => ({
        size: item.size,
        count: parseInt(item.count, 10),
      })),
      totalEmployees: totalEmployees?.total ? parseInt(totalEmployees.total, 10) : 0,
    };
  }

  async bulkDelete(workspaceId: string, ids: string[]) {
    const companies = await this.companyRepository.find({
      where: ids.map(id => ({ id, workspaceId, deletedAt: null as any })),
    });

    if (companies.length !== ids.length) {
      throw new NotFoundException('Some companies not found or already deleted');
    }

    const now = new Date();
    companies.forEach(company => {
      company.deletedAt = now;
    });

    await this.companyRepository.save(companies);

    this.logger.log(`Bulk deleted ${companies.length} companies`);

    return {
      deleted: companies.length,
      ids: companies.map(c => c.id),
    };
  }

  async getContacts(workspaceId: string, companyId: string) {
    const company = await this.findOne(workspaceId, companyId, ['contacts']);
    return company.contacts || [];
  }

  async getDeals(workspaceId: string, companyId: string) {
    const company = await this.findOne(workspaceId, companyId, ['deals']);
    return company.deals || [];
  }
}