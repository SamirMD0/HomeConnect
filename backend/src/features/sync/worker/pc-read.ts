import jwt from 'jsonwebtoken';
import { requireSecretEnv } from '../../../lib/env';
import { CycleExpired } from './relay-client';
export class PcReadError extends Error {
  constructor(readonly status:number,readonly code:string,readonly pcMessage:string){super('PC read failed');}
}
export async function pcRead(path:string,branchId:string,user:{id:string;role:string},deadline:number,send:typeof fetch=fetch){
  const remaining=deadline-Date.now();if(remaining<=0)throw new CycleExpired();
  const response=await send(`http://127.0.0.1:${Number(process.env.PORT||3001)}/api/v1${path}`,{
    headers:{Authorization:'Bearer '+jwt.sign({userId:user.id,role:user.role},requireSecretEnv('JWT_SECRET'),{expiresIn:'2m'}),'X-Branch-Scope':branchId,'X-Sync-Action':'snapshot-read'},
    redirect:'error',signal:AbortSignal.timeout(Math.min(20000,remaining)),
  });
  const body=await response.json();
  if(!response.ok)throw new PcReadError(response.status,body.error?.code??'PC_REFUSED',body.error?.message??'The shop PC refused this request.');
  return body.data;
}
