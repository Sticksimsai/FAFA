import test from 'node:test';
import assert from 'node:assert/strict';
import {walletError} from '../client/wallet-errors.js';
test('wallet failure distinguishes rejection, pending prompt, and backend errors',()=>{
 assert.match(walletError({code:4001},'sign',true),/sign-in signature/);
 assert.match(walletError({code:-32002},'connect',true),/already pending/);
 assert.match(walletError(new Error('Origin mismatch'),'connect',true),/APP_ORIGIN/);
 assert.match(walletError(new Error('RPC rejected request'),'sign',true),/RPC rejected request/);
 assert.doesNotMatch(walletError(new Error('RPC rejected request'),'sign',true),/cancelled/);
});
