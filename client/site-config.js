export function canonicalSite(config,currentOrigin){
 const value=config?.siteOrigin;
 if(!value)throw new Error('Site configuration is unavailable. Refresh and try again.');
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid site configuration');
 return {origin:url.origin,matches:url.origin===new URL(currentOrigin).origin};
}
