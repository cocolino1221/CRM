import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Workflow, WorkflowExecution, WorkflowStatus, WorkflowTriggerType, WorkflowActionType } from '../database/entities/workflow.entity';
import { ContactsService } from '../contacts/contacts.service';
import { EmailService } from '../email/email.service';
import { TasksService } from '../tasks/tasks.service';
import { DealsService } from '../deals/deals.service';
import { TaskPriority, TaskStatus } from '../database/entities/task.entity';
import { DealStage, DealPriority } from '../database/entities/deal.entity';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
    private readonly eventEmitter: EventEmitter2,
    private readonly contactsService: ContactsService,
    private readonly emailService: EmailService,
    private readonly tasksService: TasksService,
    private readonly dealsService: DealsService,
  ) {
    // Listen for events that can trigger workflows
    this.setupEventListeners();
  }

  async create(workspaceId: string, userId: string, data: Partial<Workflow>): Promise<Workflow> {
    const workflow = this.workflowRepository.create({
      ...data,
      workspaceId,
      createdBy: userId,
      status: WorkflowStatus.DRAFT,
      executionCount: 0,
    });

    const saved = await this.workflowRepository.save(workflow);
    this.logger.log(`Workflow created: ${saved.id} - ${saved.name}`);

    return saved;
  }

  async findAll(workspaceId: string, filters?: {
    status?: WorkflowStatus;
    triggerType?: WorkflowTriggerType;
  }): Promise<Workflow[]> {
    const query = this.workflowRepository.createQueryBuilder('workflow')
      .where('workflow.workspaceId = :workspaceId', { workspaceId })
      .leftJoinAndSelect('workflow.creator', 'creator');

    if (filters?.status) {
      query.andWhere('workflow.status = :status', { status: filters.status });
    }

    if (filters?.triggerType) {
      query.andWhere('workflow.triggerType = :triggerType', { triggerType: filters.triggerType });
    }

    return query
      .orderBy('workflow.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, workspaceId: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { id, workspaceId },
      relations: ['creator', 'executions'],
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  async update(id: string, workspaceId: string, data: Partial<Workflow>): Promise<Workflow> {
    const workflow = await this.findOne(id, workspaceId);

    Object.assign(workflow, data);

    const updated = await this.workflowRepository.save(workflow);
    this.logger.log(`Workflow updated: ${updated.id} - ${updated.name}`);

    return updated;
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    const workflow = await this.findOne(id, workspaceId);
    await this.workflowRepository.remove(workflow);
    this.logger.log(`Workflow deleted: ${id}`);
  }

  async activate(id: string, workspaceId: string): Promise<Workflow> {
    return this.update(id, workspaceId, { status: WorkflowStatus.ACTIVE });
  }

  async pause(id: string, workspaceId: string): Promise<Workflow> {
    return this.update(id, workspaceId, { status: WorkflowStatus.PAUSED });
  }

  async execute(workflowId: string, triggerData: any): Promise<WorkflowExecution> {
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.status !== WorkflowStatus.ACTIVE) {
      this.logger.warn(`Workflow ${workflowId} is not active, skipping execution`);
      return;
    }

    const startTime = Date.now();
    const execution = this.executionRepository.create({
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId,
      triggerData,
      status: 'success',
      startedAt: new Date(),
      results: [],
      errors: [],
    });

    try {
      // Execute each action
      for (const action of workflow.actions) {
        try {
          // Check condition if exists
          if (action.condition && !this.evaluateCondition(action.condition, triggerData)) {
            this.logger.log(`Action ${action.id} condition not met, skipping`);
            continue;
          }

          const result = await this.executeAction(action, triggerData, workflow.workspaceId);
          execution.results.push({ actionId: action.id, result });
        } catch (error) {
          this.logger.error(`Action ${action.id} failed: ${error.message}`);
          execution.errors.push({ actionId: action.id, error: error.message });
          execution.status = 'partial';
        }
      }

      // Update workflow stats
      workflow.executionCount += 1;
      workflow.lastExecutedAt = new Date();
      await this.workflowRepository.save(workflow);

    } catch (error) {
      this.logger.error(`Workflow ${workflowId} execution failed: ${error.message}`);
      execution.status = 'failed';
      execution.errors.push({ error: error.message });

      // Mark workflow as error
      workflow.status = WorkflowStatus.ERROR;
      workflow.lastError = { message: error.message, timestamp: new Date() };
      await this.workflowRepository.save(workflow);
    }

    execution.completedAt = new Date();
    execution.durationMs = Date.now() - startTime;

    return this.executionRepository.save(execution);
  }

  private async executeAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
    this.logger.log(`Executing action: ${action.type}`);

    switch (action.type) {
      case WorkflowActionType.SEND_EMAIL:
        return this.executeEmailAction(action, triggerData);

      case WorkflowActionType.CREATE_TASK:
        return this.executeCreateTaskAction(action, triggerData, workspaceId);

      case WorkflowActionType.CREATE_DEAL:
        return this.executeCreateDealAction(action, triggerData, workspaceId);

      case WorkflowActionType.UPDATE_DEAL_STAGE:
        return this.executeUpdateDealStageAction(action, triggerData, workspaceId);

      case WorkflowActionType.UPDATE_CONTACT:
        return this.executeUpdateContactAction(action, triggerData, workspaceId);

      case WorkflowActionType.ADD_TAG:
        return this.executeAddTagAction(action, triggerData, workspaceId);

      case WorkflowActionType.SEND_WEBHOOK:
        return this.executeSendWebhookAction(action, triggerData);

      case WorkflowActionType.WAIT:
        return this.executeWaitAction(action);

      default:
        this.logger.warn(`Unknown action type: ${action.type}`);
        return { success: false, message: 'Unknown action type' };
    }
  }

  private async executeEmailAction(action: any, triggerData: any): Promise<any> {
    const { to, subject, body } = action.config;

    // Replace variables in template
    const processedSubject = this.replaceVariables(subject, triggerData);
    const processedBody = this.replaceVariables(body, triggerData);

    await this.emailService.sendEmail({
      to: to || triggerData.email,
      subject: processedSubject,
      html: processedBody,
    });

    return { success: true, to: to || triggerData.email };
  }

  private async executeCreateTaskAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
    const { title, description, priority, dueDate, assigneeId, contactId, dealId } = action.config;

    // Replace variables in title and description
    const processedTitle = this.replaceVariables(title || 'Workflow Task', triggerData);
    const processedDescription = this.replaceVariables(description || '', triggerData);

    // Get the creator ID from trigger data or use a system user
    const creatorId = triggerData.userId || triggerData.createdBy || assigneeId;

    if (!creatorId) {
      throw new Error('Cannot create task: no user ID available');
    }

    // Create the task
    const task = await this.tasksService.create(workspaceId, creatorId, {
      title: processedTitle,
      description: processedDescription,
      priority: priority || TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assigneeId: assigneeId || creatorId,
      contactId: contactId || triggerData.contactId || triggerData.contact?.id,
      dealId: dealId || triggerData.dealId || triggerData.deal?.id,
    });

    this.logger.log(`Task created via workflow: ${task.id} - ${task.title}`);

    return { success: true, taskId: task.id, title: task.title };
  }

  private async executeCreateDealAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
    const { title, value, currency, stage, priority, contactId, companyId, ownerId, expectedCloseDate } = action.config;

    // Replace variables in title
    const processedTitle = this.replaceVariables(title || 'Workflow Deal', triggerData);

    // Create the deal
    const deal = await this.dealsService.create(workspaceId, {
      title: processedTitle,
      value: value || 0,
      currency: currency || 'USD',
      stage: stage || DealStage.QUALIFIED,
      priority: priority || DealPriority.MEDIUM,
      contactId: contactId || triggerData.contactId || triggerData.contact?.id,
      companyId: companyId || triggerData.companyId || triggerData.company?.id,
      ownerId: ownerId || triggerData.userId || triggerData.ownerId,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
    });

    this.logger.log(`Deal created via workflow: ${deal.id} - ${deal.title}`);

    return { success: true, dealId: deal.id, title: deal.title, value: deal.value };
  }

  private async executeUpdateDealStageAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
    const { dealId, stage } = action.config || {};
    const resolvedDealId =
      dealId ||
      triggerData.dealId ||
      triggerData.deal?.id;

    if (!resolvedDealId) {
      throw new Error('Cannot update deal stage: no deal ID available');
    }

    if (!stage) {
      throw new Error('Cannot update deal stage: stage is required');
    }

    const updatedDeal = await this.dealsService.updateStage(workspaceId, resolvedDealId, stage);
    this.logger.log(`Deal updated via workflow: ${updatedDeal.id} -> ${updatedDeal.stage}`);

    return {
      success: true,
      dealId: updatedDeal.id,
      stage: updatedDeal.stage,
    };
  }

  private async executeUpdateContactAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
    const { contactId, updates } = action.config;
    const id = contactId || triggerData.contactId;

    await this.contactsService.update(workspaceId, id, updates);
    return { success: true, contactId: id };
  }

  private async executeAddTagAction(action: any, triggerData: any, workspaceId: string): Promise<any> {
    const { contactId, tags } = action.config;
    const id = contactId || triggerData.contactId;

    // Would add tags using ContactsService
    return { success: true, contactId: id, tags };
  }

  private async executeSendWebhookAction(action: any, triggerData: any): Promise<any> {
    const { url, method, headers, body } = action.config;

    const response = await fetch(url, {
      method: method || 'POST',
      headers: headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || triggerData),
    });

    return { success: response.ok, status: response.status };
  }

  private async executeWaitAction(action: any): Promise<any> {
    const { duration } = action.config; // duration in seconds
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    return { success: true, waited: duration };
  }

  private evaluateCondition(condition: any, data: any): boolean {
    const { field, operator, value } = condition;
    const fieldValue = this.getNestedValue(data, field);

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return String(fieldValue).includes(String(value));
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      default:
        return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private replaceVariables(template: string, data: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.getNestedValue(data, key) || match;
    });
  }

  private setupEventListeners(): void {
    // Listen for contact created event
    this.eventEmitter.on('contact.created', async (data) => {
      await this.triggerWorkflows(WorkflowTriggerType.CONTACT_CREATED, data);
    });

    // Listen for deal won event
    this.eventEmitter.on('deal.won', async (data) => {
      await this.triggerWorkflows(WorkflowTriggerType.DEAL_WON, data);
    });

    // Listen for payment received event
    this.eventEmitter.on('payment.received', async (data) => {
      await this.triggerWorkflows(WorkflowTriggerType.PAYMENT_RECEIVED, data);
    });

    // Add more event listeners as needed
  }

  private async triggerWorkflows(triggerType: WorkflowTriggerType, data: any): Promise<void> {
    const workflows = await this.workflowRepository.find({
      where: {
        triggerType,
        status: WorkflowStatus.ACTIVE,
        workspaceId: data.workspaceId,
      },
    });

    this.logger.log(`Found ${workflows.length} workflows for trigger ${triggerType}`);

    for (const workflow of workflows) {
      try {
        await this.execute(workflow.id, data);
      } catch (error) {
        this.logger.error(`Failed to execute workflow ${workflow.id}: ${error.message}`);
      }
    }
  }

  async getExecutions(workflowId: string, workspaceId: string, limit = 50): Promise<WorkflowExecution[]> {
    const workflow = await this.findOne(workflowId, workspaceId);

    return this.executionRepository.find({
      where: { workflowId: workflow.id },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getStats(workspaceId: string): Promise<any> {
    const total = await this.workflowRepository.count({ where: { workspaceId } });
    const active = await this.workflowRepository.count({
      where: { workspaceId, status: WorkflowStatus.ACTIVE }
    });
    const paused = await this.workflowRepository.count({
      where: { workspaceId, status: WorkflowStatus.PAUSED }
    });
    const draft = await this.workflowRepository.count({
      where: { workspaceId, status: WorkflowStatus.DRAFT }
    });

    const totalExecutions = await this.executionRepository
      .createQueryBuilder('execution')
      .innerJoin('execution.workflow', 'workflow')
      .where('workflow.workspaceId = :workspaceId', { workspaceId })
      .getCount();

    return {
      total,
      active,
      paused,
      draft,
      totalExecutions,
    };
  }
}
