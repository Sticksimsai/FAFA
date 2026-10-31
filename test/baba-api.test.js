import {test,mock,after} from 'node:test';import assert from 'node:assert/strict';import {newDb} from 'pg-mem';import {Keypair} from '@solana/web3.js';import {createHash,randomUUID} from 'node:crypto';import {migrate} from '../server/db.js';
const memory=newDb(),Pg=memory.adapters.createPg(),db=new Pg.Pool();mock.module('../server/db.js',{namedExports:{database:()=>db,migrate}});
const wallet=Keypair.generate().publicKey.toBase58(),mint=Keypair.generate().publicKey.toBase58();
const built={transaction:'test',message:'test',blockhash:'test',lastValidBlockHeight:100,networkFeeLamports:5000,quote:{quoteAmount:'100000000',quoteAsset:'BABAx',stage:'mint'}};let poolCalls=0;
mock.module('../server/pump.js',{namedExports:{pumpService:()=>({connection:{getSignatureStatuses:async()=>({value:[{err:null,confirmationStatus:'confirmed'}]})}})}});
const BABA='BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp';let created;
mock.module('../server/baba.js',{namedExports:{BABA,BABA_ENGINE:'meteora-dbc',babaService:()=>({create:async d=>{created=d;return {...built,quote:{quoteAsset:'BABA',pool:'curve-pool',initialQuoteDeposit:'0'}}},inspect:async(m,metadata)=>{assert.equal(metadata.quoteMint,BABA);return {creator:wallet,pool:'curve-pool'}},trade:async()=>built})}});
mock.module('../server/baba-market.js',{namedExports:{babaMarketService:()=>({})}});
process.env.DATABASE_URL='postgres://test';process.env.SOLANA_RPC_URL='https://example.test';process.env.PORT='0';process.env.APP_ORIGIN='http://localhost:3000';process.env.TRANSACTIONS_ENABLED='true';process.env.STOCK_LAUNCHES_ENABLED='true';process.env.NODE_ENV='test';
const {server}=await import('../server/index.js');await new Promise(r=>server.listening?r():server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;after(()=>new Promise(r=>server.close(()=>{db.end();r()})));
const token='c'.repeat(64),asset=randomUUID();await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),wallet]);await db.query('INSERT INTO assets VALUES($1,$2,$3,$4)',[asset,wallet,Buffer.from('test'),'image/png']);
const request=(route,body,method='POST')=>fetch(base+route,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Cookie:'fafa_session='+token},...(body?{body:JSON.stringify(body)}:{})});
test('BABA curve launch needs no liquidity deposit and publishes only after confirmation',async()=>{
 const config=Keypair.generate().publicKey.toBase58();
 const input={mint,curveConfig:config,name:'哈基米',symbol:'哈基米',description:'test',quoteAsset:'BABA',image:'http://localhost:3000/assets/'+asset};
 const response=await request('/api/launch/prepare',input);assert.equal(response.status,200);const order=await response.json();assert.equal(order.kind,'baba-launch');assert.equal(order.quote.initialQuoteDeposit,'0');assert.equal(created.quoteLiquidity,undefined);assert.equal(created.curveConfig,config);assert.equal(created.wallet,wallet);
 assert.equal((await fetch(base+'/api/token/'+mint+'/record')).status,404);
 await db.query("UPDATE orders SET status='submitted',signature='curve-signature' WHERE id=$1",[order.id]);const status=await(await request('/api/orders/'+order.id,null,'GET')).json();assert.equal(status.status,'confirmed');
 const record=await(await fetch(base+'/api/token/'+mint+'/record')).json();assert.equal(record.metadata.engine,'meteora-dbc');assert.equal(record.metadata.quoteMint,BABA);assert.equal(record.metadata.curveConfig,config);assert.equal(record.metadata.liquidityLocked,true);assert.equal(record.wallet,wallet);
 assert.equal((await request('/api/baba/trade/prepare',{mint,side:'buy',amountUi:'1',slippageBps:100})).status,200);
 const unknown=Keypair.generate().publicKey.toBase58();assert.equal((await request('/api/baba/trade/prepare',{mint:unknown,side:'buy',amountUi:'1',slippageBps:100})).status,404);
});
test('BABA launch rejects missing configuration and arbitrary liquidity fields',async()=>{
 const input={mint,name:'测试',symbol:'测试',description:'',quoteAsset:'BABA',image:'http://localhost:3000/assets/'+asset};assert.equal((await request('/api/launch/prepare',input)).status,400);assert.equal((await request('/api/launch/prepare',{...input,curveConfig:Keypair.generate().publicKey.toBase58(),quoteLiquidity:'1'})).status,400);
});
