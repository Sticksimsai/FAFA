// Usage: node --env-file=.env scripts/red-envelope-keeper.js [--execute] [--once]
// Default is read-only planning. This is a separate worker, never the web server.
import {readFileSync} from 'node:fs';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {database,migrate} from '../server/db.js';
import {babaService} from '../server/baba.js';
import {curveQuoteAsset} from '../shared/quote-assets.js';
import {RED_ENVELOPE_RELEASE_READY,redEnvelopeService} from '../server/red-envelope.js';
import {keeperService} from '../server/red-envelope-keeper.js';
const execute=process.argv.includes('--execute'),once=process.argv.includes('--once');
if(!process.env.DATABASE_URL||!process.env.SOLANA_RPC_URL||!process.env.RED_ENVELOPE_PROGRAM_ID||!process.env.RED_ENVELOPE_SNAPSHOT_AUTHORITY)throw new Error('Configure database, RPC, program and snapshot authority');
const connection=new Connection(process.env.SOLANA_RPC_URL,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})});
const genesis=await connection.getGenesisHash();
const mainnet=genesis==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
if(execute&&mainnet&&(!RED_ENVELOPE_RELEASE_READY||process.env.RED_ENVELOPE_ENABLED!=='true'))throw new Error('Mainnet reward execution is not released');
if(execute&&!mainnet&&process.env.RED_ENVELOPE_TEST_GENESIS_HASH!==genesis)throw new Error('Explicit test-cluster genesis hash is required');
let signer={publicKey:new PublicKey(process.env.RED_ENVELOPE_SNAPSHOT_AUTHORITY)};
if(execute){if(!process.env.RED_ENVELOPE_KEEPER_KEYPAIR)throw new Error('Configure a keeper keypair file; never use a creator wallet key');signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.RED_ENVELOPE_KEEPER_KEYPAIR,'utf8'))));if(signer.publicKey.toBase58()!==process.env.RED_ENVELOPE_SNAPSHOT_AUTHORITY)throw new Error('Keeper key does not match snapshot authority');}
const db=database(process.env.DATABASE_URL);await migrate(db);
try{await redEnvelopeService({connection,db}).verifyDeployment();const pump={connection,assertMainnet:async()=>{if(!mainnet)throw new Error('Meteora live adapters require mainnet; use fixture collectors for local-validator tests')}};const services={BABA:babaService(pump),FAFA:babaService(pump,{quoteAsset:'FAFA'})};const worker=keeperService({connection,db,programId:process.env.RED_ENVELOPE_PROGRAM_ID,signer,execute,curveService:m=>m.engine==='meteora-dbc'?services[curveQuoteAsset(m)]:null});let stopping=false;process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);do{const tokens=(await db.query("SELECT * FROM tokens WHERE metadata->'redEnvelope' IS NOT NULL ORDER BY created_at")).rows;for(const token of tokens){if(stopping)break;try{console.log(JSON.stringify({mint:token.mint,...await worker.cycle(token)}))}catch(e){console.error(JSON.stringify({mint:token.mint,error:e.message}))}}if(once||stopping)break;await new Promise(r=>setTimeout(r,30000));}while(!stopping);}finally{await db.end()}
