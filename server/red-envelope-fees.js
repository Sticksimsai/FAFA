import {OnlinePumpSdk} from '@pump-fun/pump-sdk';
import {PublicKey} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,NATIVE_MINT,createAssociatedTokenAccountIdempotentInstruction,unpackAccount} from '@solana/spl-token';
import {DYNAMIC_BONDING_CURVE_PROGRAM_ID} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {CP_AMM_PROGRAM_ID} from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import {rewardAddresses,unwrapNativeInstruction,wrapFeeClaim} from './red-envelope-chain.js';
export async function rewardFeeInstructions({connection,programId,mint,quoteMint,payer,metadata,curveService}){
 const a=rewardAddresses(programId,mint,quoteMint),feePayer=new PublicKey(payer),ensureQuote=()=>createAssociatedTokenAccountIdempotentInstruction(feePayer,a.quoteVault,a.vault,a.quoteMint,a.tokenProgram);
 if(a.quoteMint.equals(NATIVE_MINT)){
  const sdk=new OnlinePumpSdk(connection),ix=await sdk.collectCoinCreatorFeeInstructions(a.vault,feePayer);
  // Fee payer != creator means the SDK leaves WSOL open. Our constrained
  // program instruction unwraps only to this same vault, then restores its ATA.
  return [ensureQuote(),...ix,unwrapNativeInstruction(a),ensureQuote()];
 }
 const info=await curveService.inspect(mint,metadata),transactions=[];
 if(!info.config.feeClaimer.equals(a.vault))throw new Error('Pool fee authority does not match reward vault');
 const baseAccount=await connection.getAccountInfo(a.baseVault,'confirmed');if(baseAccount&&!unpackAccount(a.baseVault,baseAccount,a.baseTokenProgram).owner.equals(a.vault))throw new Error('Wrong base fee destination');
 transactions.push(await curveService.sdk.partner.claimPartnerTradingFee({feeClaimer:a.vault,receiver:a.vault,payer:feePayer,pool:new PublicKey(info.pool),maxBaseAmount:new BN('18446744073709551615'),maxQuoteAmount:new BN('18446744073709551615')}));
 if(info.migrated){const pool=new PublicKey(info.graduatedPool),poolState=await curveService.amm.fetchPoolState(pool);if(!poolState.tokenAMint.equals(a.mint)||!poolState.tokenBMint.equals(a.quoteMint))throw new Error('Graduated reward pool mint mismatch');const positions=await curveService.amm.getUserPositionByPool(pool,a.vault);if(!positions.length)throw new Error('Reward vault has no graduated fee position');for(const position of positions)transactions.push(await curveService.amm.claimPositionFee({owner:a.vault,receiver:a.vault,feePayer,position:position.position,positionNftAccount:position.positionNftAccount,pool,tokenAMint:a.mint,tokenBMint:a.quoteMint,tokenAVault:poolState.tokenAVault,tokenBVault:poolState.tokenBVault,tokenAProgram:a.baseTokenProgram,tokenBProgram:a.tokenProgram}));}
 return transactions.flatMap(tx=>tx.instructions.map(ix=>{if(ix.programId.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)||ix.programId.equals(CP_AMM_PROGRAM_ID))return wrapFeeClaim(a,ix);if(ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)&&ix.keys[0]?.pubkey.equals(feePayer)&&ix.keys[2]?.pubkey.equals(a.vault))return ix;throw new Error('Unexpected fee collection setup instruction')}));
}
