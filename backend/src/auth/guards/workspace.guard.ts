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
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

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

    // Ensure user has a workspaceId (required for workspace isolation)
    if (!user.workspaceId) {
      throw new ForbiddenException('User has no workspace assigned');
    }

    // Extract workspace ID from request params, query, or body
    const requestWorkspaceId =
      request.params?.workspaceId ||
      request.query?.workspaceId ||
      request.body?.workspaceId;

    // If workspace ID is provided in request, verify it matches user's workspace
    if (requestWorkspaceId) {
      if (user.workspaceId !== requestWorkspaceId) {
        throw new ForbiddenException('Access denied to this workspace');
      }
    }

    // Enforce workspace isolation: Attach user's workspace ID to request for service layer
    // This ensures all operations are scoped to the authenticated user's workspace
    request.workspaceId = user.workspaceId;

    return true;
  }
}