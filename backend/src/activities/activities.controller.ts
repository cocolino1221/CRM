import { Controller, Get, Post, Body } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  async findAll() {
    return this.activitiesService.findAll();
  }

  @Post()
  async create(@Body() createActivityDto: any) {
    return this.activitiesService.create(createActivityDto);
  }
}