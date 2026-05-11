export interface AuthUser {
  id: string;
  email: string;
  /** Meeting-scoped JWT from join-as-guest; only valid for that meeting's routes. */
  isGuest?: boolean;
  guestMeetingId?: string;
}
