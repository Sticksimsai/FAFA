// Read-only deployment planning. Never reads keypairs or signs transactions.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
const binaryPath=process.argv[2]||'red-envelope-build/target/deploy/fafa_red_envelope.so';
const expected='88488126befd0389b55ec118e0671d77648e4b6e5ef5bfb7c3cd2db7c08f853e';
const binary=readFileSync(binaryPath),hash=createHash('sha256').update(binary).digest('hex');
if(hash!==expected)throw new Error('Binary checksum differs from the reviewed build. Stop and review the artifact.');
const program=new PublicKey('3kFwkbymXkMhjveEyrGfdaDHjqWFwLsih7BLt2GLo3r4');
const deployment=new PublicKey('7EbtR2dyJG5GpjPLaZDPrmbkN49ghwuYGNDgzmNax3VW');
const keeper=new PublicKey('4p1AY1EZ7ZmeTaZEfq21m98u6pb3usCNDhveJK4Vtx3g');
const c=new Connection(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'finalized',fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});
if(await c.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('Expected Solana mainnet');
const [account,deploymentBalance,keeperBalance,programRent,programDataRent,bufferRent]=await Promise.all([
 c.getAccountInfo(program),c.getBalance(deployment),c.getBalance(keeper),c.getMinimumBalanceForRentExemption(36),c.getMinimumBalanceForRentExemption(binary.length+45),c.getMinimumBalanceForRentExemption(binary.length+37),
]);
// Conservative cash requirement includes temporary buffer rent and a fee margin.
// Buffer funding is not an additional permanent program cost; actual CLI timing varies.
const feeMargin=50_000_000,planningBalance=programRent+programDataRent+bufferRent+feeMargin;
console.log(JSON.stringify({network:'mainnet-beta',binarySha256:hash,binaryBytes:binary.length,programId:program.toBase58(),programExists:!!account,programExecutable:!!account?.executable,deploymentWallet:deployment.toBase58(),operatorWallet:keeper.toBase58(),deploymentBalanceSOL:deploymentBalance/1e9,operatorBalanceSOL:keeperBalance/1e9,exactSizeProgramRentSOL:(programRent+programDataRent)/1e9,temporaryBufferRentSOL:bufferRent/1e9,conservativeDeploymentPlanningBalanceSOL:planningBalance/1e9,deploymentFundingGapSOL:Math.max(0,planningBalance-deploymentBalance)/1e9,note:'Read-only estimate for exact-size allocation, not a fee quote. No transaction sent. Deployment does not enable payouts.'},null,2));
