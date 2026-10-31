import {test} from 'node:test';import assert from 'node:assert/strict';
import {countHolders,selectUsdPrice} from '../server/token-metrics.js';
test('holder count deduplicates owners and excludes zero balances across pages',async()=>{
 const rows=[[{address:'a',owner:'one',amount:1},{address:'b',owner:'one',amount:2}],[{address:'c',owner:'two',amount:3},{address:'d',owner:'zero',amount:0}],[]];
 const result=await countHolders(async(method,params)=>{assert.equal(method,'getTokenAccounts');assert.equal(params.options.showZeroBalance,false);return {token_accounts:rows[params.page-1]}},'mint',{limit:2});assert.equal(result.count,2);assert.equal(result.complete,true);
});
test('incomplete or repeated holder pages never appear as a complete count',async()=>{
 const rpc=async()=>({token_accounts:[{address:'a',owner:'one',amount:1}]});const r=await countHolders(rpc,'mint',{limit:1,maxPages:2});assert.equal(r.count,null);assert.equal(r.complete,false);
});
test('USD conversion matches the exact base mint and highest-liquidity pool',()=>{
 const pair=(address,price,liquidity)=>({chainId:'solana',baseToken:{address},priceUsd:String(price),liquidity:{usd:liquidity}});
 assert.equal(selectUsdPrice([pair('fake',999,1e12),pair('real',100,500),pair('real',101,1000)],'real').usd,101);assert.equal(selectUsdPrice([pair('fake',999,1e12)],'real'),null);
});
