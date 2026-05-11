import { UserDocument } from '../modules/users/schemas/user.schema';

export type PublicUser = {
  id: string;
  email: string;
  isActive: boolean;
  accountType: 'individual' | 'company' | null;
  displayName: string | null;
  /** Optional phone for `tel:` dial-out on clients; never required for auth. */
  phone: string | null;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  companyName: string | null;
  companySize: string | null;
  profileCompleted: boolean;
};

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id,
    email: user.email,
    isActive: user.isActive,
    accountType: user.accountType ?? null,
    displayName: user.displayName ?? null,
    phone: user.phone?.trim() ? user.phone.trim() : null,
    avatarUrl: user.avatarUrl?.trim() ? user.avatarUrl.trim() : null,
    title: user.title?.trim() ? user.title.trim() : null,
    bio: user.bio?.trim() ? user.bio.trim() : null,
    companyName: user.companyName ?? null,
    companySize: user.companySize ?? null,
    profileCompleted: user.profileCompleted ?? false,
  };
}
