import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentWorkspace = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): any => {
    const request = ctx.switchToHttp().getRequest();
    const workspace = request.workspace || { id: request.user?.workspaceId };

    return data ? workspace?.[data] : workspace;
  },
);