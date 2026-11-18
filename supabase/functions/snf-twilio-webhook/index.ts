// Smithers & Friends inbound SMS and delivery receipts.
// Accepts ONLY signed Twilio callbacks. Deploy without Supabase JWT verification;
// Twilio signs requests instead of providing a staff JWT.
import {createClient} from 'npm:@supabase/supabase-js@2';
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const signedUrl=Deno.env.get('TWILIO_WEBHOOK_URL')||'';
const authToken=Deno.env.get('TWILIO_AUTH_TOKEN')||'';
const phoneOK=(s:string)=>/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(s);
const xml=(status=200)=>new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>',{status,headers:{'Content-Type':'application/xml'}});
async function signatureValid(req:Request,form:URLSearchParams){
  const received=req.headers.get('x-twilio-signature')||'';
  if(!received||!signedUrl||!authToken)return false;
  // Twilio signs the exact public URL followed by alphabetically ordered POST parameters.
  const base=signedUrl+[...form.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+v).join('');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(authToken),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const buf=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(base));
  const expected=btoa(String.fromCharCode(...new Uint8Array(buf)));
  if(expected.length!==received.length)return false;
  let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^received.charCodeAt(i);
  return difference===0;
}
Deno.serve(async req=>{
  if(req.method!=='POST')return xml(405);
  const form=new URLSearchParams(await req.text().catch(()=>''));
  if(!(await signatureValid(req,form)))return xml(403);
  try{
    const sid=form.get('MessageSid')||form.get('SmsSid')||'';
    const state=(form.get('MessageStatus')||form.get('SmsStatus')||'').toLowerCase();
    const body=(form.get('Body')||'').trim().slice(0,700);
    const from=form.get('From')||'';
    // 'received' is an INBOUND text, not a delivery receipt.
    if(state&&state!=='received'){
      const allowed=['queued','accepted','sending','sent','delivered','failed','undelivered'];
      if(sid&&allowed.includes(state)){
        const st=state==='sending'||state==='queued'?'accepted':state;
        await db.from('family_messages').update({status:st,updated_at:new Date().toISOString()}).eq('provider_sid',sid).eq('direction','out');
      }
      return xml();
    }
    if(!phoneOK(from)||!body||!sid)return xml();
    let {data:contact}=await db.from('family_contacts').select('id,phone_e164').eq('phone_e164',from).maybeSingle();
    if(!contact){
      const add=await db.from('family_contacts').insert({family_name:'Unknown sender '+from.slice(-4),phone_e164:from,opted_in:false,notes:'Inbound SMS: verify identity before replying'}).select('id,phone_e164').single();
      contact=add.data||(await db.from('family_contacts').select('id,phone_e164').eq('phone_e164',from).maybeSingle()).data;
    }
    if(!contact)return xml();
    await db.from('family_messages').upsert({contact_id:contact.id,direction:'in',body,status:'received',provider_sid:sid},{onConflict:'provider_sid',ignoreDuplicates:true});
    const normalized=body.toUpperCase().replace(/\s+/g,' ').trim();
    if(/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)(\s|$)/.test(normalized)||form.get('OptOutType')==='STOP'){
      await db.from('family_contacts').update({opted_in:false,unsubscribed_at:new Date().toISOString()}).eq('id',contact.id);
    }else if(/^(START|UNSTOP)(\s|$)/.test(normalized)||form.get('OptOutType')==='START'){
      await db.from('family_contacts').update({opted_in:true,unsubscribed_at:null,consent_source:'Parent texted START',consent_at:new Date().toISOString()}).eq('id',contact.id);
    }
    return xml();
  }catch(_error){return xml(200);}
});