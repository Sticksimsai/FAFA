import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSignInMessage} from '../server/auth-message.js';
import {signLoginChallenge} from '../client/wallet-login.js';

test('SIWS uses a separate alphanumeric nonce and canonical statement separator',()=>{
 const message=createSignInMessage({origin:'https://tryfafa.xyz',wallet:'wallet',nonce:'a0123456789bcdef',issuedAt:new Date('2026-10-31T00:00:00Z'),expiresAt:new Date('2026-10-31T00:05:00Z')});
 assert.equal(message,'https://tryfafa.xyz'.slice(8)+' wants you to sign in with your Solana account:\nwallet\n\nSign in to BAOFU. This signature does not authorize a transaction.\n\nURI: https://tryfafa.xyz\nVersion: 1\nChain ID: solana:mainnet\nNonce: a0123456789bcdef\nIssued At: 2026-10-31T00:00:00.000Z\nExpiration Time: 2026-10-31T00:05:00.000Z');
 assert.throws(()=>createSignInMessage({nonce:'bad-uuid-nonce'}),/nonce/);
});
test('login immediately opens signature prompt and verifies the exact challenge',async()=>{
 const calls=[];const p={publicKey:{toBase58:()=> 'wallet'},signMessage:async(bytes,encoding)=>{calls.push('sign');assert.equal(new TextDecoder().decode(bytes),'exact challenge');assert.equal(encoding,'utf8');return {signature:new Uint8Array([1,2,3])}}};
 const result=await signLoginChallenge(p,{id:'id',message:'exact challenge'},'wallet',()=>true,async(path,body)=>{calls.push('verify');assert.equal(path,'/auth/verify');assert.deepEqual(body,{id:'id',signature:'AQID'});return {wallet:'wallet'}});
 assert.deepEqual(calls,['sign','verify']);assert.equal(result.wallet,'wallet');
});
test('declining or switching accounts never verifies or retries a signature',async()=>{
 let verified=0,signs=0,current=true;
 const p={publicKey:{toBase58:()=> 'wallet'},signMessage:async()=>{signs++;throw new Error('declined')}};
 const run=()=>signLoginChallenge(p,{id:'id',message:'m'},'wallet',()=>current,async()=>verified++);
 await assert.rejects(run,/declined/);assert.equal(signs,1);
 p.signMessage=async()=>{current=false;return new Uint8Array([1])};
 await assert.rejects(run,/account changed/);assert.equal(verified,0);
});
