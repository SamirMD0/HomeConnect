import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  
  // Clean existing data if needed, or check if admin exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.create({
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
