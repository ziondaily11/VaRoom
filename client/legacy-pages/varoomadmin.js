/* DATA LAYER: D keeps the render field names stable while values come from the admin API. */
const $=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CUR='$',money=n=>CUR+Math.round(n).toLocaleString('en-US'),sum=a=>a.reduce((x,y)=>x+y,0),
dt=s=>new Date(s).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),
dd=s=>new Date(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
const IC={
mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
ov:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
si:'<path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
rv:'<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
sp:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
rp:'<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
us:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M17 4a4 4 0 010 8M22 21a7 7 0 00-4-6"/>',
ls:'<path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/>',
up:'<path d="M3 11v3a1 1 0 001 1h3l8 5V5L7 10H4a1 1 0 00-1 1zM19 8a5 5 0 010 8"/>',
gr:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
ac:'<path d="M3 12a9 9 0 109-9 9 9 0 00-6.7 3M3 4v4h4M12 7v5l3 2"/>',
ad:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
nw:'<path d="M4 4h13a2 2 0 012 2v14H6a2 2 0 01-2-2zM19 8h2v10a2 2 0 01-2 2M8 8h7M8 12h7M8 16h4"/>',
se:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
bell:'<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
dl:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
out:'<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>'};
const ic=n=>`<svg class="ic" viewBox="0 0 24 24">${IC[n]}</svg>`;
const NAV=[['ov','Overview'],['si','Sign-ins'],['rv','Revenue'],['sp','Support'],['rp','Listing reports'],['us','Users'],['ls','Listings'],['up','Varoom Updates'],['gr','Growth'],['ac','Admin activity'],['ad','Admins'],['nw','Property News']];
const DAYS=[...Array(14)].map((_,i)=>new Date(Date.now()-(13-i)*86400000).toISOString().slice(5,10));
const D={signins:[],revenue:[],tot:[],si:[],us:[],ls:[],lr:[],cr:[],de:[],tk:[],nw:[],up:[],ad:[],ac:[],tx:[]};
const api=async(path,options={})=>{const r=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(body&&body.error||'Request failed');return body};
let adminUser=null;
const log=async(action,target,reason='')=>{D.ac.unshift({admin:adminUser&&adminUser.name||'Admin',action,target,reason,at:new Date().toISOString()});};
const cnt=()=>({sp:D.tk.filter(t=>t.status=='open').length,rp:D.cr.filter(r=>r.status=='pending').length+D.lr.filter(r=>r.status=='pending').length,nw:D.nw.filter(n=>n.status=='proposed').length});
async function loadData(){
 const [si,rv,sp,rp,ur,de,gr,ad,us,ls,up,ac]=await Promise.all([api('/admin/signins?range=14'),api('/admin/revenue?range=14'),api('/admin/support/tickets'),api('/admin/reports'),api('/admin/user-reports'),api('/admin/account-deletions'),api('/admin/growth?range=14'),api('/admin/admins'),api('/admin/users'),api('/admin/listings'),api('/admin/updates'),api('/admin/activity')]);
 D.si=(si.data||[]).map(x=>({u:x.user,m:x.method,d:x.device,at:x.time})); D.signins=(si.series||[]).map(x=>x.signins||0);
 D.tx=(rv.transactions||[]).map(x=>({id:x.id,listing:x.listing||'—',guest:x.payer||'—',amt:Number(x.amount||0),at:x.date,status:'paid'})); D.revenue=(rv.series||[]).map(x=>Number(x.revenue||0));
 D.tk=(sp.data||[]).map(x=>({id:x.id,user:x.name,email:x.email,subject:x.subject,pri:x.priority,status:x.status==='in_progress'?'progress':x.status,at:x.createdAt,msg:x.message,replies:[]}));
 D.lr=(rp.data||[]).map(x=>({id:x.id,listing:x.listing||'—',reporter:x.reporter||'—',reason:x.reason,status:x.status,filed:x.createdAt})); D.cr=(ur.data||[]).map(x=>({id:x.id,reported:x.reportedUser&&(x.reportedUser.full_name||x.reportedUser.username)||x.reported_user_id,reporter:x.reporter&&(x.reporter.full_name||x.reporter.username)||x.reporter_user_id,reason:x.reason,status:x.status,filed:x.createdAt}));
 D.de=de.data||[]; D.tot=(gr.series||[]).map(x=>x.signups||0); D.ad=(ad.data||[]).map(x=>({name:x.name,email:x.email,role:x.role,last:x.lastLogin,status:'active'})); D.us=(us.data||[]).map(x=>({id:x.id,name:x.profile&&(x.profile.full_name||x.profile.username)||'Unnamed user',email:x.email,role:x.profile&&x.profile.role||'user',joined:x.created_at,status:x.account&&x.account.status||'active'}));
 D.ls=(ls.data||[]).map(x=>({id:x.id,name:x.title,owner:x.owner&&(x.owner.full_name||x.owner.username)||x.host_id,city:'—',price:0,created:x.created_at,avail:x.availability_status||'available',mod:x.moderation_status||'active',reason:x.moderation_reason||''})); D.up=(up.data||[]).map(x=>({title:x.title||'',body:x.body,aud:'All users',at:x.published_at||x.created_at,status:x.status,id:x.id})); D.ac=(ac.data||[]).map(x=>({admin:x.admin&&x.admin.name||'System',action:x.action,target:`${x.target_type}: ${x.target_id}`,reason:x.reason||'',at:x.created_at}));
 D.nw=[]; try { const news=await api('/admin/news/pending'); D.nw=(Array.isArray(news)?news:news.items||[]).map(x=>{const n=x.item||x;return {id:n.id,title:n.title||n.headline||'',src:n.source||n.src||'',url:n.url||n.source_url||'',at:n.created_at||n.published_at||new Date().toISOString(),status:n.status||'proposed',body:n.body||n.summary||n.excerpt||'',reason:n.rejection_reason||''};}); } catch(e) { toast(e.message); }
}
const pill=(t,k)=>`<span class="pl ${k||t}">${esc(t)}</span>`;
const ph=(t,s,r='')=>`<div class="ph"><div><h1>${t}</h1><p>${s}</p></div><div>${r}</div></div>`;
const card=(t,b)=>`<section class="cd"><div class="ct"><h3>${t}</h3></div>${b}</section>`;
const kpi=(l,v,s,c)=>`<div class="kp ${c}"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
const dlt=a=>{const p=sum(a.slice(0,7)),c=sum(a.slice(7));return c>=p?`▲ ${p?Math.round((c-p)/p*100)+'%':'new'} vs previous 7d`:`▼ ${Math.round((p-c)/p*100)}% vs previous 7d`};
const kv=o=>'<dl>'+Object.entries(o).map(([k,v])=>`<dt>${k}</dt><dd>${v&&v.h!=null?v.h:esc(v)}</dd>`).join('')+'</dl>';
const V=$('#view');
function toast(m){const t=document.createElement('div');t.className='ts';t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),2400)}
function drawer(title,html){const d=$('#dr');d.innerHTML=`<div class="dh"><h3>${esc(title)}</h3><button class="btn" data-x>✕</button></div><div class="db">${html}</div>`;d.classList.add('open');$('[data-x]',d).onclick=()=>d.classList.remove('open');return $('.db',d)}
function ask({title,text='',field,hint='',ok='Confirm',danger,min=0}){return new Promise(res=>{
const m=document.createElement('div');m.className='mo';
m.innerHTML=`<div class="md"><h3>${esc(title)}</h3><p>${esc(text)}</p>${field?`<label>${esc(field)}</label><textarea rows="3" placeholder="${esc(hint)}"></textarea>`:''}<div class="ra"><button class="btn" data-c>Cancel</button><button class="btn ${danger?'dn':'pr'}" data-o>${esc(ok)}</button></div></div>`;
document.body.append(m);const t=$('textarea',m),o=$('[data-o]',m),chk=()=>{o.disabled=!!t&&t.value.trim().length<min};
if(t){t.oninput=chk;t.focus()}chk();
const done=v=>{m.remove();res(v)};
o.onclick=()=>{o.disabled=true;done(t?t.value.trim():true)};
m.onclick=e=>{if(e.target===m||e.target.hasAttribute('data-c'))done(null)}})}
function chart(t,v,lb,f=String,c='var(--ac)'){
const W=640,H=230,L=52,T=10,B=26,w=W-L-10,h=H-T-B,mx=Math.max(...v,1),st=w/v.length,y=x=>T+h-x/mx*h;
let s=`<svg class="ch" viewBox="0 0 ${W} ${H}" style="--c:${c}">`;
for(let k=0;k<5;k++){const q=mx*k/4;s+=`<line class="gl" x1="${L}" x2="${W-10}" y1="${y(q)}" y2="${y(q)}"/><text class="tk" x="${L-6}" y="${y(q)+4}" text-anchor="end">${f(Math.round(q))}</text>`}
v.forEach((x,i)=>{const cx=L+st*(i+.5);if(i%3==0)s+=`<text class="tk" x="${cx}" y="${H-8}" text-anchor="middle">${lb[i]}</text>`;if(t=='bar')s+=`<rect class="bar" x="${cx-st*.32}" y="${y(x)}" width="${st*.64}" height="${T+h-y(x)}" rx="3"><title>${lb[i]}: ${f(x)}</title></rect>`});
if(t=='line'){const p=v.map((x,i)=>`${L+st*(i+.5)},${y(x)}`);s+=`<polygon class="ar" points="${L+st*.5},${T+h} ${p.join(' ')} ${L+st*(v.length-.5)},${T+h}"/><polyline class="ln" points="${p.join(' ')}"/>`+v.map((x,i)=>`<circle class="dot" cx="${L+st*(i+.5)}" cy="${y(x)}" r="3"><title>${lb[i]}: ${f(x)}</title></circle>`).join('')}
return s+'</svg>'}
function tbl(el,{cols,rows,size=8,open,on,empty='Nothing here yet.'}){
let q='',sk=-1,sd=1,pg=0;
el.innerHTML=`<div class="tb"><label class="sr">${ic('se')}<input placeholder="Filter this table…"></label><button class="btn" data-csv>${ic('dl')} CSV</button></div><div class="tw"><table><thead><tr>${cols.map((c,i)=>`<th data-i="${i}">${c.h}</th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="pg"></div>`;
const tb=$('tbody',el),pe=$('.pg',el);
const view=()=>{let r=rows.filter(x=>!q||cols.some(c=>String(c.v(x)).toLowerCase().includes(q)));if(sk>=0)r=[...r].sort((a,b)=>(cols[sk].v(a)>cols[sk].v(b)?1:-1)*sd);return r};
const draw=()=>{const r=view(),pgs=Math.max(1,Math.ceil(r.length/size));pg=Math.min(pg,pgs-1);
tb.innerHTML=r.length?r.slice(pg*size,pg*size+size).map(x=>`<tr data-i="${rows.indexOf(x)}">${cols.map(c=>`<td>${c.r?c.r(x):esc(c.v(x))}</td>`).join('')}</tr>`).join(''):`<tr><td class="em" colspan="${cols.length}">${empty}</td></tr>`;
pe.innerHTML=`<span>${r.length} row${r.length==1?'':'s'}</span><span><button class="btn sm" data-p="-1" ${pg?'':'disabled'}>‹</button> ${pg+1} / ${pgs} <button class="btn sm" data-p="1" ${pg<pgs-1?'':'disabled'}>›</button></span>`};
$('input',el).oninput=e=>{q=e.target.value.toLowerCase();pg=0;draw()};
$('thead',el).onclick=e=>{const t=e.target.closest('th');if(!t)return;const i=+t.dataset.i;sd=sk==i?-sd:1;sk=i;draw()};
pe.onclick=e=>{const b=e.target.closest('[data-p]');if(b){pg+=+b.dataset.p;draw()}};
$('[data-csv]',el).onclick=()=>{const c=v=>'"'+String(v).replace(/"/g,'""')+'"',t=[cols.map(x=>c(x.h)),...view().map(r=>cols.map(x=>c(x.v(r))))].map(r=>r.join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download='export.csv';a.click()};
tb.onclick=e=>{const b=e.target.closest('[data-a]'),tr=e.target.closest('tr');if(!tr||tr.dataset.i==null)return;const row=rows[+tr.dataset.i];
if(b){b.disabled=true;Promise.resolve(on&&on(b.dataset.a,row)).then(()=>{draw();badges()})}else if(open)open(row)};
draw()}
const queue=()=>{const c=cnt();return '<ul class="q">'+[['rp','Pending user reports',c.rp],['nw','Property news awaiting review',c.nw],['sp','Open support tickets',c.sp]].map(([k,l,n])=>`<li><button data-go="${k}">${l}<b class="${n?'hot':''}">${n}</b></button></li>`).join('')+'</ul>'};
const feed=a=>'<ul class="fd">'+a.map(x=>`<li><i></i><div><b>${esc(x.action)}</b><span>${esc(x.target)}</span><small>${esc(x.admin)} · ${dt(x.at)}${x.reason?' · '+esc(x.reason):''}</small></div></li>`).join('')+'</ul>';
const P={};
P.ov=()=>{const c=cnt(),h=new Date().getHours(),g=h<12?'Good morning':h<18?'Good afternoon':'Good evening',nl=D.ls.filter(l=>l.created>='2026-09-17').length;
V.innerHTML=ph(`${g}, Admin`,'A snapshot of sign-ins, revenue, support, and growth across the platform.')+
`<div class="g4">${kpi('Sign-ins (7d)',sum(D.signins.slice(7)),dlt(D.signins),'k1')}${kpi('Revenue (7d)',money(sum(D.revenue.slice(7))),dlt(D.revenue),'k2')}${kpi('Open support tickets',c.sp,c.sp?'Needs attention':'All clear','k3')}${kpi('New listings (7d)',nl,'Last 7 days','k4')}</div>
<div class="g2">${card('Sign-ins, last 14 days',chart('bar',D.signins,DAYS))}${card('Revenue, last 14 days',chart('line',D.revenue,DAYS,money,'var(--bl)'))}</div>
<div class="g2">${card('Needs attention',queue())}${card('Recent admin activity',feed(D.ac.slice(0,5)))}</div>`};
P.si=()=>{V.innerHTML=ph('Sign-ins','Who is signing in, and how.')+`<div class="g4">${kpi('Sign-ins (7d)',sum(D.signins.slice(7)),dlt(D.signins),'k1')}${kpi('Sign-ins (14d)',sum(D.signins),'Last 14 days','k2')}${kpi('Accounts',D.us.length,'Total users','k4')}</div>`+card('Daily sign-ins',chart('bar',D.signins,DAYS))+card('Recent sign-ins','<div id="t1"></div>');
tbl($('#t1'),{rows:D.si,cols:[{h:'User',v:x=>x.u},{h:'Method',v:x=>x.m},{h:'Device',v:x=>x.d},{h:'When',v:x=>x.at,r:x=>dt(x.at)}]})};
P.rv=()=>{const g=sum(D.tx.map(t=>t.amt));V.innerHTML=ph('Revenue','Bookings and payments.')+`<div class="g4">${kpi('Revenue (7d)',money(sum(D.revenue.slice(7))),dlt(D.revenue),'k2')}${kpi('Bookings',D.tx.length,'Recent transactions','k1')}${kpi('Average booking',money(g/D.tx.length),'Recent transactions','k4')}${kpi('Largest booking',money(Math.max(...D.tx.map(t=>t.amt))),'Recent transactions','k3')}</div>`+card('Revenue, last 14 days',chart('line',D.revenue,DAYS,money,'var(--bl)'))+card('Transactions','<div id="t1"></div>');
tbl($('#t1'),{rows:D.tx,cols:[{h:'Booking',v:x=>x.id},{h:'Listing',v:x=>x.listing},{h:'Guest',v:x=>x.guest},{h:'Amount',v:x=>x.amt,r:x=>money(x.amt)},{h:'Date',v:x=>x.at,r:x=>dd(x.at)},{h:'Status',v:x=>x.status,r:x=>pill(x.status)}]})};
const stLabel=s=>s=='progress'?'In progress':s[0].toUpperCase()+s.slice(1);
const stCls=s=>s=='progress'?'in-progress':s;
let selTk=null;
function tkDetail(t){
return `<div class="dtop"><code>${esc(t.id)}</code>${pill(stLabel(t.status),stCls(t.status))}</div>
<h3>${esc(t.subject)}</h3><p class="sb">${esc(t.user)} · ${esc(t.email)}</p><p>${esc(t.msg)}</p>
${t.replies.length?'<div class="thread">'+t.replies.map(r=>`<div class="rmsg"><b>${ic('mail')} Sent to ${esc(t.email)}</b><small>${dt(r.at)}</small><p>${esc(r.body)}</p></div>`).join('')+'</div>':''}
<div class="cmp"><label>${ic('mail')} Email reply</label><p class="sb">To ${esc(t.email)}</p>
<input id="rsub" value="Re: ${esc(t.subject)}">
<textarea id="rbody" rows="5" placeholder="Type a reply — this sends an email to the address above"></textarea>
<div class="ra" style="justify-content:flex-start"><button class="btn pr" id="sendr">${ic('mail')} Send email reply</button>
<select id="stsel"><option value="open" ${t.status=='open'?'selected':''}>Mark open</option><option value="progress" ${t.status=='progress'?'selected':''}>Mark in progress</option><option value="resolved" ${t.status=='resolved'?'selected':''}>Mark resolved</option></select></div></div>`}
function wireTkDetail(){const t=D.tk.find(x=>x.id==selTk);if(!t)return;
$('#sendr').onclick=async()=>{const body=$('#rbody').value.trim();if(!body)return toast('Write a reply before sending');try{await api('/admin/support/tickets/'+encodeURIComponent(t.id)+'/replies',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({message:body})});await loadData();toast('Reply sent to '+t.email);P.sp()}catch(e){toast(e.message)}};
$('#stsel').onchange=async e=>{if(e.target.value==t.status)return;try{await api('/admin/support/tickets/'+encodeURIComponent(t.id),{method:'PATCH',body:JSON.stringify({status:e.target.value==='progress'?'in_progress':e.target.value})});await loadData();toast('Status updated');P.sp()}catch(err){toast(err.message)} }}
P.sp=()=>{if(!selTk&&D.tk.length)selTk=D.tk[0].id;
const c={open:D.tk.filter(t=>t.status=='open').length,progress:D.tk.filter(t=>t.status=='progress').length,resolved:D.tk.filter(t=>t.status=='resolved').length};
const list=D.tk.map(t=>`<div class="tkc ${t.id==selTk?'sel':''}" data-id="${t.id}"><h4>${esc(t.subject)}</h4><div class="tkc-meta">${pill(stLabel(t.status),stCls(t.status))}<span>${dt(t.at)}</span></div></div>`).join('')||'<p class="em">No tickets. Nothing needs attention.</p>';
const sel=D.tk.find(t=>t.id==selTk);
V.innerHTML=ph('Support','Messages submitted through the support page. This is the pipeline that previously went nowhere.')+
`<div class="g4">${kpi('Open',c.open,c.open?'Needs attention':'All clear','k3')}${kpi('In progress',c.progress,'Being worked on','k4')}${kpi('Resolved',c.resolved,'All time','k1')}</div>`+
`<div class="spl"><div class="spl-list">${list}</div><div class="spl-detail">${sel?tkDetail(sel):'<p class="em">Select a ticket to view it.</p>'}</div></div>`;
$$('.tkc',V).forEach(c=>c.onclick=async()=>{selTk=c.dataset.id;try{const detail=await api('/admin/support/tickets/'+encodeURIComponent(selTk));const ticket=D.tk.find(t=>t.id==selTk);if(ticket)ticket.replies=(detail.replies||[]).map(r=>({body:r.message,at:r.sent_at}));}catch(e){toast(e.message)}P.sp()});
if(sel)wireTkDetail()};
P.rp=()=>{V.innerHTML=ph('Listing reports','Issues flagged by guests or hosts about a listing.')+card('Listing reports','<div id="t1"></div>')+card('Chat user reports','<p class="sb">Reports submitted about conversation participants.</p><div id="t2"></div>')+card('Deleted accounts','<p class="sb">Permanent account deletions and the reasons users provided.</p><div id="t3"></div>');
tbl($('#t1'),{rows:D.lr,empty:'No listing reports. Nothing to review.',cols:[{h:'Report',v:x=>x.id},{h:'Listing',v:x=>x.listing},{h:'Reporter',v:x=>x.reporter},{h:'Reason',v:x=>x.reason},{h:'Status',v:x=>x.status,r:x=>pill(x.status)},{h:'Filed',v:x=>x.filed,r:x=>dt(x.filed)},{h:'Action',v:x=>x.status,r:x=>x.status=='pending'?'<button class="btn sm pr" data-a="rs">Resolve</button> <button class="btn sm" data-a="ds">Dismiss</button>':'—'}],on:async(a,x)=>{if(x.status!='pending')return;try{await api('/admin/reports/'+encodeURIComponent(x.id),{method:'PATCH',body:JSON.stringify({status:a=='rs'?'resolved':'dismissed'})});await loadData();toast('Report updated');P.rp()}catch(e){toast(e.message)}}});
tbl($('#t2'),{rows:D.cr,empty:'No chat reports.',cols:[{h:'Report',v:x=>x.id,r:x=>`<code>${esc(x.id)}</code>`},{h:'Reported user',v:x=>x.reported},{h:'Reporter',v:x=>x.reporter},{h:'Reason',v:x=>x.reason},{h:'Status',v:x=>x.status,r:x=>pill(x.status)},{h:'Filed',v:x=>x.filed,r:x=>dt(x.filed)},{h:'Action',v:x=>x.status,r:x=>x.status=='pending'?'<button class="btn sm pr" data-a="rs">Resolve</button> <button class="btn sm" data-a="ds">Dismiss</button>':'—'}],
on:async(a,x)=>{if(x.status!='pending')return;try{await api('/admin/user-reports/'+encodeURIComponent(x.id),{method:'PATCH',body:JSON.stringify({status:a=='rs'?'resolved':'dismissed'})});await loadData();toast('Report updated');P.rp()}catch(e){toast(e.message)} }});
tbl($('#t3'),{rows:D.de,empty:'No deleted accounts.',cols:[{h:'Account',v:x=>x.id,r:x=>`<code>${esc(x.id)}</code>`},{h:'Email',v:x=>x.email},{h:'Reason',v:x=>x.reason},{h:'Detail',v:x=>x.detail||'—'},{h:'Deleted',v:x=>x.at,r:x=>dt(x.at)}]})};
P.us=()=>{V.innerHTML=ph('Users','Guests and hosts on the platform.')+card('All users','<div id="t1"></div>');
tbl($('#t1'),{rows:D.us,cols:[{h:'Name',v:x=>x.name,r:x=>`<b>${esc(x.name)}</b>`},{h:'Email',v:x=>x.email},{h:'Role',v:x=>x.role,r:x=>pill(x.role)},{h:'Listings',v:x=>D.ls.filter(l=>l.owner==x.name).length},{h:'Joined',v:x=>x.joined,r:x=>dd(x.joined)},{h:'Status',v:x=>x.status,r:x=>pill(x.status)},{h:'Action',v:x=>x.status,r:x=>x.status=='active'?'<button class="btn sm dn" data-a="su">Suspend</button>':'<button class="btn sm" data-a="re">Restore</button>'}],
open:u=>drawer(u.name,kv({ID:u.id,Email:u.email,Role:{h:pill(u.role)},Status:{h:pill(u.status)},Joined:dd(u.joined),Listings:D.ls.filter(l=>l.owner==u.name).map(l=>l.name).join(', ')||'None'})),
on:async function(a,u){if(a=='su'){if(u.status=='suspended')return;const r=await ask({title:'Suspend '+u.name,text:'They will be unable to book or host until restored.',field:'Reason',hint:'Why is this account being suspended?',min:5,ok:'Suspend',danger:1});if(!r)return;try{await api('/admin/users/'+encodeURIComponent(u.id)+'/status',{method:'POST',body:JSON.stringify({status:'suspended',reason:r})});await loadData();toast('Updated '+u.name);P.us()}catch(e){toast(e.message)}}else{if(u.status=='active')return;try{await api('/admin/users/'+encodeURIComponent(u.id)+'/status',{method:'POST',body:JSON.stringify({status:'active',reason:''})});await loadData();toast('Updated '+u.name);P.us()}catch(e){toast(e.message)}}}});
P.ls=()=>{V.innerHTML=ph('Listings','Moderation is reversible. Hidden and removed listings are taken out of the client and host feed by their status.')+card('All listings','<div id="t1"></div>');
tbl($('#t1'),{rows:D.ls,size:10,cols:[{h:'Listing',v:x=>x.name,r:x=>`<b>${esc(x.name)}</b>`},{h:'Owner',v:x=>x.owner},{h:'City',v:x=>x.city},{h:'Price / night',v:x=>x.price,r:x=>money(x.price)},{h:'Availability',v:x=>x.avail,r:x=>pill(x.avail)},{h:'Moderation',v:x=>x.mod,r:x=>pill(x.mod)},{h:'Reason',v:x=>x.reason||'—'},
{h:'Actions',v:x=>x.mod,r:l=>l.mod=='active'?'<button class="btn sm dn" data-a="hd">Hide</button> <button class="btn sm dn" data-a="td">Take down</button>':l.mod=='hidden'?'<button class="btn sm" data-a="re">Restore</button> <button class="btn sm dn" data-a="td">Take down</button>':'<button class="btn sm" data-a="re">Restore</button>'}],
open:l=>drawer(l.name,kv({ID:l.id,Owner:l.owner,City:l.city,Price:money(l.price)+' / night',Created:dd(l.created),Availability:{h:pill(l.avail)},Moderation:{h:pill(l.mod)},Reason:l.reason||'—'})),
on:async function(a,l){if(a=='re'){if(l.mod=='active')return;try{await api('/admin/listings/'+encodeURIComponent(l.id)+'/moderation',{method:'POST',body:JSON.stringify({status:'active',reason:''})});await loadData();toast('Listing updated');P.ls()}catch(e){toast(e.message)}}else{if(l.mod=='removed'||(a=='hd'&&l.mod=='hidden'))return;const hd=a=='hd',r=await ask({title:(hd?'Hide ':'Take down ')+l.name,text:hd?'It will be hidden from the feed until restored.':'It will be removed from the feed. You can restore it later.',field:'Reason',hint:'Add a reason for the audit trail',min:5,ok:hd?'Hide listing':'Take down',danger:1});if(!r)return;try{await api('/admin/listings/'+encodeURIComponent(l.id)+'/moderation',{method:'POST',body:JSON.stringify({status:hd?'hidden':'removed',reason:r})});await loadData();toast('Listing updated');P.ls()}catch(e){toast(e.message)}}}});
P.up=()=>{V.innerHTML=ph('Varoom Updates','Announcements shown to users and hosts.')+`<div class="g2"><section class="cd fm"><div class="ct"><h3>New update</h3></div><label>Title</label><input id="ut"><label>Message</label><textarea id="um" rows="4"></textarea><label>Audience</label><select id="ua"><option>All users</option><option>Hosts</option><option>Guests</option></select><button class="btn pr" id="pb">Publish update</button></section>${card('Published',D.up.map(u=>`<div class="nc"><div><h3>${esc(u.title)}</h3><small>${esc(u.aud)} · ${dt(u.at)}</small><p>${esc(u.body)}</p></div></div>`).join('')||'<p class="em">No updates yet. Publish your first one.</p>')}</div>`;
$('#pb').onclick=async()=>{const t=$('#ut').value.trim(),m=$('#um').value.trim();if(!t||!m)return toast('Add a title and a message');try{await api('/admin/updates',{method:'POST',body:JSON.stringify({title:t,body:m,status:'published'})});await loadData();toast('Update published');go()}catch(e){toast(e.message)}}};
P.gr=()=>{const F=[['Visitors',1840],['Sign-ups',96],['Viewed a listing',64],['Sent an inquiry',21],['Booked',7]];
V.innerHTML=ph('Growth','Accounts, hosts and conversion.')+`<div class="g4">${kpi('Total users',D.us.length,dlt(D.signins),'k1')}${kpi('Hosts',D.us.filter(u=>u.role=='host').length,'Verified and unverified','k2')}${kpi('Guests',D.us.filter(u=>u.role=='guest').length,'Booking accounts','k4')}${kpi('Live listings',D.ls.filter(l=>l.mod=='active').length,'Visible in the feed','k3')}</div><div class="g2">${card('Total users, last 14 days',chart('line',D.tot,DAYS))}${card('Conversion funnel',F.map(([l,n])=>`<div class="fn"><span>${l}</span><i style="width:${n/F[0][1]*100}%"></i><b>${n}</b></div>`).join(''))}</div>`};
P.ac=()=>{V.innerHTML=ph('Admin activity','An append-only audit trail for account, content and report actions.')+card('Audit log','<div id="t1"></div>');
tbl($('#t1'),{rows:D.ac,size:12,cols:[{h:'Admin',v:x=>x.admin},{h:'Action',v:x=>x.action,r:x=>`<b>${esc(x.action)}</b>`},{h:'Target',v:x=>x.target,r:x=>`<code>${esc(x.target)}</code>`},{h:'Reason',v:x=>x.reason||'—'},{h:'Date',v:x=>x.at,r:x=>dt(x.at)}]})};
P.ad=()=>{V.innerHTML=ph('Admins','People with access to this console.','<button class="btn pr" id="iv">Invite admin</button>')+card('Admins','<div id="t1"></div>');
tbl($('#t1'),{rows:D.ad,cols:[{h:'Name',v:x=>x.name,r:x=>`<b>${esc(x.name)}</b>`},{h:'Email',v:x=>x.email},{h:'Role',v:x=>x.role},{h:'Last active',v:x=>x.last,r:x=>x.last?dt(x.last):'—'},{h:'Status',v:x=>x.status,r:x=>pill(x.status)}]});
$('#iv').onclick=async()=>{const e=await ask({title:'Invite admin',text:'They will join as a moderator.',field:'Email address',hint:'name@example.com',min:5,ok:'Send invite'});if(!e)return;try{await api('/admin/admins',{method:'POST',body:JSON.stringify({name:e,email:e,role:'support'})});await loadData();toast('Invite sent');go()}catch(err){toast(err.message)}}};
let nt='proposed';
P.nw=()=>{const L=D.nw.filter(n=>nt=='all'||n.status==nt);
V.innerHTML=ph('Property News','Review source-backed reports before they appear publicly or in Elie.')+`<div class="tabs">${['proposed','published','rejected','all'].map(t=>`<button class="btn ${t==nt?'on':''}" data-t="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>`+(L.map(n=>`<div class="nc"><div><h3>${esc(n.title)}</h3><small>${esc(n.src)} · ${dd(n.at)} · ${pill(n.status)}${n.url?` · <a href="${esc(n.url)}" target="_blank" rel="noopener">View source</a>`:''}</small><p>${esc(n.body)}</p>${n.reason?`<small>Rejected: ${esc(n.reason)}</small>`:''}</div>${n.status=='proposed'?`<div class="ra" data-id="${n.id}"><button class="btn pr" data-a="ok">Approve</button><button class="btn dn" data-a="no">Reject</button></div>`:''}</div>`).join('')||'<p class="em">Nothing in this tab.</p>');
$$('[data-t]',V).forEach(b=>b.onclick=()=>{nt=b.dataset.t;P.nw()});
$$('[data-a]',V).forEach(b=>b.onclick=async()=>{const n=D.nw.find(x=>x.id==b.parentNode.dataset.id),bs=$$('button',b.parentNode);if(!n||n.status!='proposed')return;bs.forEach(x=>x.disabled=true);
if(b.dataset.a=='ok'){try{await api('/admin/news/'+encodeURIComponent(n.id)+'/approve',{method:'POST',body:JSON.stringify({})})}catch(e){toast(e.message);bs.forEach(x=>x.disabled=false);return}}else{const r=await ask({title:'Reject this article?',text:n.title,field:'Reason',hint:'Why is it being rejected?',min:5,ok:'Reject',danger:1});if(!r){bs.forEach(x=>x.disabled=false);return}try{await api('/admin/news/'+encodeURIComponent(n.id)+'/reject',{method:'POST',body:JSON.stringify({reason:r})})}catch(e){toast(e.message);bs.forEach(x=>x.disabled=false);return}}
await loadData();toast(b.dataset.a=='ok'?'Article published':'Article rejected');go()})};
let cur='ov';
function badges(){const c=cnt();$('nav').innerHTML=NAV.map(([k,l])=>`<button data-go="${k}" class="${k==cur?'on':''}">${ic(k)}<span>${l}</span>${c[k]?`<span class="n">${c[k]}</span>`:''}</button>`).join('');const t=c.sp+c.rp+c.nw;$('#bn').textContent=t;$('#bn').hidden=!t}
function go(){const k=location.hash.slice(1);cur=P[k]?k:'ov';badges();$('#dr').classList.remove('open');document.body.classList.remove('nv');P[cur]()}
addEventListener('hashchange',()=>{if(isAuthed()){go();scrollTo(0,0)}});
[['mb','menu'],['th','sun'],['bell','bell']].forEach(([i,n])=>$('#'+i).insertAdjacentHTML('afterbegin',ic(n)));
$('#sq').insertAdjacentHTML('afterbegin',ic('se'));$('#lo').innerHTML=ic('out')+'<span>Log out</span>';
$('#lo').onclick=async()=>{try{await api('/admin/logout',{method:'POST'})}catch(e){toast(e.message)}showLogin()};
$('#mb').onclick=()=>document.body.classList.toggle('nv');
$('#bell').onclick=()=>drawer('Needs attention',queue());
const setT=t=>{document.documentElement.dataset.t=t;try{localStorage.setItem('vt',t)}catch(e){}};
try{const t=localStorage.getItem('vt');if(t)document.documentElement.dataset.t=t}catch(e){}
$('#th').onclick=()=>setT(document.documentElement.dataset.t=='dark'?'light':'dark');
$('#q').onkeydown=e=>{if(e.key!='Enter')return;const q=e.target.value.trim().toLowerCase();if(!q)return;
const hit=(a,f,k,l)=>a.filter(x=>f(x).toLowerCase().includes(q)).map(x=>`<li><button data-go="${k}">${l}: ${esc(f(x))}</button></li>`),r=[...hit(D.us,x=>x.name,'us','User'),...hit(D.ls,x=>x.name,'ls','Listing'),...hit(D.tk,x=>x.subject,'sp','Ticket')];
drawer('Results for "'+e.target.value+'"',r.length?'<ul class="q">'+r.join('')+'</ul>':'<p class="em">No matches. Try a name, listing or ticket subject.</p>')};
addEventListener('keydown',e=>{if(e.key=='Escape')$('#dr').classList.remove('open');if(e.key=='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)location.hash=b.dataset.go});
async function isAuthed(){try{const r=await api('/admin/session');adminUser=r.admin;return true}catch(e){return false}}
async function showApp(){try{await loadData();$('#lg').hidden=true;$('#appRoot').hidden=false;go()}catch(e){$('#lerr').textContent=e.message;$('#lerr').hidden=false}}
function showLogin(){$('#appRoot').hidden=true;$('#lg').hidden=false;$('#lerr').hidden=true;$('#lf').reset();$('#le').focus()}
function wireLogin(){$('#lf').onsubmit=e=>{e.preventDefault();
const email=$('#le').value.trim(),pass=$('#lp').value;
api('/admin/login',{method:'POST',body:JSON.stringify({email,password:pass})}).then(r=>{adminUser=r.admin;return showApp()}).catch(err=>{$('#lerr').textContent=err.message;$('#lerr').hidden=false})}}}
wireLogin();
isAuthed().then(ok=>{if(ok)showApp();else showLogin()});
}
