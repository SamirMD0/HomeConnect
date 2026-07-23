require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function clean() {
  await prisma.user.deleteMany({});
  console.log('Database wiped!');
  process.exit(0);
}
clean();
