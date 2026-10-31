import {createHash} from 'node:crypto';
import {CpAmm} from '@meteora-ag/cp-amm-sdk';
import {PublicKey,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint} from '@solana/spl-token';
import {DynamicBondingCurveClient,buildCurve,TokenType,TokenAuthorityOption,ActivationType,BaseFeeMode,CollectFeeMode,MigrationOption,MigrationFeeOption,deriveTokenBadgeAddress,deriveDbcPoolAddress,deriveDammV2PoolAddress,DAMM_V2_MIGRATION_FEE_ADDRESS,DYNAMIC_BONDING_CURVE_PROGRAM_ID,getCurrentPoint,getSwapQuoteTransferFees} from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import {uiToRaw} from './stocks.js';

export const BABA='BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp';
export const BABA_ENGINE='meteora-dbc';
const quoteMint=new PublicKey(BABA),badge=deriveTokenBadgeAddress(quoteMint);
const fail=message=>Object.assign(new Error(message),{status:422});
export function babaCurveParameters(threshold=100){
 if(!Number.isFinite(threshold)||threshold<1||threshold>1000000)throw fail('BABA graduation target must be between 1 and 1,000,000 BABA');
 return buildCurve({
  token:{tokenType:TokenType.Token2022,tokenBaseDecimal:6,tokenQuoteDecimal:6,tokenAuthorityOption:TokenAuthorityOption.Immutable,totalTokenSupply:1_000_000_000,leftover:0},
  fee:{baseFeeParams:{baseFeeMode:BaseFeeMode.FeeSchedulerLinear,feeSchedulerParam:{startingFeeBps:100,endingFeeBps:100,numberOfPeriod:0,totalDuration:0}},dynamicFeeEnabled:false,collectFeeMode:CollectFeeMode.QuoteToken,creatorTradingFeePercentage:100,poolCreationFee:0,enableFirstSwapWithMinFee:false},
  migration:{migrationOption:MigrationOption.MET_DAMM_V2,migrationFeeOption:MigrationFeeOption.FixedBps100,migrationFee:{feePercentage:0,creatorFeePercentage:0}},
  liquidityDistribution:{partnerLiquidityPercentage:0,partnerPermanentLockedLiquidityPercentage:0,creatorLiquidityPercentage:0,creatorPermanentLockedLiquidityPercentage:100},
  lockedVesting:{totalLockedVestingAmount:0,numberOfVestingPeriod:0,cliffUnlockAmount:0,totalVestingDuration:0,cliffDurationFromMigrationTime:0},
  activationType:ActivationType.Timestamp,percentageSupplyOnMigration:20,migrationQuoteThreshold:threshold
 });
}

export function babaService(pump,{threshold=Number(process.env.BABA_GRADUATION_TARGET||100),client}={}){
 const c=pump.connection,sdk=client||new DynamicBondingCurveClient(c,'confirmed');
 const curve=babaCurveParameters(threshold),amm=new CpAmm(c);
 async function readiness(){
  await pump.assertMainnet();
  const [account,approved]=await Promise.all([c.getParsedAccountInfo(quoteMint,'confirmed'),c.getAccountInfo(badge,'confirmed')]);
  const info=account.value?.data?.parsed?.info;
  if(!account.value?.owner.equals(TOKEN_2022_PROGRAM_ID)||!info?.isInitialized||info.decimals!==6||info.extensions?.find(x=>x.extension==='tokenMetadata')?.state?.symbol!=='BABA')throw fail('Backpack BABA mint verification failed');
  if(!approved?.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)||approved.data.length!==168||!approved.data.subarray(0,8).equals(createHash('sha256').update('account:TokenBadge').digest().subarray(0,8))||!approved.data.subarray(8,40).equals(quoteMint.toBuffer()))throw fail('BABA approval is unavailable on Meteora DBC');
  const ext=info.extensions||[];
  if(ext.find(x=>x.extension==='pausableConfig')?.state?.paused)throw fail('The issuer has paused BABA transfers');
  if(ext.find(x=>x.extension==='transferHook')?.state?.programId||ext.some(x=>['transferFeeConfig','nonTransferable','interestBearingConfig'].includes(x.extension)))throw fail('BABA transfer rules changed; integration review required');
  const scaled=ext.find(x=>x.extension==='scaledUiAmountConfig')?.state;
  const multiplier=scaled?(Number(scaled.newMultiplierEffectiveTimestamp)<=Date.now()/1000?scaled.newMultiplier:scaled.multiplier):'1';
  if(!(Number(multiplier)>0))throw fail('Invalid BABA multiplier');
  return {mint:BABA,engine:BABA_ENGINE,decimals:6,multiplier:String(multiplier),graduationTarget:threshold*Number(multiplier),initialLiquidityRequired:false,tradeFeeBps:100,platformFeeBps:0,liquidityLocked:true};
 }
 async function create({wallet,mint,curveConfig,name,symbol,uri}){
  const ready=await readiness(),payer=new PublicKey(wallet),base=new PublicKey(mint),config=new PublicKey(curveConfig);
  if(new Set([wallet,mint,curveConfig]).size!==3)throw fail('Creator, mint and curve configuration must be distinct');
  if((await c.getMultipleAccountsInfo([base,config])).some(Boolean))throw fail('Mint or curve configuration already exists');
  const tx=await sdk.partner.createConfigAndPool({...curve,payer,config,feeClaimer:payer,leftoverReceiver:payer,quoteMint,tokenBadge:badge,preCreatePoolParam:{baseMint:base,name,symbol,uri,poolCreator:payer}});
  return {...await pump.assemble(wallet,tx.instructions),quote:{...ready,quoteAsset:'BABA',quoteMint:BABA,curveConfig,pool:deriveDbcPoolAddress(quoteMint,base,config).toBase58(),baseSupply:'1000000000000000',baseDecimals:6,quoteDecimals:6,quoteMultiplier:ready.multiplier,initialQuoteDeposit:'0',creatorFeeSharePercent:100,graduationTargetRaw:curve.migrationQuoteThreshold.toString()}};
 }
 async function inspect(mint,metadata){
  const ready=await readiness();
  const base=new PublicKey(mint),configKey=new PublicKey(metadata.curveConfig),pool=deriveDbcPoolAddress(quoteMint,base,configKey);
  const [virtualPool,config,mintAccount]=await Promise.all([sdk.state.getPool(pool),sdk.state.getPoolConfig(configKey),c.getAccountInfo(base,'confirmed')]);
  const state=virtualPool?.poolState;
  if(!state?.baseMint.equals(base)||!state.config.equals(configKey)||!config?.quoteMint.equals(quoteMint)||metadata.pool!==pool.toBase58())throw fail('BABA curve identity mismatch');
  const supply=unpackMint(base,mintAccount,TOKEN_2022_PROGRAM_ID).supply;
  const complete=state.quoteReserve.gte(config.migrationQuoteThreshold),migrated=!!state.isMigrated;
  return {engine:BABA_ENGINE,solQuoted:false,mint,decimals:6,supply:supply.toString(),complete,migrated,quoteMint:BABA,quoteDecimals:6,quoteMultiplier:ready.multiplier,quoteSymbol:'BABA',creator:state.creator.toBase58(),pool:pool.toBase58(),curveConfig:configKey.toBase58(),graduatedPool:deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption],base,quoteMint).toBase58(),liquidityLocked:true,graduationTargetRaw:config.migrationQuoteThreshold.toString(),realQuoteReserves:state.quoteReserve.toString(),progress:Math.min(1,Number(state.quoteReserve)/Number(config.migrationQuoteThreshold)),virtualPool,config,ready,baseVault:state.baseVault.toBase58(),quoteVault:state.quoteVault.toBase58()};
 }
 async function trade({wallet,mint,side,amountUi,slippageBps},metadata){
  const info=await inspect(mint,metadata);
  if(info.migrated)return tradeGraduated({wallet,mint,side,amountUi,slippageBps},info);
  if(info.complete)throw fail('Curve complete. Graduate the pool or use its graduated trading route.');
  const input=uiToRaw(amountUi,6,side==='buy'?info.quoteMultiplier:'1');
  const quote=sdk.pool.swapQuote({virtualPool:info.virtualPool,config:info.config,swapBaseForQuote:side==='sell',amountIn:new BN(input),slippageBps,hasReferral:false,currentPoint:await getCurrentPoint(c,info.config.activationType),...await getSwapQuoteTransferFees(c,info.config)});
  if(quote.minimumAmountOut.lten(0))throw fail('Trade amount is too small');
  const tx=await sdk.pool.swap({owner:new PublicKey(wallet),amountIn:new BN(input),minimumAmountOut:quote.minimumAmountOut,swapBaseForQuote:side==='sell',pool:new PublicKey(info.pool),referralTokenAccount:null});
  return {...await pump.assemble(wallet,tx.instructions),quote:{side,inputAmount:input,outputAmount:quote.excludedTransferFeeAmountOut.toString(),minimumOutputAmount:quote.minimumAmountOut.toString(),inputDecimals:6,outputDecimals:6,inputMultiplier:side==='buy'?info.quoteMultiplier:'1',outputMultiplier:side==='buy'?'1':info.quoteMultiplier,inputSymbol:side==='buy'?'BABA':'tokens',outputSymbol:side==='buy'?'tokens':'BABA',slippageBps,poolTradeFeeBps:100,platformFeeBps:0}};
 }
 async function tradeGraduated({wallet,mint,side,amountUi,slippageBps},info){
  const pool=new PublicKey(info.graduatedPool),state=await amm.fetchPoolState(pool),base=new PublicKey(mint),buy=side==='buy';
  if(!state.tokenAMint.equals(base)||!state.tokenBMint.equals(quoteMint))throw fail('Graduated BABA pool identity mismatch');
  const inputMint=buy?quoteMint:base,outputMint=buy?base:quoteMint,input=uiToRaw(amountUi,6,buy?info.quoteMultiplier:'1');
  const [epoch,slot,mints]=await Promise.all([c.getEpochInfo('confirmed'),c.getSlot('confirmed'),c.getMultipleAccountsInfo([inputMint,outputMint])]);
  const currentTime=await c.getBlockTime(slot);if(!currentTime)throw fail('Chain time unavailable');
  const quote=amm.getQuote({inAmount:new BN(input),inputTokenMint:inputMint,slippage:slippageBps/100,poolState:state,currentTime,currentSlot:slot,inputTokenInfo:{mint:unpackMint(inputMint,mints[0],TOKEN_2022_PROGRAM_ID),currentEpoch:epoch.epoch},outputTokenInfo:{mint:unpackMint(outputMint,mints[1],TOKEN_2022_PROGRAM_ID),currentEpoch:epoch.epoch},tokenADecimal:6,tokenBDecimal:6,hasReferral:false});
  if(quote.minSwapOutAmount.lten(0))throw fail('Trade amount is too small');
  const tx=await amm.swap({payer:new PublicKey(wallet),pool,inputTokenMint:inputMint,outputTokenMint:outputMint,amountIn:new BN(input),minimumAmountOut:quote.minSwapOutAmount,tokenAMint:base,tokenBMint:quoteMint,tokenAVault:state.tokenAVault,tokenBVault:state.tokenBVault,tokenAProgram:TOKEN_2022_PROGRAM_ID,tokenBProgram:TOKEN_2022_PROGRAM_ID,referralTokenAccount:null,poolState:state});
  return {...await pump.assemble(wallet,tx.instructions),quote:{side,inputAmount:input,outputAmount:quote.swapOutAmount.toString(),minimumOutputAmount:quote.minSwapOutAmount.toString(),inputDecimals:6,outputDecimals:6,inputMultiplier:buy?info.quoteMultiplier:'1',outputMultiplier:buy?'1':info.quoteMultiplier,inputSymbol:buy?'BABA':'tokens',outputSymbol:buy?'tokens':'BABA',slippageBps,poolTradeFeeBps:100,platformFeeBps:0}};
 }
 async function graduate({wallet,mint},metadata){
  const info=await inspect(mint,metadata);
  if(!info.complete||info.migrated)throw fail('Pool is not awaiting graduation');
  const out=await sdk.migration.migrateToDammV2({payer:new PublicKey(wallet),pool:new PublicKey(info.pool),dammConfig:DAMM_V2_MIGRATION_FEE_ADDRESS[info.config.migrationFeeOption]});
  const built=await pump.assemble(wallet,out.transaction.instructions.filter(ix=>!ix.programId.equals(ComputeBudgetProgram.programId)),{computeUnits:1400000});
  // These signatures only create position NFT accounts. The connected wallet
  // remains the payer and must approve; no wallet key is held by the server.
  const tx=VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'));
  tx.sign([out.firstPositionNftKeypair,out.secondPositionNftKeypair]);
  return {...built,transaction:Buffer.from(tx.serialize()).toString('base64'),quote:{pool:info.graduatedPool,quoteAsset:'BABA',liquidityLocked:true}};
 }
 return {readiness,create,inspect,trade,graduate,sdk,amm};
}
