// Operator-local setup. Defaults to read-only; keypair files are read only with --execute.
// Commands: inspect, initialize, create-lookup, extend-lookup, freeze-lookup.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Connection,PublicKey,Keypair,AddressLookupTableProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {initializeRewardInstruction,rewardLookupAddresses,decodeConfig,validateRewardLookup} from '../server/red-envelope-chain.js';
const args=process.argv.slice(2),command=args.find(x=>!x.startsWith('--'))||'inspect',execute=args.includes('--execute');
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]};
if(!['inspect','initialize','create-lookup','extend-lookup','freeze-lookup'].includes(command))throw new Error('Unknown setup command');
for(const key of ['SOLANA_RPC_URL','RED_ENVELOPE_PROGRAM_ID','RED_ENVELOPE_OPERATOR','RED_ENVELOPE_SNAPSHOT_AUTHORITY'])if(!process.env[key])throw new Error('Missing '+key);
const connection=new Connection(process.env.SOLANA_RPC_URL,'finalized'),program=new PublicKey(process.env.RED_ENVELOPE_PROGRAM_ID),operator=new PublicKey(process.env.RED_ENVELOPE_OPERATOR),keeper=new PublicKey(process.env.RED_ENVELOPE_SNAPSHOT_AUTHORITY);
const genesis=await connection.getGenesisHash(),mainnet=genesis==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
if(!mainnet&&genesis!==process.env.RED_ENVELOPE_TEST_GENESIS_HASH)throw new Error('Unexpected network');
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),account=await connection.getAccountInfo(program,'finalized');
if(!account?.executable||!account.owner.equals(loader)||account.data.length<36||account.data.readUInt32LE(0)!==2)throw new Error('Deploy the upgradeable program before setup');
const programData=new PublicKey(account.data.subarray(4,36)),data=await connection.getAccountInfo(programData,'finalized');
if(!data?.owner.equals(loader)||data.data.length<45||data.data.readUInt32LE(0)!==3||data.data[12]!==1||!new PublicKey(data.data.subarray(13,45)).equals(operator))throw new Error('Operator must be the deployed upgrade authority');
const hash=createHash('sha256').update(data.data.subarray(45)).digest('hex');
console.log(JSON.stringify({network:mainnet?'mainnet-beta':'test',programId:program.toBase58(),programDataSha256:hash,operator:operator.toBase58(),keeper:keeper.toBase58()},null,2));
if(execute&&process.env.RED_ENVELOPE_PROGRAM_SHA256!==hash)throw new Error('Set the reviewed deployed ProgramData hash before executing setup');
const config=PublicKey.findProgramAddressSync([Buffer.from('config')],program)[0],configured=await connection.getAccountInfo(config,'finalized');
if(configured&&decodeConfig(configured,program)!==keeper.toBase58())throw new Error('Existing snapshot authority differs; config cannot be overwritten');
let ix,lookupKey=process.env.RED_ENVELOPE_LOOKUP_TABLE?new PublicKey(process.env.RED_ENVELOPE_LOOKUP_TABLE):null;
if(command==='initialize'){
 if(configured){console.log('Config already initialized with the expected keeper');process.exit(0)}
 ix=initializeRewardInstruction({programId:program,authority:operator,snapshotAuthority:keeper});
}else if(command==='create-lookup'){
 if(lookupKey)throw new Error('Lookup already configured; inspect or extend it instead');
 const [create,address]=AddressLookupTableProgram.createLookupTable({authority:operator,payer:operator,recentSlot:await connection.getSlot('finalized')});ix=create;lookupKey=address;
}else if(command==='extend-lookup'||command==='freeze-lookup'){
 if(!lookupKey)throw new Error('Set RED_ENVELOPE_LOOKUP_TABLE to the confirmed table address');
 const lookup=(await connection.getAddressLookupTable(lookupKey)).value;if(!lookup||lookup.state.deactivationSlot!==18446744073709551615n)throw new Error('Lookup unavailable');
 if(!lookup.state.authority){validateRewardLookup(lookup,program);console.log('Lookup is already complete and immutable');process.exit(0)}
 if(!lookup.state.authority.equals(operator))throw new Error('Wrong lookup authority');
 const known=new Set(lookup.state.addresses.map(x=>x.toBase58())),missing=rewardLookupAddresses(program).filter(x=>!known.has(x.toBase58()));
 if(command==='extend-lookup'){
  if(!missing.length){console.log('All required addresses are already present');process.exit(0)}
  ix=AddressLookupTableProgram.extendLookupTable({lookupTable:lookupKey,authority:operator,payer:operator,addresses:missing});
 }else{
  if(missing.length)throw new Error('Extend the table with required addresses before freezing');
  ix=AddressLookupTableProgram.freezeLookupTable({lookupTable:lookupKey,authority:operator});
 }
}
if(!ix){console.log(JSON.stringify({configInitialized:!!configured,requiredLookupAddresses:rewardLookupAddresses(program).map(x=>x.toBase58())},null,2));process.exit(0)}
console.log(JSON.stringify({command,execute,lookupTable:lookupKey?.toBase58(),note:'Freezing the lookup is irreversible. Setup never enables payouts.'},null,2));
const latest=await connection.getLatestBlockhash('confirmed'),tx=new VersionedTransaction(new TransactionMessage({payerKey:operator,recentBlockhash:latest.blockhash,instructions:[ix]}).compileToV0Message());
const simulation=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});if(simulation.value.err)throw new Error('Setup simulation failed: '+JSON.stringify(simulation.value.err));
if(!execute){console.log('Simulation passed. No transaction sent.');process.exit(0)}
const keyPath=option('--keypair');if(!keyPath)throw new Error('--keypair must explicitly name the operator-local keypair file');
const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath,'utf8'))));if(!signer.publicKey.equals(operator))throw new Error('Keypair does not match operator');
tx.sign([signer]);
const {default:bs58}=await import('bs58');const signature=bs58.encode(tx.signatures[0]);console.log(JSON.stringify({signature,lastValidBlockHeight:latest.lastValidBlockHeight,lookupTable:lookupKey?.toBase58(),instruction:'Record these before broadcast; if confirmation times out, inspect this signature before retrying.'}));
await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
const result=await connection.confirmTransaction({signature,...latest},'finalized');if(result.value.err)throw new Error('Setup failed: '+JSON.stringify(result.value.err));console.log(JSON.stringify({confirmed:true,signature,lookupTable:lookupKey?.toBase58()}));
