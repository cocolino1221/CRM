import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Workspace isolation guard
 * Ensures users can only access resources within their workspace
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skipWorkspaceCheck = this.reflector.getAllAndOverride<boolean>('skipWorkspaceCheck', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipWorkspaceCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract workspace ID from request params, query, or body
    const workspaceId =
      request.params?.workspaceId ||
      request.query?.workspaceId ||
      request.body?.workspaceId;

    // If no workspace ID in request, allow (will be handled by service layer)
    if (!workspaceId) {
      return true;
    }

    // Check if user belongs to the requested workspace
    if (user.workspaceId !== workspaceId) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    return true;
  }
}