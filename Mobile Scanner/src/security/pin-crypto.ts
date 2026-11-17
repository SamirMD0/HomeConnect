import {pbkdf2Async} from '@noble/hashes/pbkdf2';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex,hexToBytes} from '@noble/hashes/utils';
export const PIN_ITERATIONS=150000;
export const validPin=(pin:string)=>/^\d{4,6}$/.test(pin);
export async function derivePin(pin:string,salt:string,iterations=PIN_ITERATIONS){
  const bytes=Uint8Array.from(pin,value=>value.charCodeAt(0));
  try{return bytesToHex(await pbkdf2Async(sha256,bytes,hexToBytes(salt),{c:iterations,dkLen:32,asyncTick:8}));}
  finally{bytes.fill(0);}
}
export function sameHash(left:string,right:string){
  if(left.length!==64||right.length!==64)return false;
  let difference=0;for(let i=0;i<64;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0;
}
