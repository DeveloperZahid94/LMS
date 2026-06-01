export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  BRANCH_ADMIN = 'BRANCH_ADMIN',
  STAFF = 'STAFF',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 4,
  [UserRole.CLIENT_ADMIN]: 3,
  [UserRole.BRANCH_ADMIN]: 2,
  [UserRole.STAFF]: 1,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}
