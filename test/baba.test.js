import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Connection,ComputeBudgetProgram,Keypair,PublicKey,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {BorshEventCoder} from '@coral-xyz/anchor';
import {DynamicBondingCurveClient,DAMM_V2_MIGRATION_FEE_ADDRESS,DynamicBondingCurveIdl,DYNAMIC_BONDING_CURVE_PROGRAM_ID} from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import {BABA,babaService,babaCurveParameters} from '../server/baba.js';
import {decodeBabaTrades} from '../server/baba-market.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/baba-mainnet-accounts.json',import.meta.url))).result.value.map(a=>({...a,owner:new PublicKey(a.owner),data:Buffer.from(a.data[0],'base64')}));
function fixture(){let paused=false;const connection={rpcEndpoint:'https://example.test',getParsedAccountInfo:async()=>({value:{owner:fixtures[0].owner,data:{parsed:{info:{decimals:6,isInitialized:true,extensions:[{extension:'tokenMetadata',state:{symbol:'BABA'}},{extension:'pausableConfig',state:{paused}}]}}}}}),getAccountInfo:async key=>key.toBase58()===BABA?fixtures[0]:fixtures[1],getMultipleAccountsInfo:async()=>[null,null],getEpochInfo:async()=>({epoch:1000})};let instructions;const service=babaService({connection,assertMainnet:async()=>{},assemble:async(wallet,ix)=>{instructions=ix;const tx=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(wallet),recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:ix}).compileToV0Message());return {transaction:Buffer.from(tx.serialize()).toString('base64')}}});return {service,pause:()=>paused=true,getInstructions:()=>instructions};}
test('BABA launch builds official atomic config + curve with no quote deposit and three signers',async()=>{
 const f=fixture(),wallet=Keypair.generate(),mint=Keypair.generate(),config=Keypair.generate();
 const built=await f.service.create({wallet:wallet.publicKey.toBase58(),mint:mint.publicKey.toBase58(),curveConfig:config.publicKey.toBase58(),name:'哈基米',symbol:'哈基米',uri:'https://tryfafa.xyz/metadata/example'});
 const tx=VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'));
 assert.equal(tx.message.header.numRequiredSignatures,3);assert.ok(Buffer.from(built.transaction,'base64').length<1232);
 const signers=tx.message.staticAccountKeys.slice(0,3).map(k=>k.toBase58());for(const k of [wallet,mint,config])assert.ok(signers.includes(k.publicKey.toBase58()));
 assert.equal(built.quote.initialQuoteDeposit,'0');assert.equal(built.quote.quoteMint,BABA);assert.equal(built.quote.graduationTargetRaw,'100000000');
 assert.equal(f.getInstructions().length,2);assert.ok(f.getInstructions().every(ix=>ix.programId.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)));
});
test('curve uses immutable metadata, locked graduated liquidity and refuses paused BABA',async()=>{
 const curve=babaCurveParameters();assert.equal(curve.creatorPermanentLockedLiquidityPercentage,100);assert.equal(curve.creatorLiquidityPercentage,0);assert.equal(curve.tokenUpdateAuthority,1);assert.equal(curve.migrationQuoteThreshold.toString(),'100000000');
 assert.throws(()=>babaCurveParameters(-1));const f=fixture();f.pause();await assert.rejects(f.service.readiness,/paused/);
});
test('BABA trade decoder validates program, pool, direction and failed transactions',()=>{
 const pool=Keypair.generate().publicKey,wallet=Keypair.generate().publicKey,config=Keypair.generate().publicKey;
 const coder=new BorshEventCoder(DynamicBondingCurveIdl),def=DynamicBondingCurveIdl.events.find(x=>x.name==='EvtSwap3'),body=Buffer.alloc(512);
 const data={pool,config,trade_direction:1,swap_mode:0,has_referral:false,fee_on_base_token:false,included_transfer_fee_amount_in:new BN(1000000),excluded_transfer_fee_amount_in:new BN(1000000),included_transfer_fee_amount_out:new BN(2000000),excluded_transfer_fee_amount_out:new BN(2000000),trading_fee:new BN(10000),protocol_fee:new BN(2000),referral_fee:new BN(0),next_sqrt_price:new BN(1),quote_reserve:new BN(1000000),current_timestamp:new BN(123)};
 const length=coder.layouts.get('EvtSwap3').layout.encode(data,body),encoded=Buffer.concat([Buffer.from(def.discriminator),body.subarray(0,length)]).toString('base64');
 const ix=DynamicBondingCurveIdl.instructions.find(x=>x.name==='swap'),keys=[DYNAMIC_BONDING_CURVE_PROGRAM_ID,pool,wallet],accounts=Array(ix.accounts.length).fill(0);accounts[2]=1;accounts[9]=2;
 const tx={slot:1,blockTime:123,transaction:{message:{getAccountKeys:()=>({get:i=>keys[i]}),compiledInstructions:[{programIdIndex:0,accountKeyIndexes:accounts,data:Buffer.from(ix.discriminator)}]}},meta:{err:null,logMessages:[`Program ${keys[0]} invoke [1]`,'Program data: '+encoded,`Program ${keys[0]} success`]}};
 const opts={pool:pool.toBase58(),signature:'sig'};const trades=decodeBabaTrades(tx,opts);assert.equal(trades.length,1);assert.equal(trades[0].side,'buy');assert.equal(trades[0].quoteAmount,1);assert.equal(trades[0].tokenAmount,2);assert.equal(trades[0].wallet,wallet.toBase58());
 assert.equal(decodeBabaTrades(tx,{...opts,pool:config.toBase58()}).length,0);tx.meta.err={};assert.equal(decodeBabaTrades(tx,opts).length,0);
});

test('official graduation transaction fits one packet and only NFT signers are server-generated',async()=>{
 const key=()=>Keypair.generate().publicKey,sdk=new DynamicBondingCurveClient(new Connection('https://example.test'));
 sdk.migration.getPoolWithConfig=async()=>({virtualPool:{poolState:{baseMint:key(),config:key(),baseVault:key(),quoteVault:key()}},poolConfigState:{...babaCurveParameters(),quoteMint:new PublicKey(BABA),quoteTokenFlag:1}});
 sdk.migration.assertDammV2MigrationTransferFee=async()=>{};
 const payer=key(),out=await sdk.migration.migrateToDammV2({payer,pool:key(),dammConfig:DAMM_V2_MIGRATION_FEE_ADDRESS[2]});
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:key().toBase58(),instructions:[...out.transaction.instructions,ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000})]}).compileToV0Message());
 assert.ok(tx.serialize().length<=1232);assert.equal(tx.message.header.numRequiredSignatures,3);tx.sign([out.firstPositionNftKeypair,out.secondPositionNftKeypair]);assert.ok(tx.signatures[0].every(b=>b===0));assert.ok(tx.signatures.slice(1).every(s=>s.some(b=>b!==0)));
});

test('FAFA quote builds against the exact mint without a deposit and rejects unsafe authorities',async()=>{
 const a=JSON.parse(readFileSync(new URL('./fixtures/fafa-quote-mint.json',import.meta.url)));let unsafe=false;
 const connection={getParsedAccountInfo:async()=>({value:{owner:new PublicKey(a.owner),data:{parsed:{info:{...a.info,...(unsafe?{freezeAuthority:Keypair.generate().publicKey.toBase58()}:{})}}}}}),getAccountInfo:async()=>({owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64')}),getEpochInfo:async()=>({epoch:1000}),getMultipleAccountsInfo:async()=>[null,null]};
 const service=babaService({connection,assertMainnet:async()=>{},assemble:async(wallet,instructions)=>{const tx=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(wallet),recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions}).compileToV0Message());assert.equal(tx.message.header.numRequiredSignatures,3);assert.ok(tx.serialize().length<=1232);return {transaction:Buffer.from(tx.serialize()).toString('base64')}}},{quoteAsset:'FAFA'});
 const built=await service.create({wallet:Keypair.generate().publicKey.toBase58(),mint:Keypair.generate().publicKey.toBase58(),curveConfig:Keypair.generate().publicKey.toBase58(),name:'发',symbol:'发',uri:'https://tryfafa.xyz/metadata/test'});
 assert.equal(built.quote.quoteMint,'CcSRXUReR3VVG92C4rE8FqsLomzwmH6Dn1WhTGebpump');assert.equal(built.quote.quoteAsset,'FAFA');assert.equal(built.quote.initialQuoteDeposit,'0');assert.equal(built.quote.graduationTargetRaw,'10000000000000');unsafe=true;await assert.rejects(service.readiness,/authorities/);
});
