// Executes compiled SBF plus the pinned deployed ORAO V2 binary.
// Synthetic mint funding/config accounts are local fixtures, never mainnet state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {LiteSVM,FailedTransactionMetadata} from 'litesvm';
import {getTransactionDecoder} from '@solana/kit';
import {Keypair,PublicKey,SystemProgram,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,Ed25519Program,SYSVAR_INSTRUCTIONS_PUBKEY} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,NATIVE_MINT,MintLayout,AccountLayout,createInitializeMint2Instruction,createMintToInstruction,createTransferCheckedInstruction,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
import {Orao,PROGRAM_ID as ORAO_ID,networkStateAccountAddress} from '@orao-network/solana-vrf';
import BN from 'bn.js';
import {rewardAddresses,initializeRewardInstruction,createRewardVaultInstruction,beginRoundInstruction,settleRoundInstruction,decodeVault,decodeRound} from '../../server/red-envelope-chain.js';
import {snapshotTree,digest,winnerIndex} from '../../server/red-envelope-snapshot.js';
import {FAFA_QUOTE_MINT} from '../../shared/quote-assets.js';
const require=createRequire(import.meta.url),program=new PublicKey(readFileSync('programs/red-envelope/PROGRAM_ID','utf8').trim());
const binary=process.env.RED_ENVELOPE_SBF||'target/deploy/fafa_red_envelope.so';
for(const cycleSeconds of [900,3600,7200,14400])for(const quote of [NATIVE_MINT.toBase58(),FAFA_QUOTE_MINT])test(`compiled vault: ${quote===FAFA_QUOTE_MINT?'FAFA':'SOL'} ${cycleSeconds}s create → ORAO request → fulfill → one payout`,async()=>{
 const svm=new LiteSVM().withNativeMints();svm.addProgramFromFile(program.toBase58(),binary);svm.addProgramFromFile(ORAO_ID.toBase58(),'test/program/fixtures/orao-mainnet.so');
 const creator=Keypair.generate(),keeper=Keypair.generate(),oracle=Keypair.generate(),treasury=Keypair.generate(),mint=Keypair.generate(),holders=[Keypair.generate(),Keypair.generate(),Keypair.generate()];
 for(const k of [creator,keeper,treasury,...holders])svm.airdrop(k.publicKey.toBase58(),2_000_000_000n);
 const account=k=>{const a=svm.getAccount(k.toBase58());return a.exists?{owner:new PublicKey(a.programAddress),data:Buffer.from(a.data),lamports:Number(a.lamports)}:null};
 const put=(key,owner,data,lamports)=>svm.setAccount({address:key.toBase58(),programAddress:owner.toBase58(),data,lamports:lamports??svm.minimumBalanceForRentExemption(BigInt(data.length)),executable:false});
 const send=(ix,signers=[keeper],ok=true)=>{svm.expireBlockhash();const tx=new VersionedTransaction(new TransactionMessage({payerKey:signers[0].publicKey,recentBlockhash:svm.latestBlockhash(),instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:1_400_000}),...ix]}).compileToV0Message());tx.sign(signers);const result=svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));if(ok)assert.ok(!(result instanceof FailedTransactionMetadata),result instanceof FailedTransactionMetadata?JSON.stringify({error:result.err(),logs:result.meta().logs()}):'');else assert.ok(result instanceof FailedTransactionMetadata,'Expected the contract to reject this transaction');return result};
 const a=rewardAddresses(program,mint.publicKey,quote);
 // Model a deployed program owned by the operator, then execute real initialization.
 const programInfo=account(program),programDataKey=new PublicKey(programInfo.data.subarray(4,36)),programData=account(programDataKey);programData.data[12]=1;creator.publicKey.toBuffer().copy(programData.data,13);put(programDataKey,programData.owner,programData.data,BigInt(programData.lamports));
 send([initializeRewardInstruction({programId:program,authority:keeper.publicKey,snapshotAuthority:keeper.publicKey})],[keeper],false);
 send([initializeRewardInstruction({programId:program,authority:creator.publicKey,snapshotAuthority:keeper.publicKey})],[creator]);
 if(quote===FAFA_QUOTE_MINT){const f=JSON.parse(readFileSync('test/fixtures/fafa-quote-mint.json','utf8'));put(a.quoteMint,new PublicKey(f.owner),Buffer.from(f.data,'base64'));}
 send([SystemProgram.createAccount({fromPubkey:creator.publicKey,newAccountPubkey:mint.publicKey,lamports:Number(svm.minimumBalanceForRentExemption(BigInt(MintLayout.span))),space:MintLayout.span,programId:TOKEN_2022_PROGRAM_ID}),createInitializeMint2Instruction(mint.publicKey,6,creator.publicKey,null,TOKEN_2022_PROGRAM_ID),createRewardVaultInstruction({programId:program,mint:mint.publicKey,quoteMint:quote,creator:creator.publicKey,cycleSeconds})],[creator,mint]);
 assert.equal(decodeVault(account(a.vault),program).pending,false);
 // Real token-program deposit of base-denominated creator fees.
 send([createMintToInstruction(mint.publicKey,a.baseVault,creator.publicKey,5_000_000n,[],TOKEN_2022_PROGRAM_ID)],[creator]);
 if(quote===FAFA_QUOTE_MINT){const source=getAssociatedTokenAddressSync(a.quoteMint,creator.publicKey,false,TOKEN_2022_PROGRAM_ID),data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint:a.quoteMint,owner:creator.publicKey,amount:200_000_000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);put(source,TOKEN_2022_PROGRAM_ID,data);send([createTransferCheckedInstruction(source,a.quoteMint,a.quoteVault,creator.publicKey,150_000_000n,6,[],TOKEN_2022_PROGRAM_ID)],[creator]);}
 else send([SystemProgram.transfer({fromPubkey:creator.publicKey,toPubkey:a.vault,lamports:20_000_000})],[creator]);
 const orao=new Orao({connection:{},publicKey:keeper.publicKey});
 send([await orao.methods.initNetwork(new BN(10000),keeper.publicKey,[oracle.publicKey],null).accountsPartial({payer:keeper.publicKey,networkState:networkStateAccountAddress(),treasury:treasury.publicKey,systemProgram:SystemProgram.programId}).instruction()]);
 const clock=svm.getClock();clock.unixTimestamp+=BigInt(cycleSeconds+1);clock.slot=1000n;svm.setClock(clock);
 const tree=snapshotTree({vault:a.vault.toBase58(),sequence:'0',holders:holders.map(x=>({wallet:x.publicKey.toBase58(),balance:'1000000'}))});
 const args={programId:program,mint:mint.publicKey,quoteMint:quote,sequence:0,root:tree.root,count:tree.entries.length,slot:1000,keeper:keeper.publicKey,treasury:treasury.publicKey};
 const wrong=beginRoundInstruction({...args,keeper:creator.publicKey});send([wrong.instruction],[creator],false);
 const begin=beginRoundInstruction(args);send([begin.instruction]);const round=decodeRound(account(a.round),program);assert.equal(round.root,tree.root);assert.equal(round.baseReward,'5000000');assert.equal(decodeVault(account(a.vault),program).pending,true);
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
 else {const ata=getAssociatedTokenAddressSync(a.quoteMint,new PublicKey(winner.wallet),false,TOKEN_2022_PROGRAM_ID);assert.equal(unpackAccount(ata,account(ata),TOKEN_2022_PROGRAM_ID).amount,150_000_000n);}
 const baseAta=getAssociatedTokenAddressSync(mint.publicKey,new PublicKey(winner.wallet),false,TOKEN_2022_PROGRAM_ID);assert.equal(unpackAccount(baseAta,account(baseAta),TOKEN_2022_PROGRAM_ID).amount,5_000_000n);
 const vault=decodeVault(account(a.vault),program);assert.equal(vault.sequence,'1');assert.equal(vault.pending,false);assert.equal(vault.nextDue,Number(clock.unixTimestamp)+cycleSeconds);
 send([settleRoundInstruction(settleArgs)],[keeper],false); // Cannot pay twice.
});
