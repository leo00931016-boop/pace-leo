'use strict';
const $=id=>document.getElementById(id), center=[24.1796,120.6495], KEY='campus-move-history-v1';
let records=[]; try { records=JSON.parse(localStorage.getItem(KEY)||'[]'); if(!Array.isArray(records)) records=[]; } catch {}
let map, route, halo=null, startMarker=null, positionDot, accuracyCircle, targetMarker, targetLine, target=null, current=null;
let session=null, watch=null, demoTimer=null, wake=null, last=null, lastSignal=0, lines=[], storageOK=true;

function message(s){ $('message').textContent=s; }
function pinIcon(kind,label){ return L.divIcon({ className:'map-pin-wrap map-pin-'+kind, html:'<span class="pin-body"><b>'+label+'</b></span>', iconSize:[30,30], iconAnchor:[15,30] }); }
function setTrack(ls){ if(route) route.setLatLngs(ls); if(halo) halo.setLatLngs(ls); }
function clearStart(){ if(startMarker&&map) map.removeLayer(startMarker); startMarker=null; }
function setStart(p){ clearStart(); if(map) startMarker=L.marker([p.lat,p.lng], { icon:pinIcon('start','起'), zIndexOffset:500 }).addTo(map).bindTooltip('起點'); }
function updateTarget(){ if(!target){ $('navigate').hidden=true; $('targetInfo').textContent='點一下地圖，設定老師指定的集合點。'; return; } let info='集合點已設定（依老師現場位置）'; if(map && target){ const d=Math.round(MoveCore.distance(current||target,{lat:target.lat,lng:target.lng})/10)/100; info+=' · 距離 '+d+' km'; } $('targetInfo').textContent=info; }
function clearTarget(){ target=null; for(const l of [targetMarker,targetLine]) if(l&&map) map.removeLayer(l); targetMarker=targetLine=null; updateTarget(); }
$('clearTarget').onclick=clearTarget; $('campus').onclick=()=>map&&map.setView(center,17);
function displayPosition(p){ current=p; if(map){ const ll=[p.lat,p.lng]; if(!positionDot){ positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map); accuracyCircle=L.circle(ll,{radius:p.accuracy,color:'#2f88b3',weight:1,fillOpacity:0.08}).addTo(map); } else { positionDot.setLatLng(ll); accuracyCircle.setLatLng(ll).setRadius(p.accuracy); } } $('accuracy').textContent=Math.round(p.accuracy)+' m'; updateTarget(); }
function normalize(pos){ return { lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy, t:pos.timestamp }; }
function seconds(){ return session ? session.seconds + (session.state==='running' && session.runStart ? (Date.now()-session.runStart)/1000 : 0) : 0; }
function fmt(n){ const s=Math.floor(n); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function render(){ document.body.classList.toggle('is-active', !!session && session.state!=='finished'); $('activityLabel').textContent = session?.demo ? '示範運動' : session?.mode?.split(' · ')[0] || '運動'; $('elapsed').textContent = fmt(seconds()); $('distance').textContent = (session?.meters || 0).toFixed(2); $('calories').textContent = session ? Math.round(session.kcal || 0) : 0; $('speed').textContent = session ? (session.averageSpeed || 0).toFixed(1) : '0.0'; $('points').textContent = session ? (session.validPoints || session.pointCount || 0) : 0; }
async function holdScreen(){ try { if('wakeLock' in navigator) wake=await navigator.wakeLock.request('screen'); } catch {} }
function stopWatch(){ if(watch!==null){ navigator.geolocation.clearWatch(watch); watch=null; } clearInterval(demoTimer); demoTimer=null; wake?.release().catch(()=>{}); wake=null; }
function receive(p){ if(!session || session.state!=='running') return; lastSignal=Date.now(); displayPosition(p); const result=MoveCore.accept(last,p); if(!result.ok){ message(result.reason); return; } if(!session.runStart) session.runStart=Date.now(); if(!last) { session.start=p; last=p; session.points=[p]; session.validPoints=1; lines=[[p.lat,p.lng]]; setTrack(lines); return; } if(result.break){ session.points.push(p); lines.push([p.lat,p.lng]); setTrack(lines); last=p; return; } const meters=Number(result.meters)||0; const dt=Number(result.dt)||0; if(dt>0 && meters>0){ session.meters=(session.meters||0)+meters; session.seconds=(session.seconds||0)+dt; session.averageSpeed = session.meters > 0 && session.seconds > 0 ? (session.meters / session.seconds) * 3.6 : 0; session.kcal = MoveCore.calories(session.met || 3.5, session.weight || 60, session.seconds); } session.points.push(p); lines.push([p.lat,p.lng]); setTrack(lines); last=p; }
function run(){ session.state='running'; session.runStart=Date.now(); last=null; lastSignal=Date.now(); if(session.demo){ demoTick(); demoTimer=setInterval(demoTick,1000); } else { watch=navigator.geolocation.watchPosition(pos=>receive(normalize(pos)), geoError, { enableHighAccuracy:true, maximumAge:0, timeout:15000 }); holdScreen(); } render(); }
function begin(demo){ const fields=demo ? ['height','weight','age'].map($) : [$('profile')]; if(!fields.every(el=>el.reportValidity())) return; if(!demo && !available()) return; $('setupDialog').close(); stopWatch(); session={ id:Date.now(), date:new Date().toISOString(), alias:$('alias').value.trim(), demo, met:Number($('mode').value || 3.5), height:Number($('height').value || 0), weight:Number($('weight').value || 0), age:Number($('age').value || 0), seconds:0, meters:0, kcal:0, averageSpeed:0, validPoints:0, pointCount:0, segmentCount:0, directDistance:0, fastestSpeed:0, maxSpeed:0, points:[], state:'ready', mode:$('mode').value, classId:$('classId').value || '' }; lines=[]; setTrack([]); clearStart(); message(demo ? '示範模式已啟動，將模擬移動。' : '開始運動紀錄。'); run(); }
$('profile').onsubmit=e=>{ e.preventDefault(); begin(false); }; $('demo').onclick=()=>begin(true);
function demoTick(){ const i=(session.demoIndex||0)+1; session.demoIndex=i; const angle=i*0.12; receive({ lat:center[0]+0.00062*Math.sin(angle), lng:center[1]+0.00085*Math.cos(angle), accuracy:6, t:Date.now() }); }
function pause(reason){ if(!session || session.state!=='running') return; session.seconds=seconds(); session.runStart=0; session.state='paused'; stopWatch(); last=null; message(reason || '已暫停'); render(); }
$('pause').onclick=()=>{ if(session.state==='running') pause(); else { message('等待新的有效定位後繼續…'); run(); } };
function persist(){ try { localStorage.setItem(KEY, JSON.stringify(records)); storageOK=true; } catch { storageOK=false; message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出資料。'); } }
$('finish').onclick=()=>{ if(!session || session.state==='finished') return; session.seconds=seconds(); session.runStart=0; session.state='finished'; stopWatch(); const analysis = MoveCore.analyzeTrack(session.points || lines || [], { met:Number(session.met||3.5), kg:Number(session.weight||60) }); session.seconds = Number(analysis.seconds || session.seconds || 0); session.meters = Number(analysis.meters || analysis.distance || 0); session.distance = Number(analysis.distance || analysis.meters || 0); session.averageSpeed = Number(analysis.averageSpeed || analysis.speed || 0); session.kcal = Number(analysis.kcal || analysis.calories || 0); session.validPoints = Number(analysis.validPoints || analysis.pointCount || 0); session.pointCount = Number(session.validPoints || 0); session.segmentCount = Number(analysis.segmentCount || analysis.segments || 0); session.segments = Number(session.segmentCount || 0); session.directDistance = Number(analysis.directDistance || analysis.straightDistance || 0); session.straightDistance = Number(session.directDistance || 0); session.fastestSpeed = Number(analysis.fastestSpeed || analysis.maxSpeed || 0); session.maxSpeed = Number(session.fastestSpeed || 0); records.push({ ...session, lines: lines.slice(), points: (session.points||[]).slice() }); persist(); render(); message('運動紀錄已儲存。'); };
function download(name,body,type){ const url=URL.createObjectURL(new Blob([body],{type})); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function cell(v){ let s=String(v??''); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }
function exportCSV(items){ if(!items.length){ message('目前沒有可匯出的紀錄。'); return; }
  const rows=[
    ['時間 ISO','課堂代號','類型','活動','身高 cm','體重 kg','年齡','時間[秒]','總距離 km','平均速度 km/h','估算熱量 kcal','有效 GPS 點','段數','起點到終點直線距離 km','最快相鄰點速度 km/h','狀態'],
    ...items.map(r => [
      r.date || r.iso || '',
      r.classId || r.alias || '',
      r.type || '',
      r.activity || r.mode || '',
      Number(r.height ?? 0),
      Number(r.weight ?? 0),
      Number(r.age ?? 0),
      Number(r.seconds ?? 0),
      Number(r.distance ?? r.meters ?? 0) / 1000,
      Number(r.averageSpeed ?? r.speed ?? 0),
      Number(r.kcal ?? r.calories ?? 0),
      Number(r.validPoints ?? r.pointCount ?? 0),
      Number(r.segmentCount ?? r.segments ?? 0),
      Number(r.directDistance ?? r.straightDistance ?? 0) / 1000,
      Number(r.maxSpeed ?? r.fastestSpeed ?? 0),
      r.state || ''
    ])
  ];
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
  download('campus-move.csv', csv, 'text/csv;charset=utf-8');
}
let historyFilter='all';
function routeThumbnail(r){ const box=document.createElement('div'); box.className='route-thumb'; const ns='http://www.w3.org/2000/svg'; const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 100 67'); svg.setAttribute('aria-label','路線'); const pts=(r.lines||[]).map(p=>`${50+(p[1]-center[1])*3000},${33-(p[0]-center[0])*3000}`).join(' '); if(pts){ const poly=document.createElementNS(ns,'polyline'); poly.setAttribute('points',pts); poly.setAttribute('fill','none'); poly.setAttribute('stroke','#2f88b3'); poly.setAttribute('stroke-width','2'); svg.appendChild(poly); } box.appendChild(svg); return box; }
function renderHistory(){ const root=$('records'); root.replaceChildren(); const actual=records.filter(r=>!r.demo); $('historyTotal').textContent = actual.length ? `${actual.length} 次運動 · ${(actual.reduce((s,r)=>s+r.meters||0,0)/1000).toFixed(2)} km` : '0 次運動'; const shown=records.filter(r => historyFilter==='all' || (historyFilter==='demo' ? !!r.demo : !r.demo)); if(!shown.length){ root.innerHTML='<div class="empty"><div class="empty-art"><svg><use href="#i-route"/></svg></div><div><h3>還沒有紀錄</h3><p>開始運動後，紀錄會出現在這裡。</p></div></div>'; return; } shown.forEach(r=>{ const row=document.createElement('div'); row.className='record'; row.append(routeThumbnail(r)); const info=document.createElement('div'); info.className='record-info'; const title=document.createElement('strong'); title.textContent = r.alias || r.mode || '運動'; const sub=document.createElement('small'); sub.textContent = new Date(r.date || Date.now()).toLocaleString('zh-TW',{ month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); info.append(title, sub); const stats=document.createElement('div'); stats.className='record-stats'; const fields=[['時間', fmt(r.seconds || 0)], ['距離', `${((r.distance || r.meters || 0)/1000).toFixed(2)} km`], ['熱量', `${Math.round(r.kcal || 0)} kcal`], ['速度', `${(r.averageSpeed || 0).toFixed(1)} km/h`]]; fields.forEach(([label,value])=>{ const item=document.createElement('span'); item.textContent = `${label}: ${value}`; stats.append(item); }); const actions=document.createElement('div'); actions.className='record-actions'; const exportBtn=document.createElement('button'); exportBtn.textContent='匯出CSV'; exportBtn.onclick=()=>exportCSV([r]); const delBtn=document.createElement('button'); delBtn.textContent='刪除'; delBtn.onclick=()=>{ records=records.filter(x=>x!==r); persist(); renderHistory(); }; actions.append(exportBtn, delBtn); row.append(info, stats, actions); root.append(row); }); }
$('openSetup').onclick=()=>$('setupDialog').showModal(); $('closeSetup').onclick=()=>$('setupDialog').close(); $('energyInfo').onclick=()=>$('energyDialog').showModal(); $('closeEnergy').onclick=()=>$('energyDialog').close(); $('todayDate').textContent = new Date().toLocaleDateString('zh-TW',{ month:'long', day:'numeric', weekday:'short' });
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{ historyFilter=button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b=>{ b.classList.toggle('selected', b===button); b.setAttribute('aria-pressed', String(b===button)); }); renderHistory(); });
$('exportAll').onclick=()=>exportCSV(records); $('deleteAll').onclick=()=>{ if(records.length && confirm('永久刪除此裝置全部運動紀錄？')){ records=[]; persist(); renderHistory(); } };
document.addEventListener('visibilitychange',()=>{ if(document.hidden && session?.state==='running') pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按繼續。'); });
window.addEventListener('beforeunload',e=>{ if(session && session.state!=='finished'){ e.preventDefault(); e.returnValue=''; } });
setInterval(()=>{ if(session?.state==='running' && !session.demo && Date.now()-lastSignal>30000) pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。'); render(); },1000);
renderHistory(); render(); if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{ document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a)); document.querySelector('.breadcrumb strong').textContent=a.textContent.trim(); }));
