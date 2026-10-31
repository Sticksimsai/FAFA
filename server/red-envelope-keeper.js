import {PublicKey,ComputeBudgetProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT,unpackAccount} from '@solana/spl-token';
import {Orao} from '@orao-network/solana-vrf';
import {randomUUID} from 'node:crypto';
import bs58 from 'bs58';
import {collectHolderSnapshot,snapshotTree,winnerIndex} from './red-envelope-snapshot.js';
import {rewardAddresses,readRewardVault,decodeRound,beginRoundInstruction,settleRoundInstruction,VAULT_ACCOUNT_SIZE} from './red-envelope-chain.js';
import {rewardFeeInstructions} from './red-envelope-fees.js';
import {FAFA_QUOTE_MINT} from '../shared/quote-assets.js';

export function keeperService({connection,db,programId,signer,curveService,lookupTables=[],execute=false}){
 const keeper=signer.publicKey,orao=new Orao({connection,publicKey:keeper});
 async function submit(client,a,sequence,kind,instructions){
  const latest=await connection.getLatestBlockhash('confirmed');
  const tx=new VersionedTransaction(new TransactionMessage({payerKey:keeper,recentBlockhash:latest.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:1200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...instructions]}).compileToV0Message(lookupTables));
  if(tx.serialize().length>1232)throw new Error('Reward transaction exceeds packet limit');
  const sim=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});if(sim.value.err)throw new Error('Reward simulation failed: '+JSON.stringify(sim.value.err));
  if(!execute)return {dryRun:true,kind,instructions:instructions.length,simulation:'passed',unitsConsumed:sim.value.unitsConsumed??null,transactionBytes:tx.serialize().length};
  tx.sign([signer]);const signature=bs58.encode(tx.signatures[0]);
  // Persist signature BEFORE broadcast. On restart, reconcile it before making
  // a new transaction; a timeout is never interpreted as a failed payment.
  await client.query("INSERT INTO red_envelope_actions(id,vault,sequence,kind,signature,last_valid_height,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",[randomUUID(),a.vault.toBase58(),sequence,kind,signature,latest.lastValidBlockHeight]);
  if(kind==='begin')await client.query('UPDATE red_envelope_snapshots SET begin_signature=$3 WHERE vault=$1 AND sequence=$2',[a.vault.toBase58(),sequence,signature]);
  if(kind==='settle')await client.query('UPDATE red_envelope_snapshots SET payout_signature=$3 WHERE vault=$1 AND sequence=$2',[a.vault.toBase58(),sequence,signature]);
  try{await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3})}catch{return {status:'submission-uncertain',signature}}
  return {status:'submitted',signature};
 }
 async function reconcile(client,vault){const pending=(await client.query("SELECT * FROM red_envelope_actions WHERE vault=$1 AND status='pending'",[vault])).rows;let waiting=false;for(const action of pending){const status=(await connection.getSignatureStatuses([action.signature],{searchTransactionHistory:true})).value[0];let state='pending';if(status?.confirmationStatus==='finalized')state=status.err?'failed':'confirmed';else if(!status&&await connection.getBlockHeight('finalized')>Number(action.last_valid_height))state='expired';if(state==='pending')waiting=true;else await client.query('UPDATE red_envelope_actions SET status=$2 WHERE id=$1',[action.id,state]);}return waiting;}
 async function cycle(record){const rules=record.metadata?.redEnvelope;if(!rules||rules.programId!==programId)return {status:'not-enrolled'};const a=rewardAddresses(programId,record.mint,rules.quoteMint);if(rules.vault!==a.vault.toBase58())throw new Error('Reward vault metadata mismatch');const client=await db.connect();let locked=false;
  try{locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[a.vault.toBase58()])).rows[0].locked;if(!locked)return {status:'another-worker'};
   if(await reconcile(client,a.vault.toBase58()))return {status:'awaiting-finality'};
   const v=await readRewardVault(connection,{programId,mint:record.mint,quoteMint:rules.quoteMint});if(v.creator!==record.wallet||v.cycleSeconds!==rules.cycleSeconds)throw new Error('Vault rules mismatch');
   const current=rewardAddresses(programId,record.mint,rules.quoteMint,v.sequence);
   if(v.pending){const round=decodeRound(await connection.getAccountInfo(current.round,'finalized'),programId);const row=(await client.query('SELECT * FROM red_envelope_snapshots WHERE vault=$1 AND sequence=$2',[v.address,v.sequence])).rows[0];if(!row||row.root!==round.root)throw new Error('Committed snapshot is missing; refusing to redraw');const tree=snapshotTree({vault:v.address,sequence:v.sequence,holders:row.holders});if(tree.root!==round.root||tree.entries.length!==round.count)throw new Error('Snapshot integrity mismatch');const random=(await orao.getRandomness(Buffer.from(round.seed,'hex'),'finalized')).fulfilled();if(!random)return {status:'awaiting-randomness'};const index=winnerIndex(random,round.count),winner=tree.entries[index];const ix=settleRoundInstruction({programId,mint:record.mint,quoteMint:rules.quoteMint,sequence:v.sequence,randomness:round.randomness,winner:winner.wallet,index,balance:winner.balance,proof:tree.proof(index),payer:keeper});return submit(client,current,v.sequence,'settle',[ix]);}
   const slot=await connection.getSlot('finalized'),now=await connection.getBlockTime(slot);if(now==null)throw new Error('Finalized chain time unavailable');if(now<v.nextDue)return {status:'accumulating',nextDue:v.nextDue};
   const lastHarvest=(await client.query("SELECT created_at FROM red_envelope_actions WHERE vault=$1 AND sequence=$2 AND kind='harvest' AND status='confirmed' ORDER BY created_at DESC LIMIT 1",[v.address,v.sequence])).rows[0];
   if(!lastHarvest||Date.now()-new Date(lastHarvest.created_at).getTime()>120000){const ix=await rewardFeeInstructions({connection,programId,mint:record.mint,quoteMint:rules.quoteMint,payer:keeper,metadata:record.metadata,curveService:curveService(record.metadata)});return submit(client,current,v.sequence,'harvest',ix);}
   let reward;if(a.quoteMint.equals(NATIVE_MINT)){if(!Number.isSafeInteger(v.lamports))throw new Error('Unsafe lamport balance');reward=BigInt(v.lamports)-BigInt(await connection.getMinimumBalanceForRentExemption(VAULT_ACCOUNT_SIZE));}else{const account=await connection.getAccountInfo(a.quoteVault,'finalized');reward=unpackAccount(a.quoteVault,account,a.tokenProgram).amount;}
   const minimum=a.quoteMint.equals(NATIVE_MINT)?10000000n:a.quoteMint.toBase58()===FAFA_QUOTE_MINT?100000000n:10000n;if(reward<minimum)return {status:'underfunded',reward:reward.toString(),minimum:minimum.toString()};
   const snapshot=await collectHolderSnapshot(connection,{mint:record.mint,creator:record.wallet,vault:v.address,sequence:v.sequence});if(!snapshot.holders.length)return {status:'no-eligible-holders'};
   const tree=snapshotTree(snapshot),network=await orao.getNetworkState('finalized');const request=beginRoundInstruction({programId,mint:record.mint,quoteMint:rules.quoteMint,sequence:v.sequence,root:tree.root,count:tree.entries.length,slot:snapshot.slot,keeper,treasury:network.config.treasury});
   if(!execute)return {dryRun:true,kind:'begin',root:tree.root,eligible:tree.entries.length,reward:reward.toString()};
   // Replace an uncommitted snapshot only while the onchain vault has no
   // pending round. Existing confirmed roots never change.
   if(await connection.getAccountInfo(current.round,'finalized'))throw new Error('Round already exists; retry chain reconciliation');
   await client.query('INSERT INTO red_envelope_snapshots(vault,sequence,mint,root,snapshot_slot,holders) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(vault,sequence) DO UPDATE SET root=$4,snapshot_slot=$5,holders=$6,begin_signature=NULL,payout_signature=NULL',[v.address,v.sequence,record.mint,tree.root,snapshot.slot,JSON.stringify(tree.entries)]);
   return submit(client,current,v.sequence,'begin',[request.instruction]);
  }finally{if(locked)await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[a.vault.toBase58()]);client.release();}
 }
 return {cycle,reconcile};
}
