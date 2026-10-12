'use strict';
const CATEGORY_ICONS = {'Birds':'♧','Mammals':'♞','Arthropods':'✺','Amphibians & Reptiles':'◉','Fish':'≈','Molluscs, Worms & Sea Life':'◌'};
const HABITATS = {'garden':'Garden / park','forest':'Forest / woodland','wetland':'Pond / marsh','river':'River / stream','farmland':'Field / meadow','coast':'Sea / coast','urban':'Town / building','heath':'Heath / dunes'};
const SIZE_LABELS = {'tiny':'Tiny · smaller than a finger','small':'Small · hand-sized','medium':'Medium · bigger than a hand','large':'Large · bigger than a cat'};
const CATEGORY_ORDER = Object.keys(GROUPS);

const LEGACY_CATEGORIES = {'Insects':'Arthropods','Other arthropods':'Arthropods','Amphibians':'Amphibians & Reptiles','Reptiles':'Amphibians & Reptiles','Molluscs':'Molluscs, Worms & Sea Life','Other invertebrates':'Molluscs, Worms & Sea Life'};
function normalizedCategory(cat){return LEGACY_CATEGORIES[cat]||cat;}
function normalizeSpecies(s){return {...s,category:normalizedCategory(s.category)};}
function subcategoryOf(s){if(!s)return '';const groups=SUBCATEGORIES[s.category];if(!groups)return '';if(s.subcategory && Object.hasOwn(groups,s.subcategory))return s.subcategory;return Object.keys(groups).find(sub=>groups[sub].includes(s.group))||'Unsorted';}
function wizardGroupOptions(){return SUBCATEGORIES[wizard.cat]?.[wizard.subcat]||GROUPS[wizard.cat]||[];}
function wizardSteps(){return ['photo','category',...(SUBCATEGORIES[wizard?.cat]?['subcategory']:[]),'group','habitat','size','match','confirm'];}
const DB_NAME = 'wonderdeck-photo-atlas-v1';
const DB_VERSION = 1;
let db, customSpecies=[], sightings=[], activeCategory='Birds', pageByBook={All:0,Birds:0}, subcategoryByBook={}, openCardId=null, activeSightingId=null, wizard=null, imageURLs=new Map(), toastTimer;
const $ = sel => document.querySelector(sel);
const el = id => document.getElementById(id);
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => {const d=new Date(),off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10);};
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const norm = t => String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const imageOf = obs => {if(!obs) return '';if(!imageURLs.has(obs.id) && obs.photo instanceof Blob){imageURLs.set(obs.id,URL.createObjectURL(obs.photo));}return imageURLs.get(obs.id)||'';};

// Photos are rendered at their full image aspect ratio. Their visible center,
// zoom and fit are saved with each sighting (not with the species card).
function photoMarkup(obs, classes, alt='Your wildlife photo'){
 return `<div class="${classes} photo-viewport" data-photo-id="${esc(obs.id)}"><img src="${imageOf(obs)}" alt="${esc(alt)}" draggable="false" loading="lazy"></div>`;
}
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function photoGeometry(stage,obs){
 const im=stage?.querySelector('img');
 if(!im?.naturalWidth||!im.naturalHeight||!stage.clientWidth||!stage.clientHeight)return null;
 const cw=stage.clientWidth,ch=stage.clientHeight;
 const fit=obs.fit==='contain'?'contain':'cover';
 const base=(fit==='contain'?Math.min:Math.max)(cw/im.naturalWidth,ch/im.naturalHeight);
 const zoom=clamp(Number(obs.zoom)||1,1,4);
 const imageW=im.naturalWidth*base*zoom,imageH=im.naturalHeight*base*zoom;
 return {imageW,imageH,maxX:Math.max(0,(imageW-cw)/2),maxY:Math.max(0,(imageH-ch)/2)};
}
function positionPhoto(stage){
 const obs=sightings.find(o=>o.id===stage?.dataset?.photoId);if(!obs)return;
 const geo=photoGeometry(stage,obs);if(!geo)return;
 const img=stage.querySelector('img');
 const x=(50-clamp(Number(obs.px??50),0,100))/50*geo.maxX;
 const y=(50-clamp(Number(obs.py??50),0,100))/50*geo.maxY;
 img.style.width=`${geo.imageW}px`;img.style.height=`${geo.imageH}px`;
 img.style.transform=`translate(-50%, -50%) translate(${x}px, ${y}px)`;
}
function positionAllPhotos(){document.querySelectorAll('.photo-viewport').forEach(positionPhoto);}
let framePending=false;
function queuePhotoLayouts(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;positionAllPhotos();});}
document.addEventListener('load',e=>{if(e.target.matches?.('.photo-viewport img'))positionPhoto(e.target.parentElement);},true);
window.addEventListener('resize',queuePhotoLayouts,{passive:true});
function currentPhoto(){return sightings.find(o=>o.id===activeSightingId);}
function syncPhotoControls(obs){
 for(const [field,id] of [['px','positionX'],['py','positionY'],['zoom','zoomControl']]){
  const node=el(id);if(node)node.value=obs[field]??(field==='zoom'?1:50);
 }
 const zoomLabel=el('zoomAmount');if(zoomLabel)zoomLabel.textContent=`${Math.round((Number(obs.zoom)||1)*100)}%`;
 const fitControl=el('wholePhoto');if(fitControl)fitControl.checked=obs.fit==='contain';
 const hint=el('panHint');if(hint)hint.textContent=Number(obs.zoom||1)>1?'Drag the photo with your finger or mouse, or use the arrows.':'Zoom in to pan around the animal. You can also reposition a naturally cropped photo.';
}
function applyPhotoChange(field,val){
 const obs=currentPhoto();if(!obs)return;
 if(field==='zoom')obs.zoom=clamp(Number(val)||1,1,4);
 else if(field==='fit')obs.fit=val==='contain'?'contain':'cover';
 else if(field==='px'||field==='py')obs[field]=clamp(Number(val),0,100);
 document.querySelectorAll('.photo-viewport').forEach(stage=>{if(stage.dataset.photoId===obs.id)positionPhoto(stage);});
 syncPhotoControls(obs);
}
async function persistPhoto(){const obs=currentPhoto();if(!obs)return;try{await dbPut('sightings',obs);render();}catch(e){console.error(e);notify('Could not save photo framing.');}}
function movePhotoPixels(dx,dy){
 const stage=el('detailMainPhoto'),obs=currentPhoto(),geo=photoGeometry(stage,obs);
 if(!geo)return false;
 const x=(50-clamp(Number(obs.px??50),0,100))/50*geo.maxX;
 const y=(50-clamp(Number(obs.py??50),0,100))/50*geo.maxY;
 if(geo.maxX>0)obs.px=clamp(50-(clamp(x+dx,-geo.maxX,geo.maxX)/geo.maxX)*50,0,100);
 if(geo.maxY>0)obs.py=clamp(50-(clamp(y+dy,-geo.maxY,geo.maxY)/geo.maxY)*50,0,100);
 positionPhoto(stage);syncPhotoControls(obs);
 return true;
}
function nudgePhoto(dx,dy){if(movePhotoPixels(dx,dy))persistPhoto();}
function resetPhoto(){const o=currentPhoto();if(!o)return;o.px=50;o.py=50;o.zoom=1;o.fit='cover';syncPhotoControls(o);positionPhoto(el('detailMainPhoto'));persistPhoto();}
let draggingPhoto=null;
function startPhotoDrag(e){
 if(e.pointerType==='mouse'&&e.button!==0)return;
 const stage=el('detailMainPhoto'),obs=currentPhoto();if(!obs||!photoGeometry(stage,obs))return;
 draggingPhoto={id:e.pointerId,x:e.clientX,y:e.clientY};
 stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');e.preventDefault();
}
function movePhotoDrag(e){
 if(!draggingPhoto||draggingPhoto.id!==e.pointerId)return;
 const dx=e.clientX-draggingPhoto.x,dy=e.clientY-draggingPhoto.y;
 draggingPhoto.x=e.clientX;draggingPhoto.y=e.clientY;
 movePhotoPixels(dx,dy);e.preventDefault();
}
function endPhotoDrag(e){
 if(!draggingPhoto||draggingPhoto.id!==e.pointerId)return;
 draggingPhoto=null;el('detailMainPhoto')?.classList.remove('dragging');persistPhoto();
}
function activatePhotoDrag(){
 const stage=el('detailMainPhoto');if(!stage)return;
 stage.addEventListener('pointerdown',startPhotoDrag);
 stage.addEventListener('pointermove',movePhotoDrag);
 stage.addEventListener('pointerup',endPhotoDrag);
 stage.addEventListener('pointercancel',endPhotoDrag);
}

const getCount = id => sightings.filter(o=>o.speciesId===id).length;
const recordsFor = id => sightings.filter(o=>o.speciesId===id).sort((a,b)=>b.createdAt-a.createdAt);
function speciesSort(a,b){let c=CATEGORY_ORDER.indexOf(a.category)-CATEGORY_ORDER.indexOf(b.category);if(c)return c;const subs=SUBCATEGORIES[a.category];if(subs){const keys=Object.keys(subs),ia=keys.indexOf(subcategoryOf(a)),ib=keys.indexOf(subcategoryOf(b));c=(ia<0?999:ia)-(ib<0?999:ib);if(c)return c;}const gg=GROUPS[a.category]||[];c=(gg.indexOf(a.group)<0?999:gg.indexOf(a.group))-(gg.indexOf(b.group)<0?999:gg.indexOf(b.group));if(c)return c;return a.name.localeCompare(b.name,undefined,{sensitivity:'base'});}
function bookSpecies(){const all=catalog();if(activeCategory==='All')return all;const list=all.filter(s=>s.category===activeCategory);const sub=subcategoryByBook[activeCategory]||'All';return sub==='All'?list:list.filter(s=>subcategoryOf(s)===sub);}
function catalog(){return [...CATALOG,...customSpecies].sort(speciesSort).map((s,i)=>({...s,num:i+1}));}
function speciesById(id){return catalog().find(s=>s.id===id);}
function latestFor(id){return recordsFor(id)[0];}
function notify(text){const t=el('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3200);}
function dbOpen(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains('species'))d.createObjectStore('species',{keyPath:'id'});if(!d.objectStoreNames.contains('sightings')){const s=d.createObjectStore('sightings',{keyPath:'id'});s.createIndex('bySpecies','speciesId',{unique:false});}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function tableAll(name){return new Promise((resolve,reject)=>{const req=db.transaction(name,'readonly').objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbPut(name,val){return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).put(val);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function dbDelete(name,key){return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function reload(){customSpecies=(await tableAll('species')).map(normalizeSpecies);sightings=await tableAll('sightings');render();}
function isPhoneBook(){return window.matchMedia('(max-width: 880px)').matches;}
function currentBookKey(){return activeCategory+'::'+(subcategoryByBook[activeCategory]||'All');}
function bookTotalPages(species=bookSpecies()){return Math.max(1,Math.ceil(species.length/9));}
function currentBookPage(species=bookSpecies()){
 const total=bookTotalPages(species),saved=clamp(pageByBook[currentBookKey()]||0,0,total-1);
 const position=isPhoneBook()?saved:Math.floor(saved/2)*2;
 pageByBook[currentBookKey()]=position;
 return position;
}
function render(){const all=catalog(),known=new Set(sightings.map(o=>o.speciesId));
 const animals=all.filter(s=>known.has(s.id)).length;
 el('stats').innerHTML=[['▦',animals+' / '+all.length,'Cards discovered'],['◎',sightings.length,'Photos recorded'],['♧',new Set(all.filter(s=>known.has(s.id)).map(s=>s.category)).size+' / '+CATEGORY_ORDER.length,'Groups explored'],['✳',customSpecies.length,'Species you added']].map(([ico,num,txt])=>`<div class="stat"><div class="stat-icon">${ico}</div><div><small>${txt}</small><strong>${num}</strong></div></div>`).join('');
 el('totalFound').textContent=animals+' / '+all.length;
 const allBooks=['All',...CATEGORY_ORDER];
 el('categoryTabs').innerHTML=allBooks.map(c=>{const list=c==='All'?all:all.filter(s=>s.category===c),found=list.filter(s=>known.has(s.id)).length;return `<button class="category ${activeCategory===c?'active':''}" role="tab" aria-selected="${activeCategory===c}" onclick="chooseCategory(${JSON.stringify(c).replaceAll('"','&quot;')})">${c==='All'?'▦':CATEGORY_ICONS[c]} ${esc(c==='All'?'All book':c)} <b>${found}/${list.length}</b></button>`;}).join('');
 el('mobileBookSelect').innerHTML=allBooks.map(c=>{const list=c==='All'?all:all.filter(s=>s.category===c),found=list.filter(s=>known.has(s.id)).length;return `<option value="${esc(c)}" ${activeCategory===c?'selected':''}>${c==='All'?'All animals':c}  ·  ${found}/${list.length}</option>`;}).join('');
 const selected=bookSpecies(),nested=SUBCATEGORIES[activeCategory];
 if(nested){
  const listed=all.filter(s=>s.category===activeCategory),other=listed.some(s=>subcategoryOf(s)==='Unsorted'),options=['All',...Object.keys(nested),...(other?['Unsorted']:[])];
  const categoryOptions=options.map(sub=>{const filtered=sub==='All'?listed:listed.filter(s=>subcategoryOf(s)===sub);const found=filtered.filter(s=>known.has(s.id)).length;return {sub,found,total:filtered.length};});
  el('subCategoryTabs').innerHTML=`<span class="subcat-label">Inside ${esc(activeCategory)}</span>`+categoryOptions.map(x=>`<button class="subcat-pill ${(subcategoryByBook[activeCategory]||'All')===x.sub?'on':''}" onclick="chooseSubcategory(${JSON.stringify(x.sub).replaceAll('"','&quot;')})">${esc(x.sub==='All'?'All '+activeCategory:x.sub)} <b>${x.found}/${x.total}</b></button>`).join('');
  el('subCategoryTabs').hidden=false;
  el('mobileSubgroupField').hidden=false;
  el('mobileSubSelect').innerHTML=categoryOptions.map(x=>`<option value="${esc(x.sub)}" ${(subcategoryByBook[activeCategory]||'All')===x.sub?'selected':''}>${esc(x.sub==='All'?'All subgroups':x.sub)} · ${x.found}/${x.total}</option>`).join('');
 }else{el('subCategoryTabs').innerHTML='';el('subCategoryTabs').hidden=true;el('mobileSubgroupField').hidden=true;}
 const foundSelected=selected.filter(s=>known.has(s.id)).length;
 const mobile=isPhoneBook(),totalPages=bookTotalPages(selected),pageIndex=currentBookPage(selected),step=mobile?1:2;
 const leftList=selected.slice(pageIndex*9,(pageIndex+1)*9),rightList=selected.slice((pageIndex+1)*9,(pageIndex+2)*9);
 const pageLabel=list=>{const parts=[...new Set(list.map(s=>activeCategory==='All'?s.category:(subcategoryOf(s)||s.group)))];return parts.length?parts.slice(0,3).join(' · ')+(parts.length>3?' +':''):'Empty page';};
 const renderCard=s=>{if(!s)return `<div class="collector-card blank-slot" aria-hidden="true"></div>`;const record=latestFor(s.id),num=String(s.num).padStart(3,'0');if(!record)return `<div class="collector-card locked" aria-label="Card ${num}, locked"><div class="card-photo locked-photo"><span class="secret-mark">?</span></div><div class="card-index-row"><span class="card-number">№ ${num}</span></div><div class="card-name">Undiscovered</div><div class="card-sub"><span>Hidden entry</span><span>✧</span></div></div>`;return `<button class="collector-card unlocked" onclick="openSpecies('${esc(s.id)}')">${photoMarkup(record,'card-photo',`Photo you took of ${s.name}`)}<div class="card-index-row"><span class="card-number">№ ${num}</span>${getCount(s.id)>1?`<span class="records-bubble">×${getCount(s.id)}</span>`:''}</div><div class="card-name" title="${esc(s.name)}">${esc(s.name)}</div><div class="card-sub"><span>${esc(activeCategory==='All'?s.category+' · '+s.group:s.group)}</span><span>↗</span></div></button>`;};
 const renderPage=(list,side,pageNo)=>{const found=list.filter(s=>s&&known.has(s.id)).length;const filled=[...list];while(filled.length<9)filled.push(null);return `<section class="album-page ${side}" aria-label="Album page ${pageNo}"><div class="page-top"><span class="page-label" title="${esc(pageLabel(list))}">${esc(pageLabel(list))}</span><span class="page-fraction">${found} / ${list.length||0}</span></div><div class="page-grid">${filled.map(renderCard).join('')}</div><div class="page-no">${pageNo}</div></section>`;};
 const canPrev=pageIndex>0,canNext=pageIndex+step<totalPages;
 const status=mobile?`Page ${pageIndex+1} / ${totalPages}`:`Spread ${Math.floor(pageIndex/2)+1} / ${Math.ceil(totalPages/2)}`;
 const nav=`<div class="spread-controls"><button type="button" class="spread-btn" onclick="changeSpread(-1)" aria-label="Previous ${mobile?'page':'spread'}" ${canPrev?'':'disabled'}>← <span>Previous</span></button><span class="spread-meta">${status}</span><button type="button" class="spread-btn" onclick="changeSpread(1)" aria-label="Next ${mobile?'page':'spread'}" ${canNext?'':'disabled'}><span>Next</span> →</button></div>`;
 const title=activeCategory==='All'?'The complete atlas':activeCategory;
 const subtitle=(subcategoryByBook[activeCategory]||'All')!=='All'?' · '+subcategoryByBook[activeCategory]:'';
 el('bookStatus').textContent=`${title}${subtitle} · ${foundSelected} / ${selected.length} found`;
 el('binderContent').innerHTML=`<div class="book-toolbar"><div class="book-caption">✦ ${esc(title)}${esc(subtitle)}</div>${nav}</div><div class="open-book-wrap" aria-label="${mobile?'Single-page animal album':'Open two-page animal album'}"><div class="open-book ${mobile?'mobile-book':''}">${mobile?renderPage(leftList,'single',pageIndex+1):`<div class="page-shadow left"></div>${renderPage(leftList,'left',pageIndex+1)}<div class="book-spine" aria-hidden="true"></div>${renderPage(rightList,'right',pageIndex+2)}<div class="page-shadow right"></div>`}</div></div><div class="book-footer">${mobile?`<div class="swipe-hint">↔ Swipe to turn pages</div>`:''}${nav}</div>`;
 const recent=[...sightings].sort((a,b)=>b.createdAt-a.createdAt).slice(0,9);
 el('journalList').innerHTML=recent.length?recent.map(o=>{const s=all.find(x=>x.id===o.speciesId);return `<button class="log-card" onclick="openSpecies('${esc(o.speciesId)}','${esc(o.id)}')">${photoMarkup(o,'log-thumb','Sighting photo')}<div><strong>${esc(s?.name||'Wildlife record')}</strong><span>${esc(o.date||'')} ${o.place?' · '+esc(o.place):''}</span><br><span>${esc(s?.group||'')}</span></div></button>`;}).join(''):'<p class="empty-text">Your first discovery is waiting just outside.</p>';
 queuePhotoLayouts();
}
function chooseCategory(name){activeCategory=name;if(!(currentBookKey() in pageByBook))pageByBook[currentBookKey()]=0;render();}
function chooseSubcategory(sub){subcategoryByBook[activeCategory]=sub;pageByBook[currentBookKey()]=0;render();}
function changeSpread(delta){const list=bookSpecies(),totalPages=bookTotalPages(list),step=isPhoneBook()?1:2,idx=currentBookPage(list);pageByBook[currentBookKey()]=clamp(idx+delta*step,0,totalPages-1);render();}
let bookTouch=null;
function attachBookSwipe(){
 const binder=el('binderContent');
 binder.addEventListener('touchstart',e=>{if(!isPhoneBook()||!e.touches.length)return;bookTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
 binder.addEventListener('touchend',e=>{if(!isPhoneBook()||!bookTouch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-bookTouch.x,dy=e.changedTouches[0].clientY-bookTouch.y;bookTouch=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.35)changeSpread(dx<0?1:-1);},{passive:true});
 binder.addEventListener('touchcancel',()=>{bookTouch=null;},{passive:true});
}
function goTo(id){el(id).scrollIntoView({behavior:'smooth'});}
function openModal(html){el('modalContent').innerHTML=html;el('overlay').hidden=false;document.body.style.overflow='hidden';queuePhotoLayouts();}
function closeModal(){el('overlay').hidden=true;document.body.style.overflow='';if(wizard?.previewURL){URL.revokeObjectURL(wizard.previewURL);wizard.previewURL='';}wizard=null;openCardId=null;}
function wizardChoice(label,fn,sub=''){return `<button class="choice" onclick="${fn}">${esc(label)}${sub?`<small>${esc(sub)}</small>`:''}</button>`;}
function wizardBack(){if(wizard.step==='confirm' && wizard.preselectedId){wizard.step='photo';renderWizard();return;}const steps=wizardSteps();const i=steps.indexOf(wizard.step);if(i>0){wizard.step=steps[i-1];renderWizard();}else closeModal();}
function wizardProgress(){const steps=wizardSteps();const p=steps.indexOf(wizard.step);return `<div class="step-dots" aria-label="Step ${p+1} of ${steps.length}">${steps.map((_,i)=>`<i class="${i<=p?'on':''}"></i>`).join('')}</div>`;}
function wizardFrame(heading,description,content,footer=''){return `<div class="modal-step">NEW ENCOUNTER / ${esc(wizard.step.toUpperCase())}</div><h2 id="dialogTitle">${heading}</h2><p class="modal-lead">${description}</p>${content}<div class="wizard-footer"><button class="btn pale" onclick="wizardBack()">← Back</button>${wizardProgress()}${footer}</div>`;}
function beginRecord(speciesId=null){wizard={step:'photo',preselectedId:speciesId,speciesId,cat:speciesId?speciesById(speciesId)?.category:null,subcat:speciesId?subcategoryOf(speciesById(speciesId)):null,group:speciesId?speciesById(speciesId)?.group:null,habitat:'',size:'',knownName:'',latin:'',revealed:false,blob:null,previewURL:'',isExisting:!!speciesId};renderWizard();}
function pickPhoto(mode){el(mode==='camera'?'cameraInput':'libraryInput').click();}
async function processPhoto(file){if(!file)return;if(!file.type.startsWith('image/')){notify('Choose a photo file.');return;}try{const blob=await optimizeImage(file);if(wizard.previewURL)URL.revokeObjectURL(wizard.previewURL);wizard.blob=blob;wizard.previewURL=URL.createObjectURL(blob);wizard.step=wizard.speciesId?'confirm':'category';renderWizard();}catch(e){console.error(e);notify('Could not read that photo. Try a different one.');}}
async function optimizeImage(file){if(file.size>60*1024*1024)throw new Error('Too large');return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{try{const max=1900,ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(blob):resolve(file);},'image/jpeg',.87);}catch(e){URL.revokeObjectURL(url);reject(e);}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Decode failed'));};img.src=url;});}
function wCategory(i){wizard.cat=CATEGORY_ORDER[i];wizard.subcat='';wizard.group='';wizard.step=SUBCATEGORIES[wizard.cat]?'subcategory':'group';renderWizard();}
function wSubcategory(i){wizard.subcat=Object.keys(SUBCATEGORIES[wizard.cat])[i];wizard.group='';wizard.step='group';renderWizard();}
function wGroup(i){const options=[...wizardGroupOptions(),'Other'];wizard.group=options[i];wizard.step='habitat';renderWizard();}
function wHabitat(h){wizard.habitat=h;wizard.step='size';renderWizard();}
function wSize(size){wizard.size=size;wizard.step='match';wizard.revealed=false;renderWizard();}
function candidates(){return catalog().filter(s=>s.category===wizard.cat && s.group===wizard.group && (!wizard.subcat||subcategoryOf(s)===wizard.subcat) && (!wizard.habitat || (s.habitats||[]).includes(wizard.habitat)) && (!wizard.size || s.size===wizard.size));}
function wReveal(){wizard.revealed=true;renderWizard();}
function wChoose(id){const s=speciesById(id);if(!s)return;wizard.speciesId=s.id;wizard.knownName=s.name;wizard.isExisting=true;wizard.step='confirm';renderWizard();}
function wManual(){const input=el('speciesSearch')?.value.trim()||'';const found=catalog().find(s=>norm(s.name)===norm(input)||norm(s.latin)===norm(input));if(found){wChoose(found.id);return;}wizard.speciesId=null;wizard.isExisting=false;wizard.knownName=input;wizard.step='confirm';renderWizard();}
function wCreateFromResults(){wizard.speciesId=null;wizard.isExisting=false;wizard.knownName=el('speciesSearch')?.value.trim()||'';wizard.step='confirm';renderWizard();}
function renderWizard(){if(!wizard)return;let html='';const preview=wizard.previewURL?`<img class="upload-preview" src="${wizard.previewURL}" alt="Photo you chose">`:'';
 switch(wizard.step){
 case 'photo': html=wizardFrame(wizard.speciesId?'Another encounter':'What did you discover?','Start with a photo you took. It stays privately on this device.',`<div class="upload-box">${preview||'<div><div style="font-size:42px">◉</div><div class="upload-prompt">Your next discovery</div><p style="color:#899a8d">A clear photo makes a beautiful card.</p></div>'}<div class="upload-actions"><button class="btn dark" onclick="pickPhoto('camera')">◎ Take photo</button><button class="btn pale" onclick="pickPhoto('library')">▤ Choose from photos</button></div></div>`);break;
 case 'category': html=wizardFrame('What kind of animal?','Pick what you know. No species are revealed yet.',`<div class="wizard-choice-grid">${CATEGORY_ORDER.map((c,i)=>wizardChoice(CATEGORY_ICONS[c]+'  '+c,`wCategory(${i})`)).join('')}</div>`);break;
 case 'subcategory': html=wizardFrame('Which animal subgroup?','We will look only within the group you select.',`<div class="wizard-choice-grid">${Object.keys(SUBCATEGORIES[wizard.cat]).map((sub,i)=>wizardChoice(sub,`wSubcategory(${i})`)).join('')}</div>`);break;
 case 'group': html=wizardFrame('Which family looks closest?','This helps place similar animals next to each other in your binder.',`<div class="wizard-choice-grid">${[...wizardGroupOptions(),'Other'].map((g,i)=>wizardChoice(g,`wGroup(${i})`)).join('')}</div>`);break;
 case 'habitat': html=wizardFrame('Where did you find it?','Choose the habitat, or skip if you are unsure.',`<div class="wizard-choice-grid">${Object.entries(HABITATS).map(([h,label])=>wizardChoice(label,`wHabitat('${h}')`)).join('')}</div>`,`<button class="btn pale" onclick="wHabitat('')">Not sure →</button>`);break;
 case 'size': html=wizardFrame('How big was it?','An approximate size is enough.',`<div class="wizard-choice-grid">${Object.entries(SIZE_LABELS).map(([s,label])=>wizardChoice(label,`wSize('${s}')`)).join('')}</div>`,`<button class="btn pale" onclick="wSize('')">Not sure →</button>`);break;
 case 'match': {
   const matched=candidates();let extra='';
   if(wizard.revealed){extra=matched.length?`<div class="candidate-grid">${matched.slice(0,24).map(s=>`<button class="candidate" onclick="wChoose('${esc(s.id)}')"><span><strong>${esc(s.name)}</strong><em>${esc(s.latin)}</em></span><span>${getCount(s.id)?'✓ Collected':'In atlas'} →</span></button>`).join('')}</div>${matched.length>24?'<div class="notice">More possibilities exist. Search by name below.</div>':''}`:'<div class="notice">No catalog species fits all those answers. If you know the animal, create a new card below, or go back and broaden your answers.</div>';
   } else extra=`<div class="notice">${matched.length} possible catalog ${matched.length===1?'entry':'entries'} match your answers. This is a guided search, not automatic photo identification. You confirm the species yourself.</div><button class="btn dark" style="margin:13px 0" onclick="wReveal()">Reveal possible species →</button>`;
   html=wizardFrame('Let’s find its card.','We only reveal possible names here, never in the locked binder.',`${extra}<div class="form-row"><label for="speciesSearch">Already know its name?</label><input id="speciesSearch" placeholder="Type the animal’s name (optional)" autocomplete="off" value="${esc(wizard.knownName)}"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pale" onclick="wManual()">Check this name →</button><button class="btn dark" onclick="wCreateFromResults()">＋ Not listed — create a card</button></div>`);break;}
 case 'confirm': {
   const known=wizard.speciesId?speciesById(wizard.speciesId):null;
   const heading=known?(getCount(known.id)?'Another sighting!':'A new discovery!'):'Create your own card';
   let fields='';if(!known)fields=`<div class="form-row"><label for="customName">Animal name (required)</label><input id="customName" maxlength="100" placeholder="e.g. Common grasshopper" value="${esc(wizard.knownName)}"></div><div class="form-row"><label for="customLatin">Scientific name (optional)</label><input id="customLatin" maxlength="140" placeholder="If you know it" value="${esc(wizard.latin)}"></div><div class="notice">This inserts a new card into <b>${esc(wizard.cat)}</b> → <b>${esc(wizard.group)}</b>. All collection numbers will update automatically.</div>`;
   html=wizardFrame(heading,known?`<b>${esc(known.name)}</b> · ${esc(known.group)}. ${getCount(known.id)?'This will be another photo on the same card.':'Its hidden catalog slot will be unlocked.'}`:'Not in the catalog? Your own animal becomes part of the atlas.',`<div class="upload-box" style="min-height:100px">${preview}</div>${fields}<div class="form-row"><label for="recordDate">Date seen</label><input id="recordDate" type="date" value="${today()}"></div><div class="form-row"><label for="recordPlace">Place (optional)</label><input id="recordPlace" maxlength="100" placeholder="e.g. Ardennes forest"></div><div class="form-row"><label for="recordNote">Field notes (optional)</label><textarea id="recordNote" maxlength="500" placeholder="What made this encounter memorable?"></textarea></div>`,`<button class="btn dark" id="saveRecordBtn" onclick="saveRecord()">✳ Save my discovery</button>`);break;}
 }
 openModal(html);
}
async function saveRecord(){const btn=el('saveRecordBtn');if(btn)btn.disabled=true;try{if(!wizard.blob)throw new Error('Photo missing');let id=wizard.speciesId;let newSp=null;const named=el('customName')?.value.trim();if(!id){if(!named){notify('Please give your new card a name.');if(btn)btn.disabled=false;return;}const existing=catalog().find(s=>norm(s.name)===norm(named));if(existing){id=existing.id;}else {newSp={id:'custom-'+uid(),name:named,latin:el('customLatin')?.value.trim()||'',category:wizard.cat,subcategory:wizard.subcat||'',group:wizard.group,habitats:wizard.habitat?[wizard.habitat]:[],size:wizard.size||'',custom:true};id=newSp.id;await dbPut('species',newSp);}}const o={id:'sighting-'+uid(),speciesId:id,date:el('recordDate')?.value||today(),place:el('recordPlace')?.value.trim()||'',note:el('recordNote')?.value.trim()||'',createdAt:Date.now(),photo:wizard.blob,px:50,py:50,zoom:1,fit:'cover'};await dbPut('sightings',o);closeModal();await reload();const s=speciesById(id);notify(newSp?'New card added and renumbered!':`Photo saved for ${s?.name||'your animal'}.`);openSpecies(id,o.id);}catch(e){console.error(e);notify('Could not save. Check available storage.');if(btn)btn.disabled=false;}}
function openSpecies(speciesId,recordId=null){const species=speciesById(speciesId);if(!species||getCount(speciesId)===0)return;openCardId=speciesId;activeSightingId=recordId||latestFor(speciesId).id;renderDetail();}
function renderDetail(){
 const s=speciesById(openCardId),obs=recordsFor(openCardId);
 if(!s||!obs.length){closeModal();return;}
 const current=obs.find(o=>o.id===activeSightingId)||obs[0];activeSightingId=current.id;
 openModal(`<div class="detail-head"><div><div class="modal-step">CARD № ${String(s.num).padStart(3,'0')} · ${esc(s.category)}</div><h2 id="dialogTitle">${esc(s.name)}</h2><div style="color:#849386;font-style:italic;font-size:13px">${esc(s.latin)}</div></div><span class="pill">${obs.length} ${obs.length===1?'sighting':'sightings'}</span></div>
 <div style="margin-top:15px">${photoMarkup(current,'detail-photo editor-photo',`Your photo of ${s.name}`).replace('class="detail-photo editor-photo photo-viewport"','id="detailMainPhoto" class="detail-photo editor-photo photo-viewport"')}</div>
 <div class="record-meta">${esc(current.date||'')} ${current.place?'· '+esc(current.place):''}</div>
 ${current.note?`<p style="color:#596f61;font-size:14px;margin:8px 0">“${esc(current.note)}”</p>`:''}
 <div class="record-gallery">${obs.map(o=>`<button class="${o.id===current.id?'active':''}" onclick="selectSighting('${esc(o.id)}')" title="${esc(o.date)}">${photoMarkup(o,'gallery-photo',`Sighting ${o.date}`)}</button>`).join('')}</div>
 <details class="adjustments" open><summary>Adjust photo framing</summary><p id="panHint" class="adjust-hint">Drag the photo with your finger or mouse, or use the arrows.</p>
 <div class="zoom-row"><button class="zoom-button" aria-label="Zoom out" onclick="changeZoom(-0.25)">−</button><label for="zoomControl">Zoom</label><input id="zoomControl" aria-label="Zoom level" type="range" min="1" max="4" step="0.05" value="${current.zoom??1}" oninput="previewCrop('zoom',this.value)" onchange="saveCrop('zoom',this.value)"><button class="zoom-button" aria-label="Zoom in" onclick="changeZoom(0.25)">+</button><output id="zoomAmount">${Math.round((current.zoom??1)*100)}%</output></div>
 <div class="pan-row"><div class="pan-controls" aria-label="Move photo"><span></span><button aria-label="Move photo up" onclick="nudgePhoto(0,-28)">↑</button><span></span><button aria-label="Move photo left" onclick="nudgePhoto(-28,0)">←</button><button aria-label="Center photo" onclick="centerPhoto()">◎</button><button aria-label="Move photo right" onclick="nudgePhoto(28,0)">→</button><span></span><button aria-label="Move photo down" onclick="nudgePhoto(0,28)">↓</button><span></span></div>
 <div class="pan-sliders"><label>Left / right <input id="positionX" type="range" min="0" max="100" value="${current.px??50}" oninput="previewCrop('px',this.value)" onchange="saveCrop('px',this.value)"></label><label>Up / down <input id="positionY" type="range" min="0" max="100" value="${current.py??50}" oninput="previewCrop('py',this.value)" onchange="saveCrop('py',this.value)"></label></div></div>
 <div class="framing-footer"><label class="whole-toggle"><input id="wholePhoto" type="checkbox" ${current.fit==='contain'?'checked':''} onchange="saveCrop('fit',this.checked?'contain':'cover')"> Show whole photo (no initial crop)</label><button class="btn pale reset-framing" onclick="resetPhoto()">↺ Reset framing</button></div>
 </details>
 <div class="detail-actions"><button class="btn dark" onclick="beginRecord('${esc(s.id)}')">＋ Another sighting</button><button class="btn pale" onclick="deleteSighting('${esc(current.id)}')">Delete this photo</button></div>`);
 activatePhotoDrag();syncPhotoControls(current);queuePhotoLayouts();
}
function selectSighting(id){activeSightingId=id;renderDetail();}
function previewCrop(field,val){applyPhotoChange(field,val);}
async function saveCrop(field,val){applyPhotoChange(field,val);await persistPhoto();}
function changeZoom(delta){const obs=currentPhoto();if(!obs)return;applyPhotoChange('zoom',Math.round((clamp((Number(obs.zoom)||1)+delta,1,4))*100)/100);persistPhoto();}
function centerPhoto(){const obs=currentPhoto();if(!obs)return;obs.px=50;obs.py=50;syncPhotoControls(obs);positionPhoto(el('detailMainPhoto'));persistPhoto();}
async function deleteSighting(id){if(!confirm('Delete this photograph and its sighting?'))return;const obs=sightings.find(o=>o.id===id);if(!obs)return;await dbDelete('sightings',id);if(imageURLs.has(id)){URL.revokeObjectURL(imageURLs.get(id));imageURLs.delete(id);}const remaining=sightings.filter(o=>o.speciesId===obs.speciesId && o.id!==id);if(!remaining.length && customSpecies.some(s=>s.id===obs.speciesId)){await dbDelete('species',obs.speciesId);}closeModal();await reload();if(remaining.length)openSpecies(obs.speciesId);notify('Sighting deleted.');}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
function dataURLtoBlob(s){const [meta,data]=s.split(',');if(!data||!meta.startsWith('data:'))throw new Error('Invalid image');const binary=atob(data),array=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)array[i]=binary.charCodeAt(i);return new Blob([array],{type:meta.match(/^data:([^;]+)/)?.[1]||'image/jpeg'});}
async function exportBackup(){const btn=el('exportBtn');btn.disabled=true;btn.textContent='Preparing your photo backup…';try{const exportRecords=[];for(const obs of sightings)exportRecords.push({...obs,photo:await blobToDataURL(obs.photo)});const content=JSON.stringify({format:'wonderdeck-wild-atlas',version:1,created:new Date().toISOString(),customSpecies,sightings:exportRecords});const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`wonderdeck-atlas-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);notify('Backup saved with all photos.');}catch(e){console.error(e);notify('Backup failed. Please retry.');}finally{btn.disabled=false;btn.textContent='↓ Export backup';}}
async function importBackup(file){if(!file)return;let incoming;try{incoming=JSON.parse(await file.text());if(incoming.format!=='wonderdeck-wild-atlas'||!Array.isArray(incoming.customSpecies)||!Array.isArray(incoming.sightings))throw new Error('Wrong backup');if(incoming.customSpecies.length>10000||incoming.sightings.length>10000)throw new Error('Too many entries');const restored=incoming.sightings.map(o=>({...o,photo:dataURLtoBlob(o.photo)}));if(!confirm(`Replace this device's collection with ${restored.length} sightings from your backup? Your current collection will be replaced.`))return;
 await new Promise((resolve,reject)=>{const tx=db.transaction(['species','sightings'],'readwrite');tx.objectStore('species').clear();tx.objectStore('sightings').clear();for(const s of incoming.customSpecies){const mapped=normalizeSpecies(s);if(mapped.id&&mapped.name&&CATEGORY_ORDER.includes(mapped.category))tx.objectStore('species').put(mapped);}for(const o of restored){if(o.id&&o.speciesId&&o.photo.size)tx.objectStore('sightings').put(o);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});for(const u of imageURLs.values())URL.revokeObjectURL(u);imageURLs.clear();await reload();notify('Atlas restored with photos!');}catch(e){console.error(e);notify('Invalid backup or not enough storage.');}}
async function resetAtlas(){if(!confirm('Permanently delete all your species, photographs and records on this device? Export a backup first.'))return;await new Promise((resolve,reject)=>{const tx=db.transaction(['species','sightings'],'readwrite');tx.objectStore('species').clear();tx.objectStore('sightings').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});for(const u of imageURLs.values())URL.revokeObjectURL(u);imageURLs.clear();await reload();notify('Atlas reset.');}
async function init(){try{db=await dbOpen();await reload();}catch(e){console.error(e);el('binderContent').innerHTML='<div class="empty-text"><b>Local storage is unavailable.</b> Please open Wonderdeck in Safari or Chrome, not a private browsing window, to save photos.</div>';notify('Photo storage needs a standard browser.');}
 for(const b of ['addTop','addHero','addBinder','addFab','addInBook'])el(b)?.addEventListener('click',()=>beginRecord());
 document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.go)));
 el('modalClose').addEventListener('click',closeModal);el('overlay').addEventListener('click',e=>{if(e.target===el('overlay'))closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('overlay').hidden)closeModal();});
 for(const id of ['cameraInput','libraryInput'])el(id).addEventListener('change',async e=>{if(e.target.files[0])await processPhoto(e.target.files[0]);e.target.value='';});
 el('exportBtn').addEventListener('click',exportBackup);el('importBtn').addEventListener('click',()=>el('importFile').click());el('importFile').addEventListener('change',async e=>{await importBackup(e.target.files[0]);e.target.value='';});el('clearBtn').addEventListener('click',resetAtlas);
 if((location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
window.addEventListener('pagehide',()=>{for(const u of imageURLs.values())URL.revokeObjectURL(u);imageURLs.clear();});
attachBookSwipe();
if('IntersectionObserver' in window){const bookView=new IntersectionObserver(items=>{el('addFab')?.classList.toggle('hide-while-browsing',items.some(x=>x.isIntersecting)&&isPhoneBook());},{threshold:.08});bookView.observe(el('binder'));}
window.matchMedia('(max-width: 880px)').addEventListener('change',()=>{if(db)render();});
init();
