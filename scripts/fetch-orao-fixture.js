// Read-only fixture download: exact public deployed ORAO executable, pinned by hash.
// The npm SDK's bundled .so is an older V1 binary and cannot test RequestV2.
import {Connection,PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
const output='test/program/fixtures/orao-mainnet.so',expected='f7603b1a993e7853a209a4d04e93e7b05cb41264580bb62030be0bd36889fafe';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(existsSync(output)&&hash(readFileSync(output))===expected){console.log('Verified cached ORAO fixture');process.exit(0)}
const c=new Connection(process.env.TEST_FIXTURE_RPC_URL||'https://api.mainnet-beta.solana.com',{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(20000)})});
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),program=new PublicKey('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y');
const a=await c.getAccountInfo(program,'finalized');if(!a?.executable||!a.owner.equals(loader)||a.data.readUInt32LE(0)!==2)throw new Error('Invalid ORAO program');
const data=await c.getAccountInfo(new PublicKey(a.data.subarray(4,36)),'finalized');if(!data?.owner.equals(loader)||data.data.readUInt32LE(0)!==3)throw new Error('Invalid ORAO ProgramData');
const binary=data.data.subarray(45);if(hash(binary)!==expected)throw new Error('ORAO program changed; review the new executable before updating the fixture hash');
mkdirSync('test/program/fixtures',{recursive:true});writeFileSync(output,binary);console.log('Verified pinned ORAO mainnet executable; no transactions sent');
