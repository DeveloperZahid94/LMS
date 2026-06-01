import { PrismaClient, UserRole, FeatureKey, SeatType, Shift } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding LMS platform…');

  const platformAdminPassword = await bcrypt.hash('SuperAdmin@123', 10);
  await prisma.platformAdmin.upsert({
    where: { email: 'superadmin@lms.local' },
    update: {},
    create: {
      email: 'superadmin@lms.local',
      passwordHash: platformAdminPassword,
      fullName: 'Platform Super Admin',
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-library' },
    update: {},
    create: {
      name: 'Demo Library',
      slug: 'demo-library',
      email: 'admin@demo-library.local',
      phone: '+919999999999',
      plan: 'growth',
    },
  });

  for (const key of Object.values(FeatureKey)) {
    await prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: { enabled: true },
      create: { tenantId: tenant.id, key, enabled: true },
    });
  }

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Headquarters',
      code: 'HQ',
      city: 'Bengaluru',
      state: 'KA',
    },
  });

  const adminPassword = await bcrypt.hash('Admin@123', 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo-library.local' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@demo-library.local',
      passwordHash: adminPassword,
      fullName: 'Demo Client Admin',
      role: UserRole.CLIENT_ADMIN,
    },
  });

  for (let i = 1; i <= 20; i++) {
    const code = `A-${String(i).padStart(2, '0')}`;
    await prisma.seat.upsert({
      where: { tenantId_branchId_code: { tenantId: tenant.id, branchId: branch.id, code } },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        code,
        type: i <= 5 ? SeatType.CABIN : SeatType.SEAT,
        floor: '1',
        amenities: ['AC', 'wifi'],
      },
    });
  }

  await prisma.studentPlan.upsert({
    where: { id: `${tenant.id}-monthly` },
    update: {},
    create: {
      id: `${tenant.id}-monthly`,
      tenantId: tenant.id,
      name: 'Monthly Full Day',
      price: 1500,
      durationDays: 30,
      shift: Shift.FULL_DAY,
    },
  });

  console.log('Seed complete:');
  console.log('  SuperAdmin → superadmin@lms.local / SuperAdmin@123');
  console.log('  ClientAdmin → admin@demo-library.local / Admin@123 (tenant: demo-library)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
