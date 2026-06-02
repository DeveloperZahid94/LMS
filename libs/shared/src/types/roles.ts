export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  BRANCH_ADMIN = 'BRANCH_ADMIN',
  STAFF = 'STAFF',
  STUDENT = 'STUDENT',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 4,
  [UserRole.CLIENT_ADMIN]: 3,
  [UserRole.BRANCH_ADMIN]: 2,
  [UserRole.STAFF]: 1,
  [UserRole.STUDENT]: 0,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}
