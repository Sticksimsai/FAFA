import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,unpackAccount} from '@solana/spl-token';
export const digest=(...parts)=>createHash('sha256').update(Buffer.concat(parts)).digest();
export const u64=value=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b};
export const u32=value=>{const b=Buffer.alloc(4);b.writeUInt32LE(value);return b};
export function leafHash({vault,sequence,index,wallet,balance}){return digest(Buffer.from('fafa-holder-v1'),new PublicKey(vault).toBuffer(),u64(sequence),u32(index),new PublicKey(wallet).toBuffer(),u64(balance))}
const parent=(left,right)=>digest(Buffer.from('fafa-node-v1'),left,right);
export function snapshotTree({vault,sequence,holders}){
 if(!holders.length)throw new Error('No eligible holders');
 const sorted=[...holders].sort((a,b)=>Buffer.compare(new PublicKey(a.wallet).toBuffer(),new PublicKey(b.wallet).toBuffer()));
 if(new Set(sorted.map(x=>x.wallet)).size!==sorted.length)throw new Error('Duplicate wallet');
 const entries=sorted.map((h,index)=>({...h,index,balance:String(h.balance)}));
 const levels=[entries.map(h=>leafHash({...h,vault,sequence}))];
 while(levels.at(-1).length>1){const layer=levels.at(-1),next=[];for(let i=0;i<layer.length;i+=2)next.push(parent(layer[i],layer[i+1]||layer[i]));levels.push(next)}
 return {root:levels.at(-1)[0].toString('hex'),entries,proof(index){if(!Number.isInteger(index)||index<0||index>=entries.length)throw new Error('Invalid holder index');const proof=[];for(const layer of levels.slice(0,-1)){proof.push((layer[index^1]||layer[index]).toString('hex'));index>>=1}return proof}};
}
export function verifyProof(entry,proof,root){let hash=leafHash(entry),index=entry.index;for(const hex of proof){const sibling=Buffer.from(hex,'hex');if(sibling.length!==32)return false;hash=index%2?parent(sibling,hash):parent(hash,sibling);index=Math.floor(index/2)}return hash.toString('hex')===root}
// Same rejection sampler as the program; no Math.random, timestamps or blockhash draws.
export function winnerIndex(randomness,count){const random=Buffer.from(randomness);if(random.length!==64||!Number.isInteger(count)||count<1||count>1_000_000)throw new Error('Invalid draw input');const limit=(1n<<64n)-((1n<<64n)%BigInt(count));for(let counter=0;counter<256;counter++){const n=digest(Buffer.from('fafa-winner-v1'),random,u32(counter)).readBigUInt64LE();if(n<limit)return Number(n%BigInt(count))}throw new Error('Randomness rejection limit reached')}
export async function collectHolderSnapshot(connection,{mint,creator,vault,sequence,minimumBalance=1000000n}){
 const key=new PublicKey(mint),account=await connection.getAccountInfo(key,'finalized');
 if(!account||![TOKEN_PROGRAM_ID.toBase58(),TOKEN_2022_PROGRAM_ID.toBase58()].includes(account.owner.toBase58()))throw new Error('Invalid token mint');
 // One finalized bank query. No paginated DAS list that can change between pages.
 const result=await connection.getProgramAccounts(account.owner,{commitment:'finalized',withContext:true,filters:[{memcmp:{offset:0,bytes:mint}}]});
 if(!result?.context?.slot||!Array.isArray(result.value))throw new Error('Complete holder snapshot unavailable');
 const seen=new Set(),balances=new Map();
 for(const row of result.value){const address=row.pubkey.toBase58();if(seen.has(address))throw new Error('Duplicate token account in snapshot');seen.add(address);let token;try{token=unpackAccount(row.pubkey,row.account,account.owner)}catch{throw new Error('Unreadable token account; refusing a partial snapshot')}
  if(!token.mint.equals(key))throw new Error('Snapshot mint mismatch');const wallet=token.owner.toBase58();
  if(!token.isInitialized||token.isFrozen||wallet===creator||wallet===vault||wallet===PublicKey.default.toBase58()||!PublicKey.isOnCurve(token.owner.toBytes()))continue;
  balances.set(wallet,(balances.get(wallet)||0n)+token.amount);
 }
 const holders=[...balances].filter(([,amount])=>amount>=minimumBalance).map(([wallet,amount])=>({wallet,balance:amount.toString()}));
 if(holders.length>1_000_000)throw new Error('Snapshot exceeds supported holder count');
 return {mint,vault,sequence:String(sequence),slot:result.context.slot,minimumBalance:String(minimumBalance),holders};
}
