// No program deployment required. Only this worker reads the operator secret.
// --provision-only creates public wallet reservations in PostgreSQL, no chain tx.
// Default simulates. --execute requires RED_ENVELOPE_ENABLED=true.
import {readFileSync} from 'node:fs';
import {Connection,Keypair} from '@solana/web3.js';
import {database,migrate} from '../server/db.js';
import {babaService} from '../server/baba.js';
import {custodialWorker,provisionRewardWallets} from '../server/custodial-reward-worker.js';
const execute=process.argv.includes('--execute'),once=process.argv.includes('--once'),provision=process.argv.includes('--provision-only');
for(const k of ['DATABASE_URL','SOLANA_RPC_URL','RED_ENVELOPE_KEEPER_KEYPAIR','RED_ENVELOPE_SNAPSHOT_AUTHORITY'])if(!process.env[k])throw new Error('Missing '+k);
if(process.env.RED_ENVELOPE_MODE!=='custodial-v1')throw new Error('Set RED_ENVELOPE_MODE=custodial-v1');
if(execute&&process.env.RED_ENVELOPE_ENABLED!=='true')throw new Error('Execution requires RED_ENVELOPE_ENABLED=true');
const operator=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.RED_ENVELOPE_KEEPER_KEYPAIR,'utf8'))));
if(operator.publicKey.toBase58()!==process.env.RED_ENVELOPE_SNAPSHOT_AUTHORITY)throw new Error('Operator key mismatch');
const connection=new Connection(process.env.SOLANA_RPC_URL,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});
if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('Expected mainnet');
const db=database(process.env.DATABASE_URL);await migrate(db);
let stopping=false;process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);
try{
 await provisionRewardWallets(db,operator);
 if(provision){console.log('Public reward wallet inventory prepared; no chain transactions sent.');}else{
 const fafa=babaService({connection,assertMainnet:async()=>{}},{quoteAsset:'FAFA'});
 const worker=custodialWorker({connection,db,operator,execute,curveService:m=>m.engine==='meteora-dbc'?fafa:null});
 do{const balance=await connection.getBalance(operator.publicKey,'finalized');
 await db.query('INSERT INTO custodial_reward_worker(operator,executing,balance_lamports) VALUES($1,$2,$3) ON CONFLICT(operator) DO UPDATE SET executing=$2,balance_lamports=$3,updated_at=now()',[operator.publicKey.toBase58(),execute&&balance>=10000000,String(balance)]);
 if(balance<10000000){console.error('Operator balance below 0.01 SOL; signing paused.');}else{
 await provisionRewardWallets(db,operator);
 const rows=(await db.query("SELECT * FROM tokens WHERE metadata->'redEnvelope'->>'architecture'='custodial-v1' ORDER BY created_at")).rows;
 for(const token of rows){if(stopping)break;try{console.log(JSON.stringify({mint:token.mint,...await worker.cycle(token)}));}catch(e){console.error(JSON.stringify({mint:token.mint,error:e.message}));}}
 }
 if(once||stopping)break;await new Promise(resolve=>setTimeout(resolve,30000));
 }while(!stopping);
 }
}finally{await db.query('UPDATE custodial_reward_worker SET executing=false,updated_at=now() WHERE operator=$1',[operator.publicKey.toBase58()]).catch(()=>{});await db.end();}
