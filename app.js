const $=id=>document.getElementById(id);
let theme=localStorage.getItem("mapwiseTheme")||"light";
let places=JSON.parse(localStorage.getItem("mapwisePlaces")||"[]");
let currentPosition=null,pendingLatLng=null,editingId=null,map,userMarker=null,tempMarker=null;
const markers=new Map();

const DEFAULT_CENTER=[41.3851,2.1734];

function uid(){return "p_"+Date.now()+"_"+Math.random().toString(16).slice(2)}
function savePlaces(){localStorage.setItem("mapwisePlaces",JSON.stringify(places))}
function escapeHTML(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function formatCoord(n){return Number(n).toFixed(6)}
function distanceMeters(a,b){
  const R=6371000,rad=x=>x*Math.PI/180;
  const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
  const lat1=rad(a.lat),lat2=rad(b.lat);
  const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function formatDistance(m){if(!Number.isFinite(m))return "";return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`}
function applyTheme(next){
  theme=next==="dark"?"dark":"light";
  document.body.classList.toggle("dark",theme==="dark");
  $("themeToggle").textContent=theme==="dark"?"Light Mode":"Dark Mode";
  localStorage.setItem("mapwiseTheme",theme);
}
function initMap(){
  map=L.map("map",{zoomControl:true}).setView(DEFAULT_CENTER,13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap contributors'
  }).addTo(map);
  map.on("click",e=>openPlaceModal({lat:e.latlng.lat,lng:e.latlng.lng}));
  renderMarkers();
}
function locateUser(){
  if(!navigator.geolocation){alert("Geolocation is not supported in this browser.");return}
  navigator.geolocation.getCurrentPosition(pos=>{
    currentPosition={lat:pos.coords.latitude,lng:pos.coords.longitude};
    if(userMarker)userMarker.remove();
    userMarker=L.marker([currentPosition.lat,currentPosition.lng],{title:"You are here"}).addTo(map).bindPopup("You are here");
    map.setView([currentPosition.lat,currentPosition.lng],16);
    renderPlaces();
  },err=>{
    console.warn(err);
    alert("Could not get your location. Check location permissions.");
  },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
}
function openPlaceModal(latlng,place=null){
  pendingLatLng=latlng;
  editingId=place?.id||null;
  $("modalTitle").textContent=editingId?"Edit place":"Save place";
  $("deletePlaceButton").style.visibility=editingId?"visible":"hidden";
  $("placeNameInput").value=place?.name||"";
  $("placeCategoryInput").value=place?.category||"Custom";
  $("placeAddressInput").value=place?.address||"";
  $("placeLocalAddressInput").value=place?.localAddress||"";
  $("placeLatInput").value=place?.lat??latlng.lat;
  $("placeLngInput").value=place?.lng??latlng.lng;
  $("placeNotesInput").value=place?.notes||"";
  $("placeModal").hidden=false;
}
function closePlaceModal(){
  $("placeModal").hidden=true;
  pendingLatLng=null;
  editingId=null;
}
function savePlaceFromModal(){
  const lat=Number($("placeLatInput").value),lng=Number($("placeLngInput").value);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){alert("Latitude and longitude are required.");return}
  const name=$("placeNameInput").value.trim()||"Untitled place";
  const data={name,category:$("placeCategoryInput").value,address:$("placeAddressInput").value.trim(),localAddress:$("placeLocalAddressInput").value.trim(),lat,lng,notes:$("placeNotesInput").value.trim(),updatedAt:new Date().toISOString()};
  if(editingId){
    places=places.map(p=>p.id===editingId?{...p,...data}:p);
  }else{
    places.unshift({id:uid(),createdAt:new Date().toISOString(),...data});
  }
  savePlaces();
  closePlaceModal();
  renderMarkers();
  renderPlaces();
}
function deleteCurrentPlace(){
  if(!editingId)return;
  if(!confirm("Delete this saved place?"))return;
  places=places.filter(p=>p.id!==editingId);
  savePlaces();
  closePlaceModal();
  renderMarkers();
  renderPlaces();
}
function renderMarkers(){
  markers.forEach(m=>m.remove());
  markers.clear();
  places.forEach(p=>{
    const marker=L.marker([p.lat,p.lng]).addTo(map);
    marker.bindPopup(`<strong>${escapeHTML(p.name)}</strong><br>${escapeHTML(p.category)}<br>${formatCoord(p.lat)}, ${formatCoord(p.lng)}`);
    marker.on("click",()=>renderPlaces(p.id));
    markers.set(p.id,marker);
  });
}
function renderPlaces(highlightId=null){
  const q=$("searchInput").value.trim().toLowerCase();
  const cat=$("categoryFilter").value;
  let filtered=places.filter(p=>{
    const matchesCat=cat==="all"||p.category===cat;
    const hay=[p.name,p.category,p.address,p.localAddress,p.notes].join(" ").toLowerCase();
    return matchesCat && (!q||hay.includes(q));
  });
  $("placeCount").textContent=`${places.length} ${places.length===1?"place":"places"}`;
  if(!filtered.length){
    $("placesList").innerHTML=`<div class="empty-state">No saved places yet. Tap the map or save your current location.</div>`;
    return;
  }
  $("placesList").innerHTML=filtered.map(p=>{
    const d=currentPosition?formatDistance(distanceMeters(currentPosition,{lat:p.lat,lng:p.lng})):"";
    return `<article class="place-card" data-id="${p.id}">
      <strong>${escapeHTML(p.name)}</strong>
      <span>${escapeHTML(p.address||p.localAddress||"No address saved")}</span>
      ${p.localAddress?`<span>${escapeHTML(p.localAddress)}</span>`:""}
      <div class="place-meta">
        <span class="badge">${escapeHTML(p.category)}</span>
        ${d?`<span class="badge">${d} away</span>`:""}
      </div>
      <div class="place-actions">
        <button type="button" data-action="organic">Organic Maps</button>
        <button type="button" data-action="apple">Apple Maps</button>
        <button type="button" data-action="copy">Copy</button>
        <button type="button" data-action="show">Show large</button>
      </div>
    </article>`;
  }).join("");
  document.querySelectorAll(".place-card").forEach(card=>{
    const id=card.dataset.id;
    const p=places.find(x=>x.id===id);
    if(id===highlightId)card.scrollIntoView({behavior:"smooth",block:"nearest"});
    card.addEventListener("click",e=>{
      const action=e.target?.dataset?.action;
      if(action){handlePlaceAction(action,p);e.stopPropagation();return}
      map.setView([p.lat,p.lng],16);
      markers.get(p.id)?.openPopup();
      openPlaceModal({lat:p.lat,lng:p.lng},p);
    });
  });
}
function destinationText(p){return p.localAddress||p.address||`${p.lat},${p.lng}`}
function handlePlaceAction(action,p){
  if(action==="copy")copyPlace(p);
  if(action==="show")showLarge(p);
  if(action==="apple")openAppleMaps(p);
  if(action==="organic")openOrganicMaps(p);
}
function copyPlace(p){
  const text=`${p.name}\n${p.localAddress||p.address||""}\n${formatCoord(p.lat)}, ${formatCoord(p.lng)}\n${p.notes||""}`.trim();
  navigator.clipboard.writeText(text);
}
function showLarge(p){
  const text=[p.name,p.localAddress||p.address,`${formatCoord(p.lat)}, ${formatCoord(p.lng)}`,p.notes].filter(Boolean).join("\n\n");
  $("largeAddressText").textContent=text;
  $("largeModal").hidden=false;
}
function openAppleMaps(p){
  const url=`https://maps.apple.com/?daddr=${encodeURIComponent(p.lat+","+p.lng)}&q=${encodeURIComponent(p.name)}`;
  window.open(url,"_blank");
}
function openGoogleMaps(p){
  const url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat+","+p.lng)}&travelmode=walking`;
  window.open(url,"_blank");
}
function openOrganicMaps(p){
  const geo=`geo:${p.lat},${p.lng}?q=${encodeURIComponent(p.lat+","+p.lng+"("+p.name+")")}`;
  window.location.href=geo;
  setTimeout(()=>{
    if(confirm("If Organic Maps did not open, use Apple Maps instead?")) openAppleMaps(p);
  },900);
}
function saveCurrentLocation(){
  if(currentPosition){openPlaceModal(currentPosition);return}
  if(!navigator.geolocation){alert("Geolocation is not supported.");return}
  navigator.geolocation.getCurrentPosition(pos=>{
    currentPosition={lat:pos.coords.latitude,lng:pos.coords.longitude};
    openPlaceModal(currentPosition);
  },()=>alert("Could not get current location."),{enableHighAccuracy:true,timeout:12000});
}
function addManual(){
  const c=map.getCenter();
  openPlaceModal({lat:c.lat,lng:c.lng});
}
function exportPlaces(){
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),places},null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="mapwise-places.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function importPlaces(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      const incoming=Array.isArray(data)?data:data.places;
      if(!Array.isArray(incoming))throw new Error("Invalid file");
      const byId=new Map(places.map(p=>[p.id,p]));
      incoming.forEach(p=>{
        if(Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))){
          byId.set(p.id||uid(),{id:p.id||uid(),name:p.name||"Imported place",category:p.category||"Custom",address:p.address||"",localAddress:p.localAddress||"",lat:Number(p.lat),lng:Number(p.lng),notes:p.notes||"",createdAt:p.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
        }
      });
      places=[...byId.values()];
      savePlaces();renderMarkers();renderPlaces();
    }catch(e){alert("Could not import this file.");console.error(e)}
  };
  reader.readAsText(file);
}

$("themeToggle").onclick=()=>applyTheme(theme==="dark"?"light":"dark");
$("locateButton").onclick=locateUser;
$("saveCurrentButton").onclick=saveCurrentLocation;
$("addManualButton").onclick=addManual;
$("savePlaceButton").onclick=savePlaceFromModal;
$("deletePlaceButton").onclick=deleteCurrentPlace;
$("closeModalButton").onclick=closePlaceModal;
$("closeLargeButton").onclick=()=>$("largeModal").hidden=true;
$("exportButton").onclick=exportPlaces;
$("importInput").onchange=e=>{const file=e.target.files?.[0];if(file)importPlaces(file);e.target.value=""};
$("searchInput").oninput=()=>renderPlaces();
$("categoryFilter").onchange=()=>renderPlaces();
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closePlaceModal();$("largeModal").hidden=true}});

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.warn));

applyTheme(theme);
initMap();
renderPlaces();
