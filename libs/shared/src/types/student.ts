export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum StudentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

/** Common Indian exam targets — purely informational; free-form on the API. */
export const EXAM_TARGETS = [
  'UPSC', 'SSC', 'Banking', 'RRB', 'NEET', 'JEE', 'CA', 'CAT',
  'GATE', 'State PSC', 'Other',
] as const;
export type ExamTarget = (typeof EXAM_TARGETS)[number] | (string & {});

export interface Student {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  fullName: string;
  email: string | null;
  phone: string;
  gender: Gender | null;
  dateOfBirth: string | null;

  aadhaarNumber: string | null;
  voterId: string | null;

  fatherName: string | null;
  motherName: string | null;
  emergencyContact: string | null;

  permanentAddress: string | null;
  temporaryAddress: string | null;

  examTarget: string | null;

  photoUrl: string | null;
  idProofUrl: string | null;
  aadhaarFrontUrl: string | null;
  aadhaarBackUrl: string | null;
  voterIdUrl: string | null;
  status: StudentStatus;

  joinedAt: string;
  expiresAt: string | null;

  qrCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStudentDto {
  branchId: string;
  fullName: string;
  email?: string;
  phone: string;
  gender?: Gender;
  dateOfBirth?: string;

  aadhaarNumber?: string;
  voterId?: string;

  fatherName?: string;
  motherName?: string;
  emergencyContact?: string;

  permanentAddress?: string;
  temporaryAddress?: string;

  examTarget?: string;

  photoUrl?: string;
  idProofUrl?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackUrl?: string;
  voterIdUrl?: string;

  expiresAt?: string;
}

export interface UpdateStudentDto extends Partial<CreateStudentDto> {
  status?: StudentStatus;
}
