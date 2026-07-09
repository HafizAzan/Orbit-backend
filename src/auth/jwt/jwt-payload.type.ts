import { RegisterAs } from '../../enum/auth.enum';

export type JwtPayload = {
  sub: string;
  email: string;
  role: RegisterAs;
  isPlatformAdmin: boolean;
  organizationId: string | null;
  tokenVersion?: number;
  remember?: boolean;
};

export type RefreshTokenPayload = {
  sub: string;
  type: 'refresh';
  remember?: boolean;
  tokenVersion?: number;
};
