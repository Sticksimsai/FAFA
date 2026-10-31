// Read-only downloads of public protocol executables. Changes require review.
import {Connection,PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
const fixtures=[
 ['dbc','dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN','e2bfc853c1a1778dd8ee40ea9a0f3edf5587442360c57c685e7e3024ad0cad47'],
 ['damm','cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG','967ff9fb161eec2e62f66d2c899100739fb747c445f697b8625c86b31b9a2022'],
 ['pump','6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P','7a19affaa2c6187e04a5fe0ea298cee81fa5eb8c24cfcc30d85f615e89f7b02d'],
 ['pump-amm','pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA','6a7ad34596d83b4c435b32f458a56e718e9f82eb4ad38e4316616d15d24d8ff7'],
];
const hash=b=>createHash('sha256').update(b).digest('hex');
const c=new Connection(process.env.TEST_FIXTURE_RPC_URL||'https://api.mainnet-beta.solana.com',{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(20000)})});
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
mkdirSync('test/program/fixtures',{recursive:true});
for(const [name,id,expected] of fixtures){
 const output=`test/program/fixtures/${name}-mainnet.so`;
 if(existsSync(output)&&hash(readFileSync(output))===expected){console.log(`Verified cached ${name} fixture`);continue;}
 const a=await c.getAccountInfo(new PublicKey(id),'finalized');
 if(!a?.executable||!a.owner.equals(loader)||a.data.length<36||a.data.readUInt32LE(0)!==2)throw new Error(`Invalid ${name} program`);
 const data=await c.getAccountInfo(new PublicKey(a.data.subarray(4,36)),'finalized');
 if(!data?.owner.equals(loader)||data.data.length<45||data.data.readUInt32LE(0)!==3)throw new Error(`Invalid ${name} ProgramData`);
 const binary=data.data.subarray(45);
 if(hash(binary)!==expected)throw new Error(`${name} executable changed; review before updating fixture hash`);
 writeFileSync(output,binary);console.log(`Verified pinned ${name} executable; no transactions sent`);
}
