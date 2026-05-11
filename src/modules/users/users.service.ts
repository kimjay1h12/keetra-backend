import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountType,
  CompanySizeBand,
  User,
  UserDocument,
} from './schemas/user.schema';

export type ProfileUpdateInput = {
  accountType: AccountType;
  displayName: string;
  companyName?: string;
  companySize?: CompanySizeBand;
  phone?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  bio?: string | null;
};

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  static computeProfileCompleted(u: {
    accountType?: AccountType;
    displayName?: string;
    companyName?: string;
    companySize?: CompanySizeBand;
  }): boolean {
    const nameOk = Boolean(u.displayName && u.displayName.trim().length >= 2);
    if (!nameOk || !u.accountType) return false;
    if (u.accountType === 'company') {
      return Boolean(
        u.companyName &&
          u.companyName.trim().length >= 2 &&
          u.companySize,
      );
    }
    return true;
  }

  async create(email: string, passwordHash: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email: normalizedEmail });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    return this.userModel.create({
      email: normalizedEmail,
      passwordHash,
      profileCompleted: false,
    });
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase().trim() });
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }

  /** Minimal user rows for task assignees, mentions, etc. */
  async findPublicRowsByIds(ids: string[]) {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return [];
    const rows = await this.userModel
      .find({ _id: { $in: uniq.map((id) => new Types.ObjectId(id)) } })
      .select('email displayName')
      .lean()
      .exec();
    return rows.map((r) => ({
      _id: (r as { _id: Types.ObjectId })._id.toString(),
      email: (r as { email?: string }).email,
      displayName: (r as { displayName?: string }).displayName,
    }));
  }

  async setAvatarUrl(userId: string, avatarUrl: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.avatarUrl = avatarUrl.trim();
    await user.save();
    return user;
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.accountType = input.accountType;
    user.displayName = input.displayName.trim();
    if (input.phone !== undefined) {
      const p = input.phone?.trim();
      user.phone = p || undefined;
    }
    if (input.avatarUrl !== undefined) {
      const a = input.avatarUrl?.trim();
      user.avatarUrl = a || undefined;
    }
    if (input.title !== undefined) {
      const t = input.title?.trim();
      user.title = t || undefined;
    }
    if (input.bio !== undefined) {
      const b = input.bio?.trim();
      user.bio = b ? b.slice(0, 500) : undefined;
    }
    if (input.accountType === 'company') {
      user.companyName = input.companyName?.trim();
      user.companySize = input.companySize;
    } else {
      user.companyName = undefined;
      user.companySize = undefined;
    }
    user.profileCompleted = UsersService.computeProfileCompleted(user);
    await user.save();
    return user;
  }

  async updatePasswordHash(userId: string, passwordHash: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.passwordHash = passwordHash;
    await user.save();
    return user;
  }
}
