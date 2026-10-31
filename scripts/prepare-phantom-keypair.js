// Run locally on the wallet owner's Mac. No RPC, network calls or transactions.
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {mkdir,open,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import bs58 from 'bs58';

const addresses={operator:'4p1AY1EZ7ZmeTaZEfq21m98u6pb3usCNDhveJK4Vtx3g',deployment:'7EbtR2dyJG5GpjPLaZDPrmbkN49ghwuYGNDgzmNax3VW'};
export function verifySecret(encoded,expected){
 let secret;try{secret=Buffer.from(bs58.decode(encoded.trim()));}catch{throw new Error('Expected a Phantom base58 private key, not a recovery phrase.');}
 if(secret.length!==64){secret.fill(0);throw new Error('Expected a 64-byte Solana private key.');}
 const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),secret.subarray(0,32)]),format:'der',type:'pkcs8'});
 const publicBytes=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32);
 if(!publicBytes.equals(secret.subarray(32))||bs58.encode(publicBytes)!==expected){secret.fill(0);throw new Error('Key does not match the designated wallet. Nothing saved.');}
 return secret;
}
function hiddenInput(){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Run interactively in Terminal; do not pipe a private key.');
 process.stdout.write('Paste this wallet’s exported private key (hidden), then press Return: ');
 return new Promise((resolve,reject)=>{
  let value='';process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
  const finish=(err)=>{process.stdin.removeListener('data',receive);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');err?reject(err):resolve(value);value='';};
  const receive=chunk=>{for(const char of chunk){if(char==='\u0003'||char==='\u0004'){finish(new Error('Cancelled.'));return;}if(char==='\r'||char==='\n'){finish();return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(/[1-9A-HJ-NP-Za-km-z]/.test(char))value+=char;else {finish(new Error('Unsupported character. Use the exported Solana private key.'));return;}if(value.length>100){finish(new Error('Input too long.'));return;}}};
  process.stdin.on('data',receive);
 });
}
async function main(){
 const role=process.argv[2];if(!addresses[role]||process.argv.length!==3)throw new Error('Usage: node scripts/prepare-phantom-keypair.js operator|deployment');
 const dir=join(homedir(),'.fafa-wallets');await mkdir(dir,{mode:0o700,recursive:true});
 const stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('Wallet directory must be a private directory (permissions 700).');
 console.log('Offline preparation only. Expected '+role+' address: '+addresses[role]);
 const secret=verifySecret(await hiddenInput(),addresses[role]);
 const target=join(dir,role+'.json');let file;
 try{file=await open(target,'wx',0o600);await file.writeFile(JSON.stringify([...secret])+'\n');await file.sync();}finally{secret.fill(0);await file?.close();}
 console.log('Verified and saved: '+target+'\nNo transaction sent. Never upload the deployment key to Render.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.code==='EEXIST'?'File already exists; nothing overwritten.':e.message);process.exitCode=1;});
