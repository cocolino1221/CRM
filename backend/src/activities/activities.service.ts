import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivitiesService {
  async findAll() {
    return { message: 'Get all activities', data: [] };
  }

  async create(createActivityDto: any) {
    return { message: 'Create activity', data: createActivityDto };
  }
}