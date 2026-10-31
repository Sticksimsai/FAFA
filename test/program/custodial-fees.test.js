import {custodialFeeGroups,payoutInstructions} from '../../server/custodial-reward-worker.js';
// Executes pinned Meteora programs; no custom reward program is loaded.
// Synthetic mint funding/config accounts are local fixtures, never mainnet state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiteSVM,FailedTransactionMetadata} from 'litesvm';
import {getTransactionDecoder} from '@solana/kit';
import {Keypair,PublicKey,SystemProgram,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,AddressLookupTableProgram,AddressLookupTableAccount,Ed25519Program,SYSVAR_INSTRUCTIONS_PUBKEY} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,NATIVE_MINT,MintLayout,AccountLayout,createInitializeMint2Instruction,createMintToInstruction,createTransferCheckedInstruction,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
import BN from 'bn.js';
import {DynamicBondingCurveClient,DYNAMIC_BONDING_CURVE_PROGRAM_ID,deriveDbcPoolAddress,deriveDammV2PoolAddress,DAMM_V2_MIGRATION_FEE_ADDRESS,MigrationFeeOption,SwapMode,deriveDbcPoolAuthority} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {CpAmm,CP_AMM_PROGRAM_ID,derivePositionNftAccount} from '@meteora-ag/cp-amm-sdk';
import {babaCurveParameters} from '../../server/baba.js';
import {FAFA_QUOTE_MINT} from '../../shared/quote-assets.js';
for(const migrated of [false,true])for(const cycleSeconds of [3600])for(const quote of [FAFA_QUOTE_MINT])test(`custodial wallet: ${quote===FAFA_QUOTE_MINT?'FAFA':'SOL'} ${cycleSeconds}s DBC ${migrated?'graduated':'curve'} trade → claim fees → payout`,async()=>{
 const svm=new LiteSVM().withNativeMints();svm.addProgramFromFile(DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58(),'test/program/fixtures/dbc-mainnet.so');svm.addProgramFromFile(CP_AMM_PROGRAM_ID.toBase58(),'test/program/fixtures/damm-mainnet.so');
 const creator=Keypair.generate(),keeper=Keypair.generate(),oracle=Keypair.generate(),treasury=Keypair.generate(),mint=Keypair.generate(),holders=[Keypair.generate(),Keypair.generate(),Keypair.generate()];
 for(const k of [creator,keeper,treasury,...holders])svm.airdrop(k.publicKey.toBase58(),50_000_000_000n);
 const account=k=>{const a=svm.getAccount(k.toBase58());return a.exists?{owner:new PublicKey(a.programAddress),data:Buffer.from(a.data),lamports:Number(a.lamports)}:null};
 const put=(key,owner,data,lamports)=>svm.setAccount({address:key.toBase58(),programAddress:owner.toBase58(),data,lamports:lamports??svm.minimumBalanceForRentExemption(BigInt(data.length)),executable:false});
 const send=(ix,signers=[keeper],ok=true,computeUnits=1_200_000)=>{svm.expireBlockhash();const tx=new VersionedTransaction(new TransactionMessage({payerKey:signers[0].publicKey,recentBlockhash:svm.latestBlockhash(),instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:computeUnits}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...ix]}).compileToV0Message());tx.sign(signers);assert.ok(tx.serialize().length<=1232,`Transaction exceeds packet limit: ${tx.serialize().length}`);const result=svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));if(ok)assert.ok(!(result instanceof FailedTransactionMetadata),result instanceof FailedTransactionMetadata?JSON.stringify({error:result.err(),logs:result.meta().logs()}):'');else assert.ok(result instanceof FailedTransactionMetadata,'Expected the contract to reject this transaction');return result};
 const rewardSigner=Keypair.generate();
 const a={vault:rewardSigner.publicKey,quoteMint:new PublicKey(quote),quoteVault:getAssociatedTokenAddressSync(new PublicKey(quote),rewardSigner.publicKey,false,TOKEN_2022_PROGRAM_ID)};
 const f=JSON.parse(readFileSync('test/fixtures/fafa-quote-mint.json','utf8'));put(a.quoteMint,new PublicKey(f.owner),Buffer.from(f.data,'base64'));
 const connection={commitment:'confirmed',getAccountInfo:async k=>account(k),getMultipleAccountsInfo:async keys=>keys.map(account),getMultipleAccountsInfoAndContext:async keys=>({context:{slot:Number(svm.getClock().slot)},value:keys.map(account)}),getSlot:async()=>Number(svm.getClock().slot),getBlockTime:async()=>Number(svm.getClock().unixTimestamp),getEpochInfo:async()=>({epoch:0}),getAccountInfoAndContext:async k=>({context:{slot:Number(svm.getClock().slot)},value:account(k)})};
 const sdk=new DynamicBondingCurveClient(connection,'confirmed'),config=Keypair.generate();
 const created=await sdk.partner.createConfigAndPool({...babaCurveParameters(100000,{rewardVault:true}),payer:creator.publicKey,config:config.publicKey,feeClaimer:a.vault,leftoverReceiver:creator.publicKey,quoteMint:a.quoteMint,preCreatePoolParam:{baseMint:mint.publicKey,name:'发'.repeat(10)+'FA',symbol:'测试币',uri:'https://tryfafa.xyz/api/metadata/'+mint.publicKey.toBase58(),poolCreator:creator.publicKey}});
 send(created.instructions,[creator,config,mint],true,500000);
 const source=getAssociatedTokenAddressSync(a.quoteMint,creator.publicKey,false,TOKEN_2022_PROGRAM_ID),data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint:a.quoteMint,owner:creator.publicKey,amount:500_000_000_000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);put(source,TOKEN_2022_PROGRAM_ID,data);
 const pool=deriveDbcPoolAddress(a.quoteMint,mint.publicKey,config.publicKey);
 const swap=await sdk.pool.swap({owner:creator.publicKey,amountIn:new BN('20000000000'),minimumAmountOut:new BN(1),swapBaseForQuote:false,pool,referralTokenAccount:null});send(swap.instructions,[creator]);
 const beforeClaim=account(a.quoteVault)?unpackAccount(a.quoteVault,account(a.quoteVault),TOKEN_2022_PROGRAM_ID).amount:0n;
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
 const record={mint:mint.publicKey.toBase58(),metadata:{redEnvelope:{quoteMint:quote}}};
 const groups=await custodialFeeGroups({connection,wallet:rewardSigner,operator:keeper,record,curveService});for(const group of groups)send(group,[keeper,rewardSigner]);
 const collected=unpackAccount(a.quoteVault,account(a.quoteVault),TOKEN_2022_PROGRAM_ID).amount;
 assert.ok(collected>=100_000_000n,'Actual trading fees must fund the round');
 if(migrated)assert.ok(collected>dbcFees,'Graduated DAMM trading fees must add to the collected DBC fees');
 else assert.equal(collected,dbcFees);
 const winner=holders[0].publicKey;
 const payout=payoutInstructions({wallet:a.vault,operator:keeper.publicKey,mint:mint.publicKey,quoteMint:quote,winner,reward:collected,baseReward:0n});
 send(payout,[keeper,rewardSigner]);
 assert.equal(unpackAccount(getAssociatedTokenAddressSync(a.quoteMint,winner,false,TOKEN_2022_PROGRAM_ID),account(getAssociatedTokenAddressSync(a.quoteMint,winner,false,TOKEN_2022_PROGRAM_ID)),TOKEN_2022_PROGRAM_ID).amount,collected);
 assert.equal(unpackAccount(a.quoteVault,account(a.quoteVault),TOKEN_2022_PROGRAM_ID).amount,0n);
 send(payout,[keeper,rewardSigner],false);
});
