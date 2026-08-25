import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard but NEVER throws on missing/invalid auth. Uses the same
 * 'jwt' strategy (cookie / Authorization header / ?token=) to populate
 * req.user when a valid session exists, and sets req.user = null otherwise so
 * the route handler can decide what to do (e.g. redirect a browser to login
 * instead of returning a 401). Used by the MCP OAuth authorize endpoint, which
 * is entered as a top-level browser navigation with no Authorization header.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    return user || null;
  }
}
