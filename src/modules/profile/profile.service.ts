import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { toPublicUser } from '../../common/user-public';
import { ProfileUpdateInput, UsersService } from '../users/users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const AVATAR_MIME = /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/;

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '';
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  private uploadRoot(): string {
    return this.configService.get<string>('UPLOAD_ROOT', join(process.cwd(), 'uploads'));
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    return toPublicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const input: ProfileUpdateInput = {
      accountType: dto.accountType,
      displayName: dto.displayName,
      companyName: dto.companyName,
      companySize: dto.companySize as ProfileUpdateInput['companySize'],
      phone: dto.phone,
      avatarUrl: dto.avatarUrl,
      title: dto.title,
      bio: dto.bio,
    };
    const user = await this.usersService.updateProfile(userId, input);
    return toPublicUser(user);
  }

  /**
   * Persists a multer-saved temp file under uploads/profile/{userId}/ and sets user.avatarUrl.
   */
  async uploadAvatar(
    userId: string,
    file: Express.Multer.File | undefined,
    requestPublicOrigin: string,
  ) {
    if (!file?.path) {
      throw new BadRequestException('No file uploaded');
    }
    if (!AVATAR_MIME.test(file.mimetype)) {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('Only JPEG, PNG, WebP, or GIF images are allowed');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('Image too large (max 4 MB)');
    }

    const ext = extForMime(file.mimetype);
    if (!ext) {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('Unsupported image type');
    }

    const destDir = join(this.uploadRoot(), 'profile', userId);
    mkdirSync(destDir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    const destPath = join(destDir, filename);
    try {
      renameSync(file.path, destPath);
    } catch {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('Could not store file');
    }

    if (existsSync(destDir)) {
      for (const name of readdirSync(destDir)) {
        if (name === filename) continue;
        try {
          unlinkSync(join(destDir, name));
        } catch {
          /* ignore */
        }
      }
    }

    const configured = this.configService.get<string>('APP_PUBLIC_URL')?.trim().replace(/\/+$/, '');
    const origin = (configured || requestPublicOrigin).replace(/\/+$/, '');
    const avatarUrl = `${origin}/uploads/profile/${userId}/${filename}`;
    const user = await this.usersService.setAvatarUrl(userId, avatarUrl);
    return toPublicUser(user);
  }
}
