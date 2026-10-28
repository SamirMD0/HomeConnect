const fs=require('node:fs'); const {PrismaClient}=require('@prisma/client');
const env=require('dotenv').parse(fs.readFileSync('backend/.env'));const url=new URL(env.DATABASE_URL);
const base=decodeURIComponent(url.pathname.slice(1));const target='homeconnect_test_mb_phase3d_20261028_1012';
if(base!=='homeconnect_test_phase4_phase5_phase6'||!/^homeconnect_test_mb_/.test(target)||target==='homeconnect')throw Error('Unsafe database');
console.log('Confirmed base database: '+base+'; drop target: '+target+'; administrative connection: postgres');
url.pathname='/postgres';const client=new PrismaClient({datasources:{db:{url:url.toString()}}});
(async()=>{try{await client.$executeRawUnsafe('DROP DATABASE "'+target+'"');console.log('Dropped '+target);}finally{await client.$disconnect();}})().catch(()=>{console.error('Scratch cleanup failed');process.exitCode=1;});
