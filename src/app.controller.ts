import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class AppController {
  @Get()
  health() {
    return { status: 'success', data: { message: 'KeeTra backend running' } };
  }
}
