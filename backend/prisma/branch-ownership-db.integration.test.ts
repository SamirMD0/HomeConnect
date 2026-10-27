import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Prisma,PrismaClient} from '@prisma/client';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {isIsolatedTestDatabase} from '../src/test/database';
import {insertMigrationRow,seedOwnershipHistory} from '../src/test/branch-migration-fixture';
import {MigrationExecutor} from '../src/features/maintenance/migration-executor';
import {MigrationRunner} from '../src/features/maintenance/migration-runner';

const enabled=process.env.RUN_FINANCIAL_DB_TESTS==='1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const migration=readFileSync('backend/prisma/migrations/20261027120000_add_branch_ownership/migration.sql','utf8');
const tables=['customers','suppliers','sales_orders','debts','installment_plans','payments','sales_returns','cash_refunds','customer_credits','supplier_transactions','supplier_receivings','service_jobs'];

describe.runIf(enabled)('ownership migration on an isolated pre-Phase-2 database',()=>{
 let admin:PrismaClient,db:PrismaClient,name:string;
 beforeAll(async()=>{
  const base=new URL(process.env.DATABASE_URL!);
  if(!isIsolatedTestDatabase(base.toString())||base.pathname==='/homeconnect') throw Error('Unsafe source');
  name='homeconnect_test_mb_'+randomUUID().replaceAll('-','');
  const adminUrl=new URL(base);adminUrl.pathname='/postgres';
  console.log('Confirmed provisioning target '+name+'; administrative connection postgres');
  admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}});
  await admin.$executeRawUnsafe('CREATE DATABASE "'+name+'"');
  base.pathname='/'+name;
  if(!isIsolatedTestDatabase(base.toString()))throw Error('Unsafe test target');
  console.log('Confirmed migration test database '+name);
  db=new PrismaClient({datasources:{db:{url:base.toString()}},transactionOptions:{timeout:120000}});
  const bundled=MigrationRunner.readBundled('backend/prisma/migrations').filter(m=>!m.name.includes('add_branch_ownership'));
  const outcomes=await MigrationExecutor.applyPending(db,bundled);
  const failed=outcomes.filter(o=>!o.applied);expect(failed).toEqual([]);
 },120000);
 afterAll(async()=>{await db?.$disconnect();if(admin&&name){console.log('Confirmed drop target '+name);await admin.$executeRawUnsafe('DROP DATABASE "'+name+'" WITH (FORCE)');}await admin?.$disconnect();});
 async function scenario(run:(tx:Prisma.TransactionClient)=>Promise<void>) {
  const rollback=new Error('test rollback');
  try {await db.$transaction(async tx=>{await run(tx);throw rollback;},{timeout:120000});} catch(e){if(e!==rollback)throw e;}
 }
 async function rows(tx:Prisma.TransactionClient) {
  const result:Record<string,unknown>={};
  for(const table of tables)result[table]=await tx.$queryRawUnsafe(`SELECT to_jsonb(t)-'branchId' AS data FROM "${table}" t ORDER BY id`);
  return result;
 }
 for(const existing of [false,true]) it(existing?'uses the one active branch and preserves every existing value':'creates MAIN and backfills USD/LBP history without changing a value',()=>scenario(async tx=>{
  const {userId}=await seedOwnershipHistory(tx);
  const branch=existing?await insertMigrationRow(tx,'branches',{code:'HISTORY',name:'History',createdById:userId}):undefined;
  const before=await rows(tx);await tx.$executeRawUnsafe(migration);expect(await rows(tx)).toEqual(before);
  const [main]=await tx.$queryRawUnsafe<Array<{id:string;code:string}>>('SELECT id,code FROM branches WHERE "isActive"');
  expect(main.code).toBe(existing?'HISTORY':'MAIN');if(branch)expect(main.id).toBe(branch);
  for(const table of tables){const [n]=await tx.$queryRawUnsafe<Array<{n:number}>>('SELECT count(*)::int n FROM "'+table+'" WHERE "branchId" IS DISTINCT FROM $1::uuid',main.id);expect(n.n).toBe(0);}
 }),120000);
 it('leaves a fresh installation empty for setup',()=>scenario(async tx=>{
  await tx.$executeRawUnsafe(migration);const [n]=await tx.$queryRawUnsafe<Array<{n:number}>>('SELECT count(*)::int n FROM branches');expect(n.n).toBe(0);
 }),120000);
 it('rejects two active branches atomically',()=>scenario(async tx=>{
  const {userId}=await seedOwnershipHistory(tx);
  for(const code of ['A','B'])await insertMigrationRow(tx,'branches',{code,name:code,createdById:userId});
  await tx.$executeRawUnsafe('SAVEPOINT before_ownership');
  await expect(tx.$executeRawUnsafe(migration)).rejects.toThrow(/Multiple active branches/);
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_ownership');
  const [n]=await tx.$queryRawUnsafe<Array<{n:number}>>("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='debts' AND column_name='branchId'");expect(n.n).toBe(0);
 }),120000);
 for(const table of ['users','customers','activity_logs'])it('rejects non-null legacy '+table+'.branchId atomically',()=>scenario(async tx=>{
  const {userId}=await seedOwnershipHistory(tx);
  if(table==='activity_logs')await insertMigrationRow(tx,table,{userId,entityId:userId,branchId:randomUUID()});
  else await tx.$executeRawUnsafe('UPDATE "'+table+'" SET "branchId"=$1::uuid',randomUUID());
  const before=await rows(tx);await tx.$executeRawUnsafe('SAVEPOINT before_ownership');
  await expect(tx.$executeRawUnsafe(migration)).rejects.toThrow(/non-null legacy/);
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_ownership');expect(await rows(tx)).toEqual(before);
 }),120000);
});
