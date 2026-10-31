// Protocol fee accounts are seeded: this tests collection, not Pump trade accrual.
import test from 'node:test';
import assert from 'node:assert/strict';
import {LiteSVM,FailedTransactionMetadata} from 'litesvm';
import {getTransactionDecoder} from '@solana/kit';
import {Keypair,PublicKey,SystemProgram,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,NATIVE_MINT,createSyncNativeInstruction,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
import {OnlinePumpSdk} from '@pump-fun/pump-sdk';
import {custodialFeeGroups,payoutInstructions,unwrapCustodialSolInstructions} from '../../server/custodial-reward-worker.js';
for(const stage of ['curve','pool','both'])test(`custodial SOL: ${stage} fees → collect → unwrap → pay`,async()=>{
 const svm=new LiteSVM().withNativeMints();
 for(const [id,file] of [['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P','pump'],['pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA','pump-amm']])svm.addProgramFromFile(id,`test/program/fixtures/${file}-mainnet.so`);
 const payer=Keypair.generate(),wallet=Keypair.generate(),donor=Keypair.generate(),winner=Keypair.generate();for(const k of [payer,donor,winner])svm.airdrop(k.publicKey.toBase58(),2_000_000_000n);
 const account=k=>{const a=svm.getAccount(k.toBase58());return a.exists?{owner:new PublicKey(a.programAddress),data:Buffer.from(a.data),lamports:Number(a.lamports)}:null;};
 const send=(ix,signers=[payer])=>{svm.expireBlockhash();const tx=new VersionedTransaction(new TransactionMessage({payerKey:signers[0].publicKey,recentBlockhash:svm.latestBlockhash(),instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:1200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...ix]}).compileToV0Message());assert.ok(tx.serialize().length<=1232);const required=new Set(tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures).map(k=>k.toBase58()));tx.sign(signers.filter(k=>required.has(k.publicKey.toBase58())));const r=svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));assert.ok(!(r instanceof FailedTransactionMetadata),r instanceof FailedTransactionMetadata?JSON.stringify(r.meta().logs()):'');};
 const connection={getMultipleAccountsInfo:async keys=>keys.map(account)};
 const ix=await new OnlinePumpSdk(connection).collectCoinCreatorFeeInstructions(wallet.publicKey,payer.publicKey);
 send([SystemProgram.transfer({fromPubkey:donor.publicKey,toPubkey:ix[0].keys[1].pubkey,lamports:Number(svm.minimumBalanceForRentExemption(0n))+(stage==='pool'?0:20000000)})],[donor]);
 send(ix.slice(1,-1));const poolFee=ix.at(-1).keys[4].pubkey;
 if(stage!=='curve')send([SystemProgram.transfer({fromPubkey:donor.publicKey,toPubkey:poolFee,lamports:20000000}),createSyncNativeInstruction(poolFee)],[donor]);
 for(const group of await custodialFeeGroups({connection,wallet,operator:payer,record:{metadata:{redEnvelope:{quoteMint:NATIVE_MINT.toBase58()}}}}))send(group,[payer,wallet]);
 const quote=getAssociatedTokenAddressSync(NATIVE_MINT,wallet.publicKey),wrapped=unpackAccount(quote,account(quote),TOKEN_PROGRAM_ID).amount;
 const before=BigInt(account(wallet.publicKey)?.lamports||0);send(unwrapCustodialSolInstructions(wallet.publicKey,payer.publicKey,wrapped),[payer,wallet]);
 const reward=BigInt(account(wallet.publicKey).lamports);assert.equal(reward,before+wrapped);assert.ok(reward>=20000000n);assert.equal(account(quote),null);
 const balance=svm.getBalance(winner.publicKey.toBase58());send(payoutInstructions({wallet:wallet.publicKey,operator:payer.publicKey,mint:Keypair.generate().publicKey,quoteMint:NATIVE_MINT,winner:winner.publicKey,reward,baseReward:0n}),[payer,wallet]);assert.equal(svm.getBalance(winner.publicKey.toBase58())-balance,reward);assert.equal(svm.getBalance(wallet.publicKey.toBase58())??0n,0n);
});
