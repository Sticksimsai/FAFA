import {randomUUID} from 'node:crypto';
import {PublicKey,SystemProgram,ComputeBudgetProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createCloseAccountInstruction,createTransferCheckedInstruction,unpackAccount,unpackMint} from '@solana/spl-token';
import {OnlinePumpSdk} from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import bs58 from 'bs58';
import {CUSTODIAL_MODE,rewardWallet,planCustodialRound} from './custodial-rewards.js';
import {collectHolderSnapshot,snapshotTree} from './red-envelope-snapshot.js';
import {FAFA_QUOTE_MINT} from '../shared/quote-assets.js';
const ata=(mint,owner,program)=>getAssociatedTokenAddressSync(mint,owner,false,program);
export async function provisionRewardWallets(db,operator,target=50){const count=Number((await db.query('SELECT count(*) AS count FROM custodial_reward_wallets WHERE operator=$1 AND mint IS NULL',[operator.publicKey.toBase58()])).rows[0].count);for(let i=count;i<target;i++){const id=randomUUID(),wallet=rewardWallet(operator,id);await db.query('INSERT INTO custodial_reward_wallets(id,wallet,operator) VALUES($1,$2,$3)',[id,wallet.publicKey.toBase58(),operator.publicKey.toBase58()]);}}
export async function custodialFeeGroups({connection,wallet,operator,record,curveService}){
 const recipient=wallet.publicKey,payer=operator.publicKey,r=record.metadata.redEnvelope;
 if(r.quoteMint===NATIVE_MINT.toBase58())return [await new OnlinePumpSdk(connection).collectCoinCreatorFeeInstructions(recipient,payer)];
 if(r.quoteMint!==FAFA_QUOTE_MINT)throw new Error('Unsupported custodial quote');
 const info=await curveService.inspect(record.mint,record.metadata);
 if(!info.config.feeClaimer.equals(recipient)||info.config.creatorTradingFeePercentage!==0||info.config.partnerPermanentLockedLiquidityPercentage!==100)throw new Error('Reward fees are not exclusively assigned to this wallet');
 const groups=[(await curveService.sdk.partner.claimPartnerTradingFee({feeClaimer:recipient,receiver:recipient,payer,pool:new PublicKey(info.pool),maxBaseAmount:new BN('18446744073709551615'),maxQuoteAmount:new BN('18446744073709551615')})).instructions];
 if(info.migrated){const pool=new PublicKey(info.graduatedPool),state=await curveService.amm.fetchPoolState(pool);if(state.tokenAMint.toBase58()!==record.mint||state.tokenBMint.toBase58()!==r.quoteMint)throw new Error('Graduated pool mismatch');const positions=await curveService.amm.getUserPositionByPool(pool,recipient);if(!positions.length)throw new Error('Missing graduated fee position');for(const position of positions)groups.push((await curveService.amm.claimPositionFee({owner:recipient,receiver:recipient,feePayer:payer,position:position.position,positionNftAccount:position.positionNftAccount,pool,tokenAMint:state.tokenAMint,tokenBMint:state.tokenBMint,tokenAVault:state.tokenAVault,tokenBVault:state.tokenBVault,tokenAProgram:TOKEN_2022_PROGRAM_ID,tokenBProgram:TOKEN_2022_PROGRAM_ID})).instructions);}
 return groups;
}
export async function rewardBalances(connection,wallet,mint,quote){const baseMint=new PublicKey(mint),quoteMint=new PublicKey(quote);const baseInfo=await connection.getAccountInfo(baseMint,'finalized');if(!baseInfo||!baseInfo.owner.equals(TOKEN_2022_PROGRAM_ID)||unpackMint(baseMint,baseInfo,baseInfo.owner).decimals!==6)throw new Error('Unexpected base mint');
 async function amount(m,p){const key=ata(m,wallet,p),info=await connection.getAccountInfo(key,'finalized');if(!info)return 0n;const a=unpackAccount(key,info,p);if(!a.owner.equals(wallet)||!a.mint.equals(m))throw new Error('Reward balance account mismatch');return a.amount;}
 return {base:await amount(baseMint,TOKEN_2022_PROGRAM_ID),quote:quoteMint.equals(NATIVE_MINT)?BigInt(await connection.getBalance(wallet,'finalized')):await amount(quoteMint,TOKEN_2022_PROGRAM_ID)};
}
export function unwrapCustodialSolInstructions(wallet,operator,amount){return [createCloseAccountInstruction(ata(NATIVE_MINT,wallet,TOKEN_PROGRAM_ID),operator,wallet,[],TOKEN_PROGRAM_ID),...(amount>0n?[SystemProgram.transfer({fromPubkey:operator,toPubkey:wallet,lamports:amount})]:[])];}
export function payoutInstructions({wallet,operator,mint,quoteMint,winner,reward,baseReward}){
 const source=new PublicKey(wallet),payer=new PublicKey(operator),dest=new PublicKey(winner),base=new PublicKey(mint),quote=new PublicKey(quoteMint),out=[];
 if(!PublicKey.isOnCurve(dest.toBytes())||dest.equals(source)||dest.equals(payer))throw new Error('Invalid reward recipient');
 if(BigInt(reward)<0n||BigInt(baseReward)<0n)throw new Error('Negative payout');
 const transfer=(m,amount)=>{if(amount===0n)return;const to=ata(m,dest,TOKEN_2022_PROGRAM_ID);out.push(createAssociatedTokenAccountIdempotentInstruction(payer,to,dest,m,TOKEN_2022_PROGRAM_ID),createTransferCheckedInstruction(ata(m,source,TOKEN_2022_PROGRAM_ID),m,to,source,amount,6,[],TOKEN_2022_PROGRAM_ID));};
 if(quote.equals(NATIVE_MINT)){if(BigInt(reward)>0n)out.push(SystemProgram.transfer({fromPubkey:source,toPubkey:dest,lamports:BigInt(reward)}));}else{if(quote.toBase58()!==FAFA_QUOTE_MINT)throw new Error('Unsupported payout quote');transfer(quote,BigInt(reward));}transfer(base,BigInt(baseReward));return out;
}
// Never replace an uncertain transaction with a new signature. Store signed
// bytes before broadcasting, and only rebuild after finalized failure/expiry.
export async function reconcileCustodialActions({connection,client,wallet,execute}){
 const actions=(await client.query("SELECT * FROM custodial_reward_actions WHERE wallet=$1 AND status='pending' ORDER BY created_at",[wallet])).rows;
 for(const a of actions){const status=(await connection.getSignatureStatuses([a.signature],{searchTransactionHistory:true})).value[0];let state='pending';if(status?.confirmationStatus==='finalized')state=status.err?'failed':'confirmed';else if(!status&&await connection.getBlockHeight('finalized')>Number(a.last_valid_height))state='expired';
  if(state==='pending'){if(execute&&!status)try{await connection.sendRawTransaction(Buffer.from(a.raw_transaction,'base64'),{skipPreflight:false,maxRetries:2})}catch{}return true;}
  if(!execute)return true;
  await client.query('BEGIN');try{await client.query('UPDATE custodial_reward_actions SET status=$2 WHERE id=$1',[a.id,state]);if(state==='confirmed'&&a.kind==='payout'){await client.query("UPDATE custodial_reward_rounds SET state='paid',payout_signature=$3 WHERE wallet=$1 AND sequence=$2 AND state='planned'",[wallet,a.sequence,a.signature]);await client.query('UPDATE custodial_reward_wallets SET sequence=sequence+1,next_due=$3+cycle_seconds WHERE wallet=$1 AND sequence=$2',[wallet,a.sequence,Math.floor(Date.now()/1000)]);}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e}
 }
 return false;
}
export async function submitCustodialAction({connection,client,row,wallet,operator,kind,instructions,execute}){
 if(!instructions.length)return {status:'nothing-to-send'};const latest=await connection.getLatestBlockhash('confirmed');const tx=new VersionedTransaction(new TransactionMessage({payerKey:operator.publicKey,recentBlockhash:latest.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:1200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...instructions]}).compileToV0Message());if(tx.serialize().length>1232)throw new Error('Custodial transaction exceeds packet limit');const sim=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});if(sim.value.err)throw new Error('Custodial simulation failed: '+JSON.stringify(sim.value.err));if(!execute)return {dryRun:true,kind,simulation:'passed',transactionBytes:tx.serialize().length};const required=new Set(tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures).map(k=>k.toBase58()));tx.sign([operator,wallet].filter(k=>required.has(k.publicKey.toBase58())));const signature=bs58.encode(tx.signatures[0]);await client.query('INSERT INTO custodial_reward_actions(id,wallet,sequence,kind,signature,raw_transaction,last_valid_height) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),row.wallet,row.sequence,kind,signature,Buffer.from(tx.serialize()).toString('base64'),latest.lastValidBlockHeight]);try{await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3})}catch{return {status:'submission-uncertain',signature}}return {status:'submitted',kind,signature};
}
export function custodialWorker({connection,db,operator,curveService,execute=false,draw=planCustodialRound}){
 const submit=(client,row,wallet,kind,instructions)=>submitCustodialAction({connection,client,row,wallet,operator,kind,instructions,execute});
 async function cycle(record){const rules=record.metadata?.redEnvelope;if(rules?.architecture!==CUSTODIAL_MODE)return {status:'not-enrolled'};const client=await db.connect();let locked=false;try{locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[rules.vault])).rows[0].locked;if(!locked)return {status:'another-worker'};
  let row=(await client.query('SELECT * FROM custodial_reward_wallets WHERE mint=$1',[record.mint])).rows[0];if(!row||row.wallet!==rules.vault||row.creator!==record.wallet||row.operator!==operator.publicKey.toBase58()||row.quote_mint!==rules.quoteMint||row.cycle_seconds!==rules.cycleSeconds||row.id!==rules.walletId)throw new Error('Reward assignment mismatch');const wallet=rewardWallet(operator,row.id);if(wallet.publicKey.toBase58()!==row.wallet)throw new Error('Reward derivation mismatch');
  if(await reconcileCustodialActions({connection,client,wallet:row.wallet,execute}))return {status:'awaiting-finality'};
  row=(await client.query('SELECT * FROM custodial_reward_wallets WHERE mint=$1',[record.mint])).rows[0];
  const round=(await client.query('SELECT * FROM custodial_reward_rounds WHERE wallet=$1 AND sequence=$2',[row.wallet,row.sequence])).rows[0];
  if(round){if(round.state!=='planned')throw new Error('Unexpected round state');const tree=snapshotTree({vault:row.wallet,sequence:row.sequence,holders:round.holders});if(tree.root!==round.root||tree.entries[round.winner_index]?.wallet!==round.winner||round.winner===row.creator)throw new Error('Stored draw mismatch');return submit(client,row,wallet,'payout',payoutInstructions({wallet:row.wallet,operator:row.operator,mint:record.mint,quoteMint:row.quote_mint,winner:round.winner,reward:round.reward,baseReward:round.base_reward}));}
  if(!row.next_due||Math.floor(Date.now()/1000)<Number(row.next_due))return {status:'accumulating',nextDue:row.next_due};
  const groups=await custodialFeeGroups({connection,wallet,operator,record,curveService:curveService(record.metadata)});
  for(let i=0;i<groups.length;i++){const last=(await client.query("SELECT created_at FROM custodial_reward_actions WHERE wallet=$1 AND sequence=$2 AND kind=$3 AND status='confirmed' ORDER BY created_at DESC LIMIT 1",[row.wallet,row.sequence,'harvest-'+i])).rows[0];if(!last||Date.now()-new Date(last.created_at).getTime()>Math.max(900,row.cycle_seconds)*1000)return submit(client,row,wallet,'harvest-'+i,groups[i]);}
  if(row.quote_mint===NATIVE_MINT.toBase58()){const key=ata(NATIVE_MINT,wallet.publicKey,TOKEN_PROGRAM_ID),info=await connection.getAccountInfo(key,'finalized');if(info){const a=unpackAccount(key,info,TOKEN_PROGRAM_ID);if(!a.owner.equals(wallet.publicKey)||!a.isNative)throw new Error('Unexpected wrapped SOL account');const ix=unwrapCustodialSolInstructions(wallet.publicKey,operator.publicKey,a.amount);return submit(client,row,wallet,'unwrap',ix);}}
  const amounts=await rewardBalances(connection,wallet.publicKey,record.mint,row.quote_mint),minimum=row.quote_mint===NATIVE_MINT.toBase58()?10000000n:100000000n;if(amounts.quote<minimum)return {status:'underfunded',reward:amounts.quote.toString(),minimum:minimum.toString()};
  const snapshot=await collectHolderSnapshot(connection,{mint:record.mint,creator:record.wallet,vault:row.wallet,sequence:row.sequence});snapshot.holders=snapshot.holders.filter(x=>x.wallet!==row.operator);if(!snapshot.holders.length)return {status:'no-eligible-holders'};
  if(!execute)return {dryRun:true,kind:'snapshot',eligible:snapshot.holders.length,reward:amounts.quote.toString()};
  const plan=draw(snapshot,amounts.quote,amounts.base);await client.query('INSERT INTO custodial_reward_rounds(wallet,sequence,mint,root,snapshot_slot,holders,winner,winner_index,audit_nonce,reward,base_reward) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[row.wallet,row.sequence,record.mint,plan.root,snapshot.slot,JSON.stringify(plan.holders),plan.winner,plan.winnerIndex,plan.auditNonce,plan.reward,plan.baseReward]);return {status:'draw-recorded',winner:plan.winner};
 }finally{if(locked)await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[rules.vault]);client.release();}}
 return {cycle};
}
