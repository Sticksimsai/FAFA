// Read-only deployment audit. Never signs, sends, or reads private key files.
import {Connection,PublicKey} from '@solana/web3.js';
import {Orao} from '@orao-network/solana-vrf';
import {redEnvelopeService,RED_ENVELOPE_RELEASE_READY} from '../server/red-envelope.js';
import {validateRewardLookup} from '../server/red-envelope-chain.js';
const required=['SOLANA_RPC_URL','RED_ENVELOPE_PROGRAM_ID','RED_ENVELOPE_SNAPSHOT_AUTHORITY','RED_ENVELOPE_PROGRAM_SHA256','RED_ENVELOPE_LOOKUP_TABLE'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.log(JSON.stringify({ready:false,missing},null,2));process.exitCode=1;}else{
 try{
  const connection=new Connection(process.env.SOLANA_RPC_URL,'finalized');
  if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('Expected Solana mainnet');
  const program=await redEnvelopeService({connection}).verifyDeployment();
  const lookup=validateRewardLookup((await connection.getAddressLookupTable(new PublicKey(process.env.RED_ENVELOPE_LOOKUP_TABLE))).value,program);
  const keeper=new PublicKey(process.env.RED_ENVELOPE_SNAPSHOT_AUTHORITY);
  const [balance,network]=await Promise.all([connection.getBalance(keeper,'finalized'),new Orao({connection,publicKey:keeper}).getNetworkState('finalized')]);
  const fee=BigInt(network.config.requestFee.toString()),gasReserve=10_000_000n;
  const funded=BigInt(balance)>fee+gasReserve;
  console.log(JSON.stringify({ready:RED_ENVELOPE_RELEASE_READY&&process.env.RED_ENVELOPE_ENABLED==='true'&&funded,programId:program.toBase58(),lookupTable:lookup.key.toBase58(),keeper:keeper.toBase58(),keeperBalanceLamports:String(balance),vrfRequestFeeLamports:fee.toString(),fundedForOneCycle:funded,releaseGate:RED_ENVELOPE_RELEASE_READY,operatorEnabled:process.env.RED_ENVELOPE_ENABLED==='true'},null,2));
  if(!funded||!RED_ENVELOPE_RELEASE_READY)process.exitCode=1;
 }catch(e){console.error(JSON.stringify({ready:false,error:e.message}));process.exitCode=1;}
}
