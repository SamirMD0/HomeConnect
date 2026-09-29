import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  
  // Clean existing data if needed, or check if admin exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  
  let admin = existingAdmin;
  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        fullName: 'System Administrator',
        role: Role.ADMIN,
      },
    });
    console.log(`Created admin user with id: ${admin.id}`);
  } else {
    console.log('Admin user already exists');
  }

  const standardRate = await prisma.taxRate.upsert({
    where: { code: 'LB_STANDARD' },
    create: {
      code: 'LB_STANDARD', name: 'Lebanon standard VAT', nameAr: 'ضريبة القيمة المضافة اللبنانية القياسية',
      ratePercent: '11.000', effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), createdById: admin.id,
    },
    update: { name: 'Lebanon standard VAT', nameAr: 'ضريبة القيمة المضافة اللبنانية القياسية', ratePercent: '11.000', isActive: true },
  });
  const zeroRate = await prisma.taxRate.upsert({
    where: { code: 'LB_ZERO' },
    create: {
      code: 'LB_ZERO', name: 'Lebanon zero-rated VAT', nameAr: 'ضريبة القيمة المضافة اللبنانية بنسبة صفر',
      ratePercent: '0.000', effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), createdById: admin.id,
    },
    update: { name: 'Lebanon zero-rated VAT', nameAr: 'ضريبة القيمة المضافة اللبنانية بنسبة صفر', ratePercent: '0.000', isActive: true },
  });
  await prisma.taxProfile.upsert({
    where: { code: 'LB_STANDARD' },
    create: { code: 'LB_STANDARD', name: 'Standard-rated', nameAr: 'خاضع للنسبة القياسية', taxRateId: standardRate.id, isDefault: true },
    update: { name: 'Standard-rated', nameAr: 'خاضع للنسبة القياسية', taxRateId: standardRate.id, isDefault: true, isActive: true },
  });
  await prisma.taxProfile.upsert({
    where: { code: 'LB_ZERO' },
    create: { code: 'LB_ZERO', name: 'Zero-rated', nameAr: 'خاضع لنسبة صفر', taxRateId: zeroRate.id },
    update: { name: 'Zero-rated', nameAr: 'خاضع لنسبة صفر', taxRateId: zeroRate.id, isDefault: false, isActive: true },
  });
  console.log('Seeded LB_STANDARD and LB_ZERO tax profiles');

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
