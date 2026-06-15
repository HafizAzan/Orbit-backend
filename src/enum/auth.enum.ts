export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
  GITHUB = 'github',
}

export enum SignupSource {
  DIRECT = 'direct',
  INVITE = 'invite',
}

export enum EmailVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
}

export enum AccountStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum RegisterAs {
  SUPER_ADMIN = 'super_admin', //platform_admin yani mai jis ne project banaya hai
  OWNER = 'owner', // jis ne org create kri hai
  ADMIN = 'admin', // org admin
  MANAGER = 'manager', // org manager
  MEMBER = 'member', // org member
}
