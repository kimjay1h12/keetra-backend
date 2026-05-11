import { Injectable, PipeTransform } from '@nestjs/common';
import { MeetingsService } from './meetings.service';

/** Resolves public meeting code (9 chars) or legacy MongoDB id to internal meeting ObjectId string. */
@Injectable()
export class ResolveMeetingMongoIdPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly meetingsService: MeetingsService) {}

  transform(value: string): Promise<string> {
    return this.meetingsService.resolveToMongoId(value);
  }
}
