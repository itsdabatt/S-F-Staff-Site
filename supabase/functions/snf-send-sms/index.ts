// Smithers & Friends secure SMS sender. Never place these credentials in browser code.
// Requires a registered, approved organization SMS number and Supabase Edge Functions.
import {createClient} from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')||'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const account=Deno.env.get('TWILIO_ACCOUNT_SID')||'';
const secret=Deno.env.get('TWILIO_AUTH_TOKEN')||'';
const from=Deno.env.get('TWILIO_FROM_NUMBER')||'';
const service=Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')||'';
const webhook=Deno.env.get('TWILIO_WEBHOOK_URL')||'';
const originAllowed=Deno.env.get('ALLOWED_ORIGIN')||'';
const ready=!!(account&&secret&&(from||service)&&webhook&&originAllowed);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':o===originAllowed?o:'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Vary':'Origin'};}
function respond(req:Request,obj:unknown,status=200){return new Response(JSON.stringify(obj),{status,headers:{...cors(req),'Content-Type':'application/json'}});}
function branded(s:string){let t=s.trim();if(!/^Smithers\s*&\s*Friends\s*:/i.test(t))t='Smithers & Friends: '+t;if(!/reply\s+stop\b/i.test(t))t+=' Reply STOP to opt out.';return t;}
async function sendSMS(to:string,body:string){const args=new URLSearchParams({To:to,Body:body,StatusCallback:webhook});if(service)args.set('MessagingServiceSid',service);else args.set('From',from);const r=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(account)+'/Messages.json',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Authorization':'Basic '+btoa(account+':'+secret)},body:args});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(String(j?.message||'SMS provider rejected request').slice(0,170));if(!j?.sid)throw Error('Provider did not return a message ID');return String(j.sid);}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return respond(req,{error:'POST only'},405);
  if(originAllowed&&req.headers.get('origin')&&req.headers.get('origin')!==originAllowed)return respond(req,{error:'This request did not come from the S&F site'},403);
  try{
    const auth=req.headers.get('authorization')||'';
    if(!auth.startsWith('Bearer '))return respond(req,{error:'Staff login required'},401);
    const {data:{user},error}=await db.auth.getUser(auth.slice(7));
    if(error||!user)return respond(req,{error:'Session expired or invalid'},401);
    const approved=await db.from('staff_members').select('user_id').eq('user_id',user.id).maybeSingle();
    if(approved.error||!approved.data)return respond(req,{error:'Only approved S&F staff can send texts'},403);
    const input=await req.json().catch(()=>({}));
    if(input.action==='status')return respond(req,{ready});
    if(input.action!=='send')return respond(req,{error:'Unknown action'},400);
    if(!ready)return respond(req,{error:'S&F SMS number and gateway are not connected'},503);
    const original=String(input.body||'').trim();
    const ids=Array.isArray(input.contact_ids)?[...new Set(input.contact_ids.map(String))]:[];
    const campaign=String(input.campaign_id||'');
    if(original.length<1||original.length>400||ids.length<1||ids.length>100||ids.some(x=>!uuid.test(x))||!uuid.test(campaign))return respond(req,{error:'Use 1–100 contacts, up to 400 characters, and valid request IDs'},400);
    const body=branded(original);if(body.length>600)return respond(req,{error:'Text is too long'},400);
    const used=await db.from('family_messages').select('id',{count:'exact',head:true}).eq('direction','out').gte('created_at',new Date(Date.now()-86400000).toISOString());
    if(used.error)return respond(req,{error:'Unable to verify sending limit'},500);
    if((used.count||0)+ids.length>250)return respond(req,{error:'Daily safety limit of 250 outgoing SMS reached'},429);
    const old=await db.from('family_campaigns').select('id,body').eq('id',campaign).maybeSingle();
    if(old.error)return respond(req,{error:'Unable to verify message request'},500);
    if(old.data&&old.data.body!==body)return respond(req,{error:'This send ID was already used with different wording'},409);
    if(!old.data){const add=await db.from('family_campaigns').insert({id:campaign,campaign_name:String(input.campaign_name||'Wiggle Days update').trim().slice(0,100)||'Wiggle Days update',body,created_by:user.id});if(add.error&&add.error.code!=='23505')return respond(req,{error:'Could not save campaign'},500);}
    const res=await db.from('family_contacts').select('id,phone_e164,opted_in,archived,unsubscribed_at').in('id',ids);
    if(res.error)return respond(req,{error:'Unable to verify contact permissions'},500);
    const people=new Map((res.data||[]).map(c=>[c.id,c]));
    let accepted=0,skipped=0,failed=0;const pool=[...ids];
    async function worker(){while(pool.length){const id=pool.shift()!,c=people.get(id);if(!c||!c.opted_in||c.unsubscribed_at||c.archived){skipped++;continue;}const attempt=await db.from('family_messages').insert({contact_id:id,campaign_id:campaign,direction:'out',body,status:'queued'}).select('id').single();if(attempt.error){if(attempt.error.code==='23505')skipped++;else failed++;continue;}try{const sid=await sendSMS(c.phone_e164,body);const save=await db.from('family_messages').update({provider_sid:sid,status:'accepted',updated_at:new Date().toISOString()}).eq('id',attempt.data.id);if(save.error)throw Error('Provider accepted SMS, but receipt recording failed');accepted++;}catch(e){await db.from('family_messages').update({status:'failed',error_detail:String(e).slice(0,200),updated_at:new Date().toISOString()}).eq('id',attempt.data.id);failed++;}}}
    await Promise.all(Array.from({length:Math.min(3,pool.length)},worker));
    return respond(req,{ok:true,accepted,failed,skipped});
  }catch(e){return respond(req,{error:'Server error: '+String(e).slice(0,180)},500);}
});