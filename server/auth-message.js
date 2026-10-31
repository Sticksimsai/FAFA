// SIWS statement and fields must be separated by a blank line. The nonce is
// alphanumeric; the database challenge UUID is deliberately a separate value.
export function createSignInMessage({origin,wallet,nonce,issuedAt,expiresAt}) {
 if(!/^[a-zA-Z0-9]{8,}$/.test(nonce))throw new Error('Invalid sign-in nonce');
 return `${new URL(origin).host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to FAFA. This signature does not authorize a transaction.\n\nURI: ${origin}\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}\nExpiration Time: ${expiresAt.toISOString()}`;
}
