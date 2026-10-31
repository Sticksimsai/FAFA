import {BABAX} from './stocks.js';
// Read-only chain reconciliation: never signs or submits transactions.
export function orderReconciler({db,pump,stocks}){
 const inflight=new Map();
 async function settle(order){
  if(inflight.has(order.id))return inflight.get(order.id);
  const work=(async()=>{
   if(order.status==='prepared'&&new Date(order.expires_at)<new Date()){
    await db.query("UPDATE orders SET status='expired' WHERE id=$1 AND status='prepared'",[order.id]);
    order=(await db.query('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
   }
   if(order.signature&&['submitted','submitting'].includes(order.status)){
    const status=(await pump.connection.getSignatureStatuses([order.signature],{searchTransactionHistory:true})).value[0];
    let next=order.status;
    if(status?.err)next='failed';
    else if(status&&['confirmed','finalized'].includes(status.confirmationStatus))next='confirmed';
    else if(!status&&order.last_valid_height&&await pump.connection.getBlockHeight('confirmed')>Number(order.last_valid_height))next='expired';
    if(next==='confirmed'){
     const d=order.details;
     if(order.kind==='stock-mint')await db.query("UPDATE stock_launches SET status='mint-confirmed',mint_signature=$2 WHERE mint=$1 AND wallet=$3 AND status='pending'",[d.mint,order.signature,order.wallet]);
     if(order.kind==='stock-pool'){
      const info=await stocks.inspect(d.mint);
      if(info.creator!==order.wallet)throw new Error('Pool creator mismatch');
      d.metadata={...d.metadata,engine:'raydium-cpmm',quoteAsset:'BABAx',quoteMint:BABAX,pool:info.pool,liquidityLocked:false};
     }
     if(['launch','stock-pool'].includes(order.kind)){
      await db.query('INSERT INTO tokens(mint,wallet,name,symbol,description,image,uri,signature,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[d.mint,order.wallet,d.name,d.symbol,d.description,d.image,d.uri,order.signature,d.metadata||{}]);
      if(order.kind==='stock-pool')await db.query("UPDATE stock_launches SET status='confirmed',pool_signature=$2 WHERE mint=$1 AND wallet=$3",[d.mint,order.signature,order.wallet]);
     }
    }
    if(next!==order.status){await db.query('UPDATE orders SET status=$2,details=$3 WHERE id=$1',[order.id,next,order.details]);order.status=next;}
   }
   if(order.kind==='stock-mint'&&['failed','expired'].includes(order.status))await db.query("UPDATE stock_launches SET status='aborted' WHERE mint=$1 AND status='pending'",[order.details.mint]);
   return order;
  })().finally(()=>inflight.delete(order.id));
  inflight.set(order.id,work);return work;
 }
 let sweeping=false;
 async function sweep(){if(sweeping)return;sweeping=true;try{const rows=(await db.query("SELECT * FROM orders WHERE status IN ('submitted','submitting') OR (status='prepared' AND expires_at<now()) ORDER BY last_checked_at ASC NULLS FIRST,created_at ASC LIMIT 25")).rows;for(const order of rows){try{await settle(order)}catch{console.error(JSON.stringify({event:'order_reconciliation_retry',id:order.id}))}finally{await db.query('UPDATE orders SET last_checked_at=now() WHERE id=$1',[order.id])}}}finally{sweeping=false}}
 return {settle,sweep};
}
