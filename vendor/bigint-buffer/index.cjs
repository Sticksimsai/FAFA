'use strict';
const {Buffer}=require('buffer');
const MAX_BYTES=4096;
function read(bytes,little){
 if(!(bytes instanceof Uint8Array))throw new TypeError('Expected a byte buffer');
 if(bytes.length>MAX_BYTES)throw new RangeError('Integer buffer exceeds supported size');
 let value=0n;
 if(little){for(let i=bytes.length-1;i>=0;i--)value=(value<<8n)|BigInt(bytes[i]);}
 else{for(const byte of bytes)value=(value<<8n)|BigInt(byte);}
 return value;
}
function write(value,width,little){
 if(typeof value!=='bigint'||value<0n)throw new TypeError('Expected an unsigned bigint');
 if(!Number.isInteger(width)||width<0||width>MAX_BYTES)throw new RangeError('Invalid integer width');
 if(value>=(1n<<BigInt(width*8)))throw new RangeError('Integer does not fit requested width');
 const out=Buffer.alloc(width);
 for(let i=0;i<width;i++){out[little?i:width-1-i]=Number(value&255n);value>>=8n;}
 return out;
}
exports.toBigIntLE=bytes=>read(bytes,true);
exports.toBigIntBE=bytes=>read(bytes,false);
exports.toBufferLE=(value,width)=>write(value,width,true);
exports.toBufferBE=(value,width)=>write(value,width,false);
