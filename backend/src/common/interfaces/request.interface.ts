import { Request } from 'express';
import { User, Profile } from '@prisma/client';

export interface AuthenticatedUser extends User {
  profile: Profile | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
