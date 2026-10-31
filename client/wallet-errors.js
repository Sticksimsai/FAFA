export function walletError(error,stage,en=false){
 const code=Number(error?.code),message=String(error?.message||'Unknown wallet error');
 const t=(cn,eng)=>en?eng:cn;
 if(code===4001)return t('钱包未批准'+(stage==='connect'?'连接':'登录签名')+'。请打开钱包检查请求，然后重试。','The wallet did not approve '+(stage==='connect'?'connection':'the sign-in signature')+'. Open your wallet to check the request, then retry.');
 if(code===-32002)return t('钱包中已有待处理请求。请先打开钱包完成或关闭该请求。','A wallet request is already pending. Open your wallet and complete or dismiss it first.');
 if(/Origin mismatch/i.test(message))return t('网站域名配置不匹配，请部署方将 APP_ORIGIN 设置为当前网站域名。','Site origin mismatch. The operator must set APP_ORIGIN to this website’s origin.');
 return t('连接步骤失败：','Wallet step failed: ')+message;
}
