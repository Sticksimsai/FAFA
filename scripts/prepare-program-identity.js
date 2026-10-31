// Run on the owner's Mac. Offline only; never deploys or sends a transaction.
import {mkdir,lstat,open,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Keypair} from '@solana/web3.js';

export async function prepareProgramIdentity(directory){
 await mkdir(directory,{recursive:true,mode:0o700});
 const dir=await lstat(directory);
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)throw new Error('Identity directory must be private (permissions 700).');
 const path=join(directory,'red-envelope-program.json');
 let handle,secret,created=false;
 try{
  try{handle=await open(path,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;}
  if(handle){
   const identity=Keypair.generate();secret=identity.secretKey;
   await handle.writeFile(JSON.stringify([...secret])+'\n');await handle.sync();created=true;
   return {programId:identity.publicKey.toBase58(),path,created};
  }
  const existing=await lstat(path);
  if(!existing.isFile()||existing.isSymbolicLink()||(existing.mode&0o077)!==0)throw new Error('Existing identity file must be private (permissions 600).');
  const parsed=JSON.parse(await readFile(path,'utf8'));
  if(!Array.isArray(parsed)||parsed.length!==64||parsed.some(x=>!Number.isInteger(x)||x<0||x>255))throw new Error('Invalid existing identity file; nothing overwritten.');
  secret=Uint8Array.from(parsed);parsed.fill(0);
  return {programId:Keypair.fromSecretKey(secret).publicKey.toBase58(),path,created};
 }finally{secret?.fill(0);await handle?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 prepareProgramIdentity(join(homedir(),'.fafa-wallets')).then(result=>{
  console.log('PROGRAM_ID='+result.programId);
  console.log((result.created?'Created':'Reusing')+' private program identity: '+result.path);
  console.log('Keep this file backed up privately. Share only PROGRAM_ID. No transaction sent.');
 }).catch(()=>{console.error('Could not prepare program identity. Check ~/.fafa-wallets permissions and existing file format. Nothing was deployed.');process.exitCode=1;});
}
