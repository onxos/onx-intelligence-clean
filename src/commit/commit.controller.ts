import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { execSync } from 'child_process';

@ApiTags('Commit')
@Controller('commit')
export class CommitController {
  @Get()
  @ApiOperation({ summary: 'Get build commit metadata' })
  getCommit() {
    const commit =
      process.env.ONX_DEPLOY_COMMIT ||
      process.env.SOURCE_VERSION ||
      process.env.RENDER_GIT_COMMIT ||
      process.env.GIT_COMMIT ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      this.safeGitCommit();

    return {
      commit,
      nodeEnv: process.env.NODE_ENV || 'development',
    };
  }

  private safeGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}
