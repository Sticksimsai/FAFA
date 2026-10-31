import {Buffer} from 'buffer';

// Continue directly into the extension after connection. Never require a
// second website click or retry a declined signature automatically.
export async function signLoginChallenge(provider,challenge,wallet,isCurrent,api) {
 const check=()=>{if(!isCurrent()||provider.publicKey?.toBase58()!==wallet)throw new Error('Wallet account changed')};
 check();
 const signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');
 check();
 return api('/auth/verify',{id:challenge.id,signature:Buffer.from(signed.signature||signed).toString('base64')});
}
