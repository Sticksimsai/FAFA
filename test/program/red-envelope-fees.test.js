// Executes compiled SBF plus the pinned deployed ORAO V2 binary.
// Synthetic mint funding/config accounts are local fixtures, never mainnet state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {LiteSVM,FailedTransactionMetadata} from 'litesvm';
import {getTransactionDecoder} from '@solana/kit';
import {Keypair,PublicKey,SystemProgram,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,AddressLookupTableProgram,AddressLookupTableAccount,Ed25519Program,SYSVAR_INSTRUCTIONS_PUBKEY} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,NATIVE_MINT,MintLayout,AccountLayout,createInitializeMint2Instruction,createMintToInstruction,createTransferCheckedInstruction,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
import {Orao,PROGRAM_ID as ORAO_ID,networkStateAccountAddress} from '@orao-network/solana-vrf';
import BN from 'bn.js';
import {DynamicBondingCurveClient,DYNAMIC_BONDING_CURVE_PROGRAM_ID,deriveDbcPoolAddress,deriveDammV2PoolAddress,DAMM_V2_MIGRATION_FEE_ADDRESS,MigrationFeeOption,SwapMode,deriveDbcPoolAuthority} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {CpAmm,CP_AMM_PROGRAM_ID,derivePositionNftAccount} from '@meteora-ag/cp-amm-sdk';
import {babaCurveParameters} from '../../server/baba.js';
import {rewardFeeInstructions} from '../../server/red-envelope-fees.js';
import {rewardAddresses,initializeRewardInstruction,createRewardVaultInstruction,beginRoundInstruction,settleRoundInstruction,decodeVault,decodeRound,rewardLookupAddresses} from '../../server/red-envelope-chain.js';
import {snapshotTree,digest,winnerIndex} from '../../server/red-envelope-snapshot.js';
import {FAFA_QUOTE_MINT} from '../../shared/quote-assets.js';
const require=createRequire(import.meta.url),program=new PublicKey(readFileSync('programs/red-envelope/PROGRAM_ID','utf8').trim());
const binary=process.env.RED_ENVELOPE_SBF||'target/deploy/fafa_red_envelope.so';
for(const migrated of [false,true])for(const cycleSeconds of [3600])for(const quote of [FAFA_QUOTE_MINT])test(`compiled vault: ${quote===FAFA_QUOTE_MINT?'FAFA':'SOL'} ${cycleSeconds}s DBC ${migrated?'graduated':'curve'} trade → claim fees → ORAO → payout`,async()=>{
 const svm=new LiteSVM().withNativeMints();svm.addProgramFromFile(program.toBase58(),binary);svm.addProgramFromFile(ORAO_ID.toBase58(),'test/program/fixtures/orao-mainnet.so');svm.addProgramFromFile(DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58(),'test/program/fixtures/dbc-mainnet.so');svm.addProgramFromFile(CP_AMM_PROGRAM_ID.toBase58(),'test/program/fixtures/damm-mainnet.so');
 const creator=Keypair.generate(),keeper=Keypair.generate(),oracle=Keypair.generate(),treasury=Keypair.generate(),mint=Keypair.generate(),holders=[Keypair.generate(),Keypair.generate(),Keypair.generate()];
 for(const k of [creator,keeper,treasury,...holders])svm.airdrop(k.publicKey.toBase58(),50_000_000_000n);
 const account=k=>{const a=svm.getAccount(k.toBase58());return a.exists?{owner:new PublicKey(a.programAddress),data:Buffer.from(a.data),lamports:Number(a.lamports)}:null};
 const put=(key,owner,data,lamports)=>svm.setAccount({address:key.toBase58(),programAddress:owner.toBase58(),data,lamports:lamports??svm.minimumBalanceForRentExemption(BigInt(data.length)),executable:false});
 let launchLookup;
 const send=(ix,signers=[keeper],ok=true,computeUnits=1_200_000)=>{svm.expireBlockhash();const tx=new VersionedTransaction(new TransactionMessage({payerKey:signers[0].publicKey,recentBlockhash:svm.latestBlockhash(),instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:computeUnits}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...ix]}).compileToV0Message(launchLookup?[launchLookup]:[]));tx.sign(signers);assert.ok(tx.serialize().length<=1232,`Transaction exceeds packet limit: ${tx.serialize().length}`);const result=svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));if(ok)assert.ok(!(result instanceof FailedTransactionMetadata),result instanceof FailedTransactionMetadata?JSON.stringify({error:result.err(),logs:result.meta().logs()}):'');else assert.ok(result instanceof FailedTransactionMetadata,'Expected the contract to reject this transaction');return result};
 const a=rewardAddresses(program,mint.publicKey,quote);
 // Model a deployed program owned by the operator, then execute real initialization.
 const programInfo=account(program),programDataKey=new PublicKey(programInfo.data.subarray(4,36)),programData=account(programDataKey);programData.data[12]=1;creator.publicKey.toBuffer().copy(programData.data,13);put(programDataKey,programData.owner,programData.data,BigInt(programData.lamports));
 send([initializeRewardInstruction({programId:program,authority:keeper.publicKey,snapshotAuthority:keeper.publicKey})],[keeper],false);
 send([initializeRewardInstruction({programId:program,authority:creator.publicKey,snapshotAuthority:keeper.publicKey})],[creator]);
 if(quote===FAFA_QUOTE_MINT){const f=JSON.parse(readFileSync('test/fixtures/fafa-quote-mint.json','utf8'));put(a.quoteMint,new PublicKey(f.owner),Buffer.from(f.data,'base64'));}
 const connection={commitment:'confirmed',getAccountInfo:async k=>account(k),getMultipleAccountsInfo:async keys=>keys.map(account),getMultipleAccountsInfoAndContext:async keys=>({context:{slot:Number(svm.getClock().slot)},value:keys.map(account)}),getSlot:async()=>Number(svm.getClock().slot),getBlockTime:async()=>Number(svm.getClock().unixTimestamp),getEpochInfo:async()=>({epoch:0}),getAccountInfoAndContext:async k=>({context:{slot:Number(svm.getClock().slot)},value:account(k)})};
 const sdk=new DynamicBondingCurveClient(connection,'confirmed'),config=Keypair.generate();
 const created=await sdk.partner.createConfigAndPool({...babaCurveParameters(100000,{rewardVault:true}),payer:creator.publicKey,config:config.publicKey,feeClaimer:a.vault,leftoverReceiver:creator.publicKey,quoteMint:a.quoteMint,preCreatePoolParam:{baseMint:mint.publicKey,name:'发'.repeat(10)+'FA',symbol:'测试币',uri:'https://tryfafa.xyz/api/metadata/'+mint.publicKey.toBase58(),poolCreator:creator.publicKey}});
 // Create, populate and freeze the same lookup addresses used in production.
 const lookupClock=svm.getClock();lookupClock.slot=100n;svm.setClock(lookupClock);
 const [createLookup,lookupKey]=AddressLookupTableProgram.createLookupTable({authority:creator.publicKey,payer:creator.publicKey,recentSlot:0});
 send([createLookup],[creator]);
 send([AddressLookupTableProgram.extendLookupTable({lookupTable:lookupKey,authority:creator.publicKey,payer:creator.publicKey,addresses:rewardLookupAddresses(program)})],[creator]);
 send([AddressLookupTableProgram.freezeLookupTable({lookupTable:lookupKey,authority:creator.publicKey})],[creator]);
 lookupClock.slot=101n;svm.setClock(lookupClock);
 launchLookup=new AddressLookupTableAccount({key:lookupKey,state:AddressLookupTableAccount.deserialize(account(lookupKey).data)});
 send([...created.instructions,createRewardVaultInstruction({programId:program,mint:mint.publicKey,quoteMint:quote,creator:creator.publicKey,cycleSeconds})],[creator,config,mint],true,500000);
 const source=getAssociatedTokenAddressSync(a.quoteMint,creator.publicKey,false,TOKEN_2022_PROGRAM_ID),data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint:a.quoteMint,owner:creator.publicKey,amount:500_000_000_000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);put(source,TOKEN_2022_PROGRAM_ID,data);
 const pool=deriveDbcPoolAddress(a.quoteMint,mint.publicKey,config.publicKey);
 const swap=await sdk.pool.swap({owner:creator.publicKey,amountIn:new BN('20000000000'),minimumAmountOut:new BN(1),swapBaseForQuote:false,pool,referralTokenAccount:null});send(swap.instructions,[creator]);
 const beforeClaim=unpackAccount(a.quoteVault,account(a.quoteVault),TOKEN_2022_PROGRAM_ID).amount;
 assert.equal(beforeClaim,0n);
 let graduatedPool,migration;
 const amm=new CpAmm(connection);
 if(migrated){
  const finish=await sdk.pool.swap2({swapMode:SwapMode.PartialFill,owner:creator.publicKey,amountIn:new BN('200000000000'),minimumAmountOut:new BN(1),swapBaseForQuote:false,pool,referralTokenAccount:null});send(finish.instructions,[creator]);
  const fixture=JSON.parse(readFileSync('test/fixtures/damm-migration-config.json','utf8'));put(new PublicKey(fixture.address),new PublicKey(fixture.owner),Buffer.from(fixture.data,'base64'),BigInt(fixture.lamports));
  // Model the protocol-funded migration authority; this is not reward funding.
  svm.airdrop(deriveDbcPoolAuthority().toBase58(),2_000_000_000n);
  const dammConfig=DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.FixedBps100];
  migration=await sdk.migration.migrateToDammV2({payer:creator.publicKey,pool,dammConfig});
  send(migration.transaction.instructions.filter(ix=>!ix.programId.equals(ComputeBudgetProgram.programId)),[creator,migration.firstPositionNftKeypair,migration.secondPositionNftKeypair]);
  graduatedPool=deriveDammV2PoolAddress(dammConfig,mint.publicKey,a.quoteMint);
  const afterMigration=svm.getClock();afterMigration.unixTimestamp+=60n;afterMigration.slot+=100n;svm.setClock(afterMigration);
  const state=await amm.fetchPoolState(graduatedPool);
  const trade=await amm.swap({payer:creator.publicKey,pool:graduatedPool,inputTokenMint:a.quoteMint,outputTokenMint:mint.publicKey,amountIn:new BN('20000000000'),minimumAmountOut:new BN(1),tokenAMint:mint.publicKey,tokenBMint:a.quoteMint,tokenAVault:state.tokenAVault,tokenBVault:state.tokenBVault,tokenAProgram:TOKEN_2022_PROGRAM_ID,tokenBProgram:TOKEN_2022_PROGRAM_ID,referralTokenAccount:null,poolState:state});send(trade.instructions,[creator]);
  connection.getTokenAccountsByOwner=async owner=>({value:[migration.firstPositionNftKeypair,migration.secondPositionNftKeypair].map(k=>derivePositionNftAccount(k.publicKey)).map(pubkey=>({pubkey,account:account(pubkey)})).filter(x=>x.account&&AccountLayout.decode(x.account.data).owner.equals(owner))});
 }
 const curveService={sdk,amm,inspect:async()=>({pool:pool.toBase58(),config:await sdk.state.getPoolConfig(config.publicKey),migrated,graduatedPool:graduatedPool?.toBase58()})};
 const dbcFees=BigInt((await sdk.state.getPool(pool)).poolState.partnerQuoteFee.toString());
 const claim=await rewardFeeInstructions({connection,programId:program,mint:mint.publicKey,quoteMint:quote,payer:keeper.publicKey,metadata:{},curveService});send(claim);
 const collected=unpackAccount(a.quoteVault,account(a.quoteVault),TOKEN_2022_PROGRAM_ID).amount;
 assert.ok(collected>=100_000_000n,'Actual trading fees must fund the round');
 if(migrated)assert.ok(collected>dbcFees,'Graduated DAMM trading fees must add to the collected DBC fees');
 else assert.equal(collected,dbcFees);
 const orao=new Orao({connection:{},publicKey:keeper.publicKey});
 send([await orao.methods.initNetwork(new BN(10000),keeper.publicKey,[oracle.publicKey],null).accountsPartial({payer:keeper.publicKey,networkState:networkStateAccountAddress(),treasury:treasury.publicKey,systemProgram:SystemProgram.programId}).instruction()]);
 const clock=svm.getClock();clock.unixTimestamp+=BigInt(cycleSeconds+1);clock.slot=1000n;svm.setClock(clock);
 const tree=snapshotTree({vault:a.vault.toBase58(),sequence:'0',holders:holders.map(x=>({wallet:x.publicKey.toBase58(),balance:'1000000'}))});
 const args={programId:program,mint:mint.publicKey,quoteMint:quote,sequence:0,root:tree.root,count:tree.entries.length,slot:1000,keeper:keeper.publicKey,treasury:treasury.publicKey};
 const wrong=beginRoundInstruction({...args,keeper:creator.publicKey});send([wrong.instruction],[creator],false);
 const begin=beginRoundInstruction(args);send([begin.instruction]);const round=decodeRound(account(a.round),program);assert.equal(round.root,tree.root);assert.equal(round.baseReward,'0');assert.equal(decodeVault(account(a.vault),program).pending,true);
 send([begin.instruction],[keeper],false); // A committed round cannot be rerolled.
 const fulfill=await orao.methods.fulfillV2().accountsPartial({payer:keeper.publicKey,instructionAcc:SYSVAR_INSTRUCTIONS_PUBKEY,networkState:networkStateAccountAddress(),request:begin.randomness,client:keeper.publicKey,systemProgram:SystemProgram.programId}).instruction();
 send([Ed25519Program.createInstructionWithPrivateKey({privateKey:oracle.secretKey,message:begin.seed}),fulfill]);
 const fulfilled=orao.coder.accounts.decode('randomnessV2',account(begin.randomness).data).request.fulfilled[0];const index=winnerIndex(fulfilled.randomness,tree.entries.length),winner=tree.entries[index];
 const settleArgs={programId:program,mint:mint.publicKey,quoteMint:quote,sequence:0,randomness:begin.randomness,winner:winner.wallet,index,balance:winner.balance,proof:tree.proof(index),payer:keeper.publicKey};
 send([settleRoundInstruction({...settleArgs,balance:'2000000'})],[keeper],false);
 const other=tree.entries[(index+1)%tree.entries.length];send([settleRoundInstruction({...settleArgs,winner:other.wallet,index:other.index,balance:other.balance,proof:tree.proof(other.index)})],[keeper],false);
 const before=svm.getBalance(winner.wallet);send([settleRoundInstruction(settleArgs)]);
 const paid=decodeRound(account(a.round),program);assert.equal(paid.paid,true);assert.equal(paid.winner,winner.wallet);
 if(quote===NATIVE_MINT.toBase58())assert.equal(svm.getBalance(winner.wallet)-before,20_000_000n);
 else {const ata=getAssociatedTokenAddressSync(a.quoteMint,new PublicKey(winner.wallet),false,TOKEN_2022_PROGRAM_ID);assert.equal(unpackAccount(ata,account(ata),TOKEN_2022_PROGRAM_ID).amount,collected);}
 const baseAta=getAssociatedTokenAddressSync(mint.publicKey,new PublicKey(winner.wallet),false,TOKEN_2022_PROGRAM_ID);assert.equal(unpackAccount(baseAta,account(baseAta),TOKEN_2022_PROGRAM_ID).amount,0n);
 const vault=decodeVault(account(a.vault),program);assert.equal(vault.sequence,'1');assert.equal(vault.pending,false);assert.equal(vault.nextDue,Number(clock.unixTimestamp)+cycleSeconds);
 send([settleRoundInstruction(settleArgs)],[keeper],false); // Cannot pay twice.
});
