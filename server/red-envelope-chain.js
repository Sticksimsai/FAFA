import {PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,NATIVE_MINT,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {PROGRAM_ID as ORAO_ID,networkStateAccountAddress,randomnessAccountAddress} from '@orao-network/solana-vrf';
import {digest,u64,u32} from './red-envelope-snapshot.js';
import {BABA_QUOTE_MINT,FAFA_QUOTE_MINT} from '../shared/quote-assets.js';
const key=v=>v instanceof PublicKey?v:new PublicKey(v);
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey:key(pubkey),isWritable,isSigner});
const discriminator=(type,name)=>digest(Buffer.from(type+':'+name)).subarray(0,8);
export const VAULT_ACCOUNT_SIZE=130;
export function rewardAddresses(programId,mint,quoteMint=NATIVE_MINT,sequence=0){const program=key(programId),base=key(mint),quote=key(quoteMint),tokenProgram=quote.equals(NATIVE_MINT)?TOKEN_PROGRAM_ID:TOKEN_2022_PROGRAM_ID;
 if(![NATIVE_MINT.toBase58(),BABA_QUOTE_MINT,FAFA_QUOTE_MINT].includes(quote.toBase58()))throw new Error('Unsupported reward quote');
 const [vault,bump]=PublicKey.findProgramAddressSync([Buffer.from('red-envelope'),base.toBuffer()],program);
 return {program,mint:base,quoteMint:quote,tokenProgram,baseTokenProgram:TOKEN_2022_PROGRAM_ID,vault,bump,config:PublicKey.findProgramAddressSync([Buffer.from('config')],program)[0],round:PublicKey.findProgramAddressSync([Buffer.from('round'),vault.toBuffer(),u64(sequence)],program)[0],quoteVault:getAssociatedTokenAddressSync(quote,vault,true,tokenProgram),baseVault:getAssociatedTokenAddressSync(base,vault,true,TOKEN_2022_PROGRAM_ID)};
}
function instruction(a,name,keys,data=[]){return new TransactionInstruction({programId:a.program,keys,data:Buffer.concat([discriminator('global',name),...data])})}
export function createRewardVaultInstruction({programId,mint,quoteMint,creator,cycleSeconds}){if(![900,3600,7200,14400].includes(cycleSeconds))throw new Error('Invalid cycle');const a=rewardAddresses(programId,mint,quoteMint);return instruction(a,'create_vault',[meta(creator,true,true),meta(a.mint,false,true),meta(a.config),meta(a.quoteMint),meta(a.vault,true),meta(a.quoteVault,true),meta(a.baseVault,true),meta(a.baseTokenProgram),meta(a.tokenProgram),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],[u64(cycleSeconds)])}
export function drawSeed({vault,sequence,root,slot}){return digest(Buffer.from('fafa-round-v1'),key(vault).toBuffer(),u64(sequence),Buffer.from(root,'hex'),u64(slot))}
export function beginRoundInstruction({programId,mint,quoteMint,sequence,root,count,slot,keeper,treasury}){if(!/^[a-f0-9]{64}$/.test(root)||!Number.isInteger(count)||count<1||count>1e6)throw new Error('Invalid snapshot');const a=rewardAddresses(programId,mint,quoteMint,sequence),seed=drawSeed({vault:a.vault,sequence,root,slot});const random=randomnessAccountAddress(seed);
 return {seed,randomness:random,instruction:instruction(a,'begin_round',[meta(keeper,true,true),meta(a.config),meta(a.vault,true),meta(a.quoteMint),meta(a.quoteVault),meta(a.mint),meta(a.baseVault),meta(a.baseTokenProgram),meta(a.round,true),meta(random,true),meta(networkStateAccountAddress(),true),meta(treasury,true),meta(ORAO_ID),meta(a.tokenProgram),meta(SystemProgram.programId)],[u64(sequence),Buffer.from(root,'hex'),u32(count),u64(slot)])};
}
export function settleRoundInstruction({programId,mint,quoteMint,sequence,randomness,winner,index,balance,proof,payer}){if(proof.length>20||proof.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw new Error('Invalid proof');const a=rewardAddresses(programId,mint,quoteMint,sequence);return instruction(a,'settle_round',[meta(payer,true,true),meta(a.vault,true),meta(a.round,true),meta(randomness),meta(winner,true),meta(a.quoteMint),meta(a.quoteVault,true),meta(getAssociatedTokenAddressSync(a.quoteMint,key(winner),false,a.tokenProgram),true),meta(a.mint),meta(a.baseVault,true),meta(getAssociatedTokenAddressSync(a.mint,key(winner),false,a.baseTokenProgram),true),meta(a.baseTokenProgram),meta(a.tokenProgram),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],[u32(index),u64(balance),u32(proof.length),...proof.map(x=>Buffer.from(x,'hex'))])}
export function unwrapNativeInstruction(a){if(!a.quoteMint.equals(NATIVE_MINT))throw new Error('Not a SOL vault');return instruction(a,'unwrap_native',[meta(a.vault,true),meta(a.quoteMint),meta(a.quoteVault,true),meta(a.tokenProgram)])}
export function wrapFeeClaim(a,ix){const dbc='dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN',damm='cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';const id=ix.programId.toBase58(),isDbc=id===dbc;
 if(![dbc,damm].includes(id)||ix.keys.length!==(isDbc?14:15)||ix.data.length!==(isDbc?24:8)||!ix.data.subarray(0,8).equals(discriminator('global',isDbc?'claim_trading_fee':'claim_position_fee')))throw new Error('Unexpected fee instruction');
 for(const [i,expected] of [[3,a.baseVault],[4,a.quoteVault],[7,a.mint],[8,a.quoteMint],[isDbc?9:10,a.vault]])if(!ix.keys[i].pubkey.equals(expected))throw new Error('Fee recipient or mint mismatch');
 const fixed=[meta(a.vault),meta(a.mint),meta(a.quoteMint),meta(a.baseVault,true),meta(a.quoteVault,true),meta(a.tokenProgram),meta(a.baseTokenProgram),meta(ix.programId)];
 return instruction(a,'harvest_baba',[...fixed,...ix.keys.map(x=>({...x,isSigner:false}))],[u32(ix.data.length),ix.data]);
}
function reader(account,programId,name){if(!account||!account.owner.equals(key(programId)))throw new Error('Reward account owner mismatch');const data=Buffer.from(account.data);if(!data.subarray(0,8).equals(discriminator('account',name)))throw new Error('Reward account type mismatch');let offset=8;return {bytes(n){if(offset+n>data.length)throw new Error('Truncated reward account');const v=data.subarray(offset,offset+n);offset+=n;return v},pubkey(){return new PublicKey(this.bytes(32)).toBase58()},u64(){return this.bytes(8).readBigUInt64LE().toString()},i64(){return this.bytes(8).readBigInt64LE().toString()},u32(){return this.bytes(4).readUInt32LE()},bool(){const n=this.bytes(1)[0];if(n>1)throw new Error('Invalid boolean');return !!n}}}
export function decodeVault(account,programId){const r=reader(account,programId,'Vault');return {mint:r.pubkey(),creator:r.pubkey(),quoteMint:r.pubkey(),cycleSeconds:Number(r.i64()),nextDue:Number(r.i64()),sequence:r.u64(),pending:r.bool(),bump:r.bytes(1)[0]}}
export function decodeRound(account,programId){const r=reader(account,programId,'Round');return {vault:r.pubkey(),sequence:r.u64(),root:r.bytes(32).toString('hex'),count:r.u32(),snapshotSlot:r.u64(),reward:r.u64(),baseReward:r.u64(),randomness:r.pubkey(),seed:r.bytes(32).toString('hex'),requester:r.pubkey(),paid:r.bool(),winner:r.pubkey(),startedAt:Number(r.i64())}}
export function decodeConfig(account,programId){return reader(account,programId,'Config').pubkey()}
export async function readRewardVault(connection,{programId,mint,quoteMint}){const a=rewardAddresses(programId,mint,quoteMint),account=await connection.getAccountInfo(a.vault,'finalized');const v=decodeVault(account,programId);if(v.mint!==a.mint.toBase58()||v.quoteMint!==a.quoteMint.toBase58()||v.bump!==a.bump)throw new Error('Vault identity mismatch');return {...v,address:a.vault.toBase58(),lamports:account.lamports}}

export function initializeRewardInstruction({programId,authority,snapshotAuthority}){
 const program=key(programId),owner=key(authority),keeper=key(snapshotAuthority);
 if(!PublicKey.isOnCurve(keeper.toBytes()))throw new Error('Snapshot authority must be a signing wallet');
 const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
 const programData=PublicKey.findProgramAddressSync([program.toBuffer()],loader)[0];
 const config=PublicKey.findProgramAddressSync([Buffer.from('config')],program)[0];
 return instruction({program},'initialize',[meta(owner,true,true),meta(program),meta(programData),meta(config,true),meta(SystemProgram.programId)],[keeper.toBuffer()]);
}
// Static addresses shared by all mints. Including both token programs keeps a
// maximum-depth (20 siblings) payout within the 1232-byte packet for either quote.
export function rewardLookupAddresses(programId){return [key(programId),TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,SystemProgram.programId,NATIVE_MINT,key(BABA_QUOTE_MINT),key(FAFA_QUOTE_MINT),ORAO_ID,networkStateAccountAddress(),PublicKey.findProgramAddressSync([Buffer.from('config')],key(programId))[0]];}
export function validateRewardLookup(lookup,programId){
 if(!lookup||lookup.state.authority||lookup.state.deactivationSlot!==18446744073709551615n)throw new Error('Reward lookup table must be active and immutable');
 const known=new Set(lookup.state.addresses.map(x=>x.toBase58()));
 for(const address of rewardLookupAddresses(programId))if(!known.has(address.toBase58()))throw new Error('Reward lookup table is missing required address '+address.toBase58());
 return lookup;
}
