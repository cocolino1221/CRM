import { Controller, Post, Body, Headers } from '@nestjs/common';
import { SlackService } from './slack.service';

@Controller('slack')
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

  @Post('events')
  async handleEvents(@Body() body: any, @Headers() headers: any) {
    return this.slackService.handleEvent(body, headers);
  }

  @Post('commands')
  async handleCommands(@Body() body: any, @Headers() headers: any) {
    return this.slackService.handleCommand(body, headers);
  }

  @Post('interactive')
  async handleInteractive(@Body() body: any, @Headers() headers: any) {
    return this.slackService.handleInteractive(body, headers);
  }

  @Post('oauth')
  async handleOAuth(@Body() body: any) {
    return this.slackService.handleOAuth(body);
  }
}