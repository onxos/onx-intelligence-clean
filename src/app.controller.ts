import { Controller, Get, Redirect } from '@nestjs/common';

/**
 * The workspace UI is served under the `/w` basePath (see ServeStaticModule +
 * workspace-ui/next.config.ts). Visitors hitting the bare domain root would
 * otherwise get a JSON 404, so redirect them to the login page.
 */
@Controller()
export class AppController {
  @Get()
  @Redirect('/w/login/', 302)
  root() {
    return;
  }
}
