'use strict';
const $=id=>document.getElementById(id), center=[24.1796,120.6495], KEY='campus-move-history-v1';
// Base map source is defined in tiles.js (CARTO Voyager, OpenStreetMap data). Change it there for school-wide use.
let records=[];try{records=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(records))records=[];}catch{}
let map, route, halo=null, startMarker=null, positionDot, accuracyCircle, targetMarker, targetLine, target=null, current=null;
let session=null, watch=null, demoTimer=null, wake=null, last=null, lastSignal=0, lines=[], storageOK=true;
function message(s){$('message').textContent=s;}
function pinIcon(kind,label){return L.divIcon({className:'map-pin-wrap map-pin-'+kind,html:'<span class="pin-body"><b>'+label+'</b></span>',iconSize:[30,30],iconAnchor:[15,30]});}
function setTrack(lines){if(route)route.setLatLngs(lines);if(halo)halo.setLatLngs(lines);}
function clearStart(){if(startMarker&&map)map.removeLayer(startMarker);startMarker=null;}
function setStart(p){clearStart();if(map)startMarker=L.marker([p.lat,p.lng],{icon:pinIcon('start','起'),zIndexOffset:500}).addTo(map).bindTooltip('起點');}
try{map=L.map('map',{zoomControl:false}).setView(center,17);L.control.zoom({position:'bottomright'}).addTo(map);addBaseMap(map).on('tileerror',()=>message('底圖載入失敗，請檢查網路；Google Maps／OpenStreetMap 圖資可能暫時不可用，仍可使用本地紀錄。'));}catch(err){message('地圖初始化失敗：'+err.message);}
function updateTarget(){if(!target){$('navigate').hidden=true;$('targetInfo').textContent='點一下地圖，設定老師指定的集合點。';return;}let info='集合點已設定（依老師指定的集合點判定）';if(target.dist!==undefined)info+=' · 目前距離 '+Math.round(target.dist)+' 公尺';$('targetInfo').textContent=info;$('navigate').hidden=false;}
function clearTarget(){target=null;for(const l of [targetMarker,targetLine])if(l&&map)map.removeLayer(l);targetMarker=targetLine=null;updateTarget();}
$('clearTarget').onclick=clearTarget;$('campus').onclick=()=>map&&map.setView(center,17);
function displayPosition(p){current=p;if(map){const ll=[p.lat,p.lng];if(!positionDot){positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map);accuracyCircle=L.circle(ll,p.accuracy,{color:'#2f88b3',fillColor:'#2f88b3',fillOpacity:.12}).addTo(map);}else{positionDot.setLatLng(ll);accuracyCircle.setLatLng(ll).setRadius(p.accuracy||16);}if(target){target.dist=MoveCore.distance(p,target);targetLine&&targetLine.setLatLngs([[p.lat,p.lng],[target.lat,target.lng]]);}}$('accuracy').textContent=(p.accuracy||'--')+' m';}
const GEO_REASONS={1:'定位權限被拒絕：請到瀏覽器／手機設定允許位置與精確定位後重試。',2:'目前無法取得位置，請移到戶外空曠處。',3:'定位逾時，請重試。',4:'定位服務錯誤，請稍後重試。'};
function geoError(err){if(session?.state==='running')pause('定位中斷，已暫停。'+(GEO_REASONS[err.code]||'請重試。'));else message(GEO_REASONS[err.code]||'定位失敗。');$('badge').textContent='● 定位不可用';}
function locateError(err){message(GEO_REASONS[err.code]||'定位失敗。');if(!session||session.state!=='running')$('badge').textContent='● 定位不可用';}
function available(){if(!window.isSecureContext){message('GPS 需要 HTTPS 網址（電腦本機 localhost 例外），請依部署說明開啟。');return false;}if(!navigator.geolocation){message('此裝置不支援 Geolocation。');return false;}return true;}
$('locate').onclick=()=>{if(session?.demo){message('示範模式使用模擬位置；結束後可取得真實定位。');return;}if(!available())return;message('正在取得你的定位…');navigator.geolocation.getCurrentPosition(p=>{displayPosition(normalize(p));message('已取得定位。');},geoError,{enableHighAccuracy:true,maximumAge:2000,timeout:15000});};
function normalize(pos){return {lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,t:pos.timestamp};}
function seconds(){return session?session.seconds+(session.state==='running'&&session.runStart?(Date.now()-session.runStart)/1000:0):0;}
function fmt(n){const s=Math.floor(n);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function render(){document.body.classList.toggle('is-active',!!session&&session.state!=='finished');$('activityLabel').textContent=session?.demo?'示範運動':session?.mode?.split(' · ')[0]||'運動';$('points').textContent=(session?.points||0)+' 點';if(session?.state==='running'){$('badge').textContent='● 記錄中';}else if(session?.state==='paused'){$('badge').textContent='● 已暫停';}else if(session?.state==='finished'){$('badge').textContent='● 完成';}else{$('badge').textContent='● 待開始';}}
async function holdScreen(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen');}catch{} }
function stopWatch(){if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}clearInterval(demoTimer);demoTimer=null;wake?.release().catch(()=>{});wake=null;}
function receive(p){if(!session||session.state!=='running')return;lastSignal=Date.now();displayPosition(p);const result=MoveCore.accept(last,p);if(!result.ok){message(result.reason);return;}if(!session.points)session.points=0;session.points++;session.history.push({...p,seg:result.break? 'break' : 'ok'});if(!last){last=p;setStart(p);session.points=1;message('開始記錄有效點。');return;}const dt=((p.t-last.t)/1000);const d=MoveCore.distance(last,p);if(dt>0&&d>=0){session.meters+=d;session.seconds+=dt;session.accumulatedSeconds+=dt;last=p;}if(result.break){session.segments++;message('偵測到 30 秒停頓，已新起一段。');} session.latestPoint=p; }
function run(){session.state='running';session.runStart=0;last=null;lastSignal=Date.now();if(session.demo){demoTick();demoTimer=setInterval(demoTick,1000);}else{watch=navigator.geolocation.watchPosition(pos=>receive(normalize(pos)),geoError,{enableHighAccuracy:true,maximumAge:2000,timeout:15000});}}
function begin(demo){const fields=demo?['height','weight','age'].map($):[$('profile')];if(!fields.every(el=>el.reportValidity()))return;if(!demo&&!available())return;$('setupDialog').close();stopWatch();session={demo,mode:demo?'示範運動':'舒適步行',points:0,segments:1,meters:0,seconds:0,accumulatedSeconds:0,history:[],state:'running',met:3.5,weight:60,height:165,age:20,alias:'',target:null};if(demo){session.weight=60;session.height=165;session.age=20;session.met=3.5;}run();render();}
$('profile').onsubmit=e=>{e.preventDefault();begin(false);};$('demo').onclick=()=>begin(true);
function demoTick(){const i=session.demoIndex++,angle=i*.12;session.seconds+=5;receive({lat:center[0]+.00062*Math.sin(angle),lng:center[1]+.00085*Math.cos(angle),accuracy:6,t:session.id+i*6000});}
function pause(reason){if(!session||session.state!=='running')return;session.seconds=seconds();session.runStart=0;session.state='paused';stopWatch();last=null;$('badge').textContent='● 已暫停';if(reason)message(reason);}
$('pause').onclick=()=>{if(session.state==='running')pause();else {message('等待新的有效定位後繼續…');run();}};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(records));storageOK=true;}catch{storageOK=false;message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出資料。');}}
$('finish').onclick=()=>{if(!session||session.state==='finished')return;session.seconds=seconds();session.runStart=0;session.state='finished';stopWatch();session.kcal=MoveCore.calories(session.met,session.weight,session.seconds);const track={points:session.history,seconds:session.seconds,meters:session.meters,met:session.met,weight:session.weight,alias:session.alias||'','demo':session.demo||false};records.unshift(track);persist();renderHistory();};
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCSV(items){if(!items.length){message('目前沒有可匯出的紀錄。');return;}const rows=[['時間 ISO','課堂代號','類型','活動','身高 cm','體重 kg','年齡','時間 sec','距離 m','平均速度 km/h','總熱量 kcal','有效 GPS 點','段數']];for(const r of items){const p=Array.isArray(r.points)?r.points:[];const summary=MoveCore.analyzeTrack(p,{met:r.met||3.5,kg:r.weight||60});rows.push([r.date||new Date().toISOString(),r.alias||'',r.demo?'demo':'gps',r.mode||'',r.height||'',r.weight||'',r.age||'',String(summary.motionTime||0),String(summary.totalDistance||0),String(summary.avgSpeed||0),String(summary.calories||0),String(summary.validPoints||0),String(summary.segments||0)]);}const csv=rows.map(r=>r.map(cell).join(',')).join('\n');download('pace-summary.csv',csv,'text/csv;charset=utf-8');}
function exportTrackSummaryXlsx(trackRecord, filename){
  if (!trackRecord || !Array.isArray(trackRecord.points) || !trackRecord.points.length) {
    message('目前沒有可匯出的軌跡。');
    return;
  }
  const summary = MoveCore.analyzeTrack(trackRecord.points, {
    met: Number(trackRecord.met ?? 3.5),
    kg: Number(trackRecord.weight ?? trackRecord.kg ?? 60)
  });
  const rows = [
    ['項目', '數值', '單位'],
    ['總距離', summary.totalDistance, '公尺'],
    ['運動時間', summary.motionTime, '秒'],
    ['平均速度', summary.avgSpeed, 'km/h'],
    ['估算熱量', summary.calories, 'kcal'],
    ['有效定位點數', summary.validPoints, '個'],
    ['段數', summary.segments, '段'],
    ['起點到終點直線距離', summary.straightDistance, '公尺'],
    ['最快相鄰點速度', summary.maxSpeed, 'm/s']
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:26}, {wch:16}, {wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '運動紀錄摘要');
  XLSX.writeFile(wb, filename || '運動紀錄-實作分析.xlsx');
}
let historyFilter='all';
function routeThumbnail(r){const box=document.createElement('div');box.className='route-thumb';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 86 54');svg.innerHTML='<path d="M8 40C18 32 20 20 33 18C45 16 48 35 58 33C69 31 72 18 80 17" fill="none" stroke="#2f88b3" stroke-width="3" stroke-linecap="round"/><path d="M8 40C18 32 20 20 33 18C45 16 48 35 58 33C69 31 72 18 80 17" fill="none" stroke="#d3ecff" stroke-width="7" opacity=".5" stroke-linecap="round"/>';box.append(svg);return box;}
function renderHistory(){const root=$('records');root.replaceChildren();const actual=records.filter(r=>!r.demo);$('historyTotal').textContent=actual.length?`${actual.length} 次運動 · ${(actual.reduce((s,r)=>s+(Number(r.meters)||0),0)/1000).toFixed(2)} km`: '0 次運動';for(const r of actual){const card=document.createElement('article');card.className='record';const meta=document.createElement('div');meta.className='record-head';meta.innerHTML=`<div><strong>${r.alias||'未命名紀錄'}</strong><span>${new Date(r.date||Date.now()).toLocaleDateString('zh-TW', {month:'numeric',day:'numeric'})}</span></div><button class="ghost small" data-export-record="${r.id||Math.random()}">匯出 Excel</button>`;card.append(meta);const stats=document.createElement('div');stats.className='mini-stats';stats.innerHTML=`<span>距離 ${(Number(r.meters)||0).toFixed(0)} m</span><span>時間 ${String(Math.floor((Number(r.seconds)||0)/60)).padStart(2,'0')}:${String(Math.floor((Number(r.seconds)||0)%60)).padStart(2,'0')}</span><span>熱量 ${Math.round(Number(r.kcal)||0)} kcal</span>`;card.append(stats);const thumb=routeThumbnail(r);card.append(thumb);root.append(card);}root.querySelectorAll('[data-export-record]').forEach(btn=>btn.onclick=()=>{const rec=records.find(x=>(x.id||Math.random())===btn.dataset.exportRecord*1||x.id===btn.dataset.exportRecord);if(rec)exportTrackSummaryXlsx(rec, `${(rec.alias||'運動紀錄')}.xlsx`);} );}
$('openSetup').onclick=()=>$('setupDialog').showModal();$('closeSetup').onclick=()=>$('setupDialog').close();$('energyInfo').onclick=()=>$('energyDialog').showModal();$('closeEnergy').onclick=()=>$('energyDialog').close();
$('todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{historyFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);});renderHistory();});
$('exportAll').onclick=()=>{if(!records.length){message('目前沒有可匯出的紀錄。');return;}const rec=records[0];exportTrackSummaryXlsx(rec, '運動紀錄-實作分析.xlsx');};
$('deleteAll').onclick=()=>{if(records.length&&confirm('永久刪除此裝置全部運動紀錄？')){records=[];persist();renderHistory();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.state==='running')pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按「繼續」即可。');render();});
window.addEventListener('beforeunload',e=>{if(session&&session.state!=='finished'){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(session?.state==='running'&&!session.demo&&Date.now()-lastSignal>30000)pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。');render();},1000);
renderHistory();render();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a));document.querySelectorAll('section[id]').forEach(section=>section.scrollIntoView({behavior:'smooth',block:'start'}));}));
