import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./src/supabase";

// ─── Constants & Seed Data ───────────────────────────────────────────────────

const STATUSES = ["Planned","In-Transit","Arrived","Delivered (Plant)","Delivered (Site, Empty Pending)","Reconciled","Closed"];
const STATUS_COLORS = {
  "Planned":"#6B7280","In-Transit":"#F59E0B","Arrived":"#3B82F6",
  "Delivered (Plant)":"#10B981","Delivered (Site, Empty Pending)":"#F97316",
  "Reconciled":"#8B5CF6","Closed":"#374151"
};
const MATERIALS = ["River Sand","M-Sand","P-Sand","Quarry Dust"];
const PLANTS = [{id:"P1",name:"Batching Plant 1",type:"Plant"},{id:"P2",name:"Batching Plant 2",type:"Plant"},{id:"P3",name:"Batching Plant 3",type:"Plant"}];
const SITES = [{id:"S1",name:"Tower A Site"},{id:"S2",name:"Tower B Site"},{id:"S3",name:"Villa Block Site"}];
const QUARRIES = [{id:"Q1",name:"Godavari Quarry"},{id:"Q2",name:"Krishna Quarry"}];
const VEHICLES = ["TS09EA1234","TS09EB5678","AP39TA9012","TS07FC3456","AP31TB7890","TS08ED2345","AP28TC6789"];
const TRANSPORTERS = ["Sri Sai Transport","Balaji Logistics","Durga Carriers","Kaveri Transport"];
const DRIVERS = ["Raju K.","Suresh M.","Venkat R.","Prasad B.","Kumar S.","Ramesh T.","Naresh D."];
const WB_IDS = ["WB-P1","WB-P2","WB-P3"];

const DUP_WINDOW_MIN = 60;

function uid(){return 'T'+Date.now().toString(36)+Math.random().toString(36).slice(2,6).toUpperCase()}
function wid(){return 'W'+Date.now().toString(36)+Math.random().toString(36).slice(2,6).toUpperCase()}
function fmt(d){if(!d)return'—';const dt=new Date(d);return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' '+dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
function fmtN(n,u='MT'){return n!=null?(+n).toFixed(2)+' '+u:'—'}
function rand(arr){return arr[Math.floor(Math.random()*arr.length)]}
function randBetween(a,b){return+(a+Math.random()*(b-a)).toFixed(2)}

function generateSeedData(){
  const trips=[];const weighments=[];const inventory=[];
  const now=Date.now();
  for(let i=0;i<28;i++){
    const tid=uid();const veh=rand(VEHICLES);const mat=rand(MATERIALS);
    const src=rand(QUARRIES);const isPlant=Math.random()>0.3;
    const dest=isPlant?rand(PLANTS):rand(SITES);
    const tripTime=new Date(now - Math.random()*7*86400000);
    const gross=randBetween(18,32);const tare=randBetween(8,12);const net=+(gross-tare).toFixed(2);
    let status;
    if(i<4)status="Planned";
    else if(i<7)status="In-Transit";
    else if(i<10)status="Arrived";
    else if(isPlant)status=Math.random()>0.3?"Delivered (Plant)":"Closed";
    else status=Math.random()>0.5?"Delivered (Site, Empty Pending)":"Reconciled";

    const trip={id:tid,vehicle:veh,driver:rand(DRIVERS),transporter:rand(TRANSPORTERS),material:mat,
      source:src.id,sourceName:src.name,destId:dest.id,destName:dest.name,destType:isPlant?'Plant':'Site',
      status,tripTime:tripTime.toISOString(),flags:[],reviewStatus:null,reviewerNotes:'',
      loadedGross:status!=='Planned'?gross:null,emptyTare:(status==='Delivered (Plant)'||status==='Reconciled'||status==='Closed')?tare:null,
      netReceived:(status==='Delivered (Plant)'||status==='Reconciled'||status==='Closed')?net:null,
      shortage:(status==='Delivered (Plant)'||status==='Reconciled'||status==='Closed')?+(gross-tare-net+randBetween(-0.5,0.5)).toFixed(2):null,
      lrNo:'LR'+String(1000+i),wbId:rand(WB_IDS),
      loadedPhotoUri:status!=='Planned'?'photo_loaded_'+tid+'.jpg':null,
      emptyPhotoUri:(status==='Delivered (Plant)'||status==='Reconciled'||status==='Closed')?'photo_empty_'+tid+'.jpg':null,
    };
    if(i===11||i===12){trip.flags.push('FLAG_DUP_LOADED');trip.reviewStatus='Pending'}
    trips.push(trip);
  }
  return {trips,weighments,inventory};
}

// ─── Icons (inline SVG) ─────────────────────────────────────────────────────

const Icon=({d,size=20,color='currentColor',style={}})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d={d}/></svg>
);
const Icons={
  truck:"M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 18.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 18.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  plus:"M12 5v14M5 12h14",
  flag:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  check:"M20 6L9 17l-5-5",
  x:"M18 6L6 18M6 6l12 12",
  search:"M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.35-4.35",
  filter:"M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  download:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  alert:"M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  clock:"M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2",
  box:"M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  bar:"M18 20V10M12 20V4M6 20v-6",
  eye:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
  edit:"M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  refresh:"M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  list:"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  home:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  weight:"M12 3v18M3 12h18M5 7l2 5M17 7l2 5M7 12a5 5 0 0010 0",
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
  --bg: #0F1117;
  --bg2: #161822;
  --bg3: #1C1F2E;
  --bg4: #242738;
  --border: #2A2D3E;
  --border2: #363A4F;
  --text: #E2E4ED;
  --text2: #9498AE;
  --text3: #6B6F85;
  --accent: #D4915D;
  --accent2: #E8A96E;
  --accent-bg: rgba(212,145,93,0.08);
  --green: #4ADE80;
  --green-bg: rgba(74,222,128,0.1);
  --red: #F87171;
  --red-bg: rgba(248,113,113,0.1);
  --yellow: #FBBF24;
  --yellow-bg: rgba(251,191,36,0.1);
  --blue: #60A5FA;
  --blue-bg: rgba(96,165,250,0.1);
  --purple: #A78BFA;
  --purple-bg: rgba(167,139,250,0.1);
  --radius: 10px;
  --shadow: 0 2px 12px rgba(0,0,0,0.3);
}

* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'DM Sans',sans-serif; background:var(--bg); color:var(--text); }

.app { display:flex; height:100vh; overflow:hidden; }

/* Sidebar */
.sidebar { width:220px; background:var(--bg2); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; }
.sidebar-logo { padding:20px 18px; font-size:15px; font-weight:700; letter-spacing:-0.3px; color:var(--accent); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
.sidebar-logo span { font-size:10px; background:var(--accent-bg); color:var(--accent); padding:2px 6px; border-radius:4px; font-weight:600; letter-spacing:0.5px; }
.nav-items { flex:1; padding:12px 8px; display:flex; flex-direction:column; gap:2px; }
.nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; cursor:pointer; font-size:13.5px; font-weight:500; color:var(--text2); transition:all 0.15s; position:relative; }
.nav-item:hover { background:var(--bg3); color:var(--text); }
.nav-item.active { background:var(--accent-bg); color:var(--accent); }
.nav-item.active::before { content:''; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:20px; background:var(--accent); border-radius:0 3px 3px 0; }
.nav-badge { margin-left:auto; font-size:10px; font-weight:700; background:var(--red); color:#fff; padding:1px 6px; border-radius:10px; font-family:'JetBrains Mono',monospace; }

/* Main */
.main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.topbar { height:56px; border-bottom:1px solid var(--border); display:flex; align-items:center; padding:0 24px; gap:16px; flex-shrink:0; }
.topbar-title { font-size:16px; font-weight:700; letter-spacing:-0.3px; }
.topbar-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
.search-box { display:flex; align-items:center; gap:8px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:6px 12px; }
.search-box input { background:none; border:none; outline:none; color:var(--text); font-size:13px; font-family:inherit; width:180px; }
.search-box input::placeholder { color:var(--text3); }

.content { flex:1; overflow-y:auto; padding:24px; }

/* Cards */
.stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:24px; }
.stat-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); padding:16px 18px; }
.stat-label { font-size:11.5px; font-weight:500; color:var(--text3); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px; }
.stat-value { font-size:26px; font-weight:700; font-family:'JetBrains Mono',monospace; letter-spacing:-1px; }
.stat-sub { font-size:11px; color:var(--text2); margin-top:4px; }

/* Table */
.table-wrap { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
.table-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); }
.table-header h3 { font-size:14px; font-weight:600; }
.table-actions { display:flex; gap:8px; }
table { width:100%; border-collapse:collapse; font-size:12.5px; }
thead th { text-align:left; padding:10px 14px; font-size:10.5px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:0.6px; border-bottom:1px solid var(--border); background:var(--bg3); position:sticky; top:0; }
tbody td { padding:10px 14px; border-bottom:1px solid var(--border); vertical-align:middle; }
tbody tr { transition:background 0.1s; }
tbody tr:hover { background:var(--bg3); }
tbody tr:last-child td { border-bottom:none; }
.table-scroll { overflow-x:auto; max-height:520px; overflow-y:auto; }

/* Badges & Tags */
.badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:6px; font-size:11px; font-weight:600; white-space:nowrap; }
.badge-status { font-family:'JetBrains Mono',monospace; font-size:10px; }
.badge-green { background:var(--green-bg); color:var(--green); }
.badge-red { background:var(--red-bg); color:var(--red); }
.badge-yellow { background:var(--yellow-bg); color:var(--yellow); }
.badge-blue { background:var(--blue-bg); color:var(--blue); }
.badge-purple { background:var(--purple-bg); color:var(--purple); }
.badge-gray { background:rgba(107,111,133,0.15); color:var(--text2); }
.flag-tag { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:4px; font-size:10px; font-weight:700; font-family:'JetBrains Mono',monospace; background:var(--red-bg); color:var(--red); margin-right:4px; }

/* Buttons */
.btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-size:12.5px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid var(--border); background:var(--bg3); color:var(--text); transition:all 0.15s; }
.btn:hover { background:var(--bg4); border-color:var(--border2); }
.btn-accent { background:var(--accent); color:#0F1117; border-color:var(--accent); }
.btn-accent:hover { background:var(--accent2); }
.btn-sm { padding:5px 10px; font-size:11.5px; }
.btn-icon { padding:6px; border-radius:6px; }

/* Modal */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:center; justify-content:center; }
.modal { background:var(--bg2); border:1px solid var(--border); border-radius:14px; width:580px; max-height:85vh; overflow-y:auto; box-shadow:var(--shadow); }
.modal-head { padding:18px 22px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
.modal-head h2 { font-size:16px; font-weight:700; }
.modal-body { padding:22px; }
.modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; }

/* Form */
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.form-group { display:flex; flex-direction:column; gap:5px; }
.form-group.full { grid-column:1/-1; }
.form-label { font-size:11px; font-weight:600; color:var(--text2); text-transform:uppercase; letter-spacing:0.4px; }
.form-input { background:var(--bg3); border:1px solid var(--border); border-radius:7px; padding:8px 12px; font-size:13px; color:var(--text); font-family:inherit; outline:none; transition:border 0.15s; }
.form-input:focus { border-color:var(--accent); }
select.form-input { cursor:pointer; }

/* Tabs */
.tabs { display:flex; gap:2px; background:var(--bg3); border-radius:8px; padding:3px; margin-bottom:20px; width:fit-content; }
.tab { padding:7px 16px; border-radius:6px; font-size:12.5px; font-weight:600; color:var(--text2); cursor:pointer; transition:all 0.15s; }
.tab:hover { color:var(--text); }
.tab.active { background:var(--bg); color:var(--accent); }

/* Recon */
.recon-card { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:12px; display:flex; align-items:center; gap:16px; }
.recon-card .pair-arrow { font-size:20px; color:var(--accent); font-weight:700; }

/* Scrollbar */
::-webkit-scrollbar { width:6px; height:6px; }
::-webkit-scrollbar-track { background:var(--bg); }
::-webkit-scrollbar-thumb { background:var(--border2); border-radius:3px; }

/* Animations */
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
.animate-in { animation:fadeIn 0.25s ease-out; }
`;

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({status}){
  const map={"Planned":"badge-gray","In-Transit":"badge-yellow","Arrived":"badge-blue",
    "Delivered (Plant)":"badge-green","Delivered (Site, Empty Pending)":"badge-purple",
    "Reconciled":"badge-green","Closed":"badge-gray"};
  const short={"Delivered (Plant)":"Plant Delivered","Delivered (Site, Empty Pending)":"Site (Pending)","Reconciled":"Reconciled"};
  return <span className={`badge badge-status ${map[status]||'badge-gray'}`}>{short[status]||status}</span>;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App(){
  const [trips,setTrips]=useState([]);
  const [loading,setLoading]=useState(true);
  const [page,setPage]=useState('dashboard');
  const [search,setSearch]=useState('');
  const [modal,setModal]=useState(null);
  const [tripFilter,setTripFilter]=useState('All');
  const [reconTab,setReconTab]=useState('pending');
  const [dupWindow]=useState(DUP_WINDOW_MIN);

  // ─── Load from Supabase ───
  useEffect(()=>{
    supabase.from('trips').select('*').order('tripTime',{ascending:false})
      .then(({data,error})=>{
        if(!error&&data) setTrips(data);
        setLoading(false);
      });
  },[]);

  const flaggedCount=trips.filter(t=>t.flags&&t.flags.includes('FLAG_DUP_LOADED')).length;
  const pendingRecon=trips.filter(t=>t.status==='Delivered (Site, Empty Pending)').length;

  // ─── Trip CRUD ───
  const addTrip=async(t)=>{
    const newTrip={...t,id:uid(),status:'Planned',flags:[],reviewStatus:null,reviewerNotes:'',
      loadedGross:null,emptyTare:null,netReceived:null,shortage:null,loadedPhotoUri:null,emptyPhotoUri:null};
    await supabase.from('trips').insert(newTrip);
    setTrips(ts=>[newTrip,...ts]);
    setModal(null);
  };

  const updateTripStatus=(id,newStatus,extra={})=>{
    setTrips(ts=>ts.map(t=>{
      if(t.id!==id)return t;
      const u={...t,status:newStatus,...extra};
      if(newStatus==='Arrived'&&!u.loadedGross)u.loadedGross=randBetween(18,32);
      if((newStatus==='Delivered (Plant)')&&u.loadedGross&&!u.emptyTare){u.emptyTare=randBetween(8,12);u.netReceived=+(u.loadedGross-u.emptyTare).toFixed(2);u.shortage=+randBetween(-0.3,0.8).toFixed(2);}
      supabase.from('trips').update(u).eq('id',id);
      return u;
    }));
  };

  const reviewFlag=(id,disposition,notes)=>{
    setTrips(ts=>ts.map(t=>{
      if(t.id!==id)return t;
      const u={...t,reviewStatus:disposition,reviewerNotes:notes,
        flags:disposition==='Valid'?t.flags.filter(f=>f!=='FLAG_DUP_LOADED'):t.flags};
      supabase.from('trips').update(u).eq('id',id);
      return u;
    }));
  };

  const reconcileTrip=(id)=>{
    setTrips(ts=>ts.map(t=>{
      if(t.id!==id)return t;
      const tare=randBetween(8,12);
      const u={...t,status:'Reconciled',emptyTare:tare,netReceived:t.loadedGross?+(t.loadedGross-tare).toFixed(2):null,shortage:+randBetween(-0.2,0.6).toFixed(2)};
      supabase.from('trips').update(u).eq('id',id);
      return u;
    }));
  };

  // ─── Duplicate Detection ───
  const runDupScan=()=>{
    const sorted=[...trips].filter(t=>t.loadedGross).sort((a,b)=>new Date(a.tripTime)-new Date(b.tripTime));
    const updated=trips.map(t=>({...t}));
    for(let i=0;i<sorted.length;i++){
      for(let j=i+1;j<sorted.length;j++){
        if(sorted[j].vehicle===sorted[i].vehicle&&sorted[j].wbId===sorted[i].wbId){
          const diff=Math.abs(new Date(sorted[j].tripTime)-new Date(sorted[i].tripTime))/60000;
          if(diff<dupWindow){
            const idx=updated.findIndex(t=>t.id===sorted[j].id);
            if(idx>=0&&!updated[idx].flags.includes('FLAG_DUP_LOADED')){
              updated[idx].flags=[...updated[idx].flags,'FLAG_DUP_LOADED'];
              updated[idx].reviewStatus='Pending';
              supabase.from('trips').update({flags:updated[idx].flags,reviewStatus:'Pending'}).eq('id',updated[idx].id);
            }
          }
        }
      }
    }
    setTrips(updated);
  };

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0F1117',color:'#9498AE',fontFamily:'DM Sans,sans-serif',fontSize:15}}>Loading trips…</div>;

  // ─── Filtered trips ───
  const filtered=useMemo(()=>{
    let t=trips;
    if(tripFilter!=='All')t=t.filter(tr=>tr.status===tripFilter);
    if(search){const s=search.toLowerCase();t=t.filter(tr=>tr.vehicle.toLowerCase().includes(s)||tr.id.toLowerCase().includes(s)||tr.destName.toLowerCase().includes(s)||tr.transporter.toLowerCase().includes(s));}
    return t;
  },[trips,tripFilter,search]);

  // ─── Inventory summation ───
  const inventorySummary=useMemo(()=>{
    const map={};
    trips.filter(t=>t.netReceived&&(t.status==='Delivered (Plant)'||t.status==='Reconciled'||t.status==='Closed')).forEach(t=>{
      const k=t.destName+'||'+t.material;
      if(!map[k])map[k]={dest:t.destName,material:t.material,qty:0,trips:0};
      map[k].qty+=t.netReceived;map[k].trips++;
    });
    return Object.values(map).sort((a,b)=>b.qty-a.qty);
  },[trips]);

  // ─── Export CSV ───
  const exportCSV=()=>{
    const hdr=['Trip ID','Vehicle','Driver','Transporter','Material','Source','Destination','Status','Loaded Gross (MT)','Empty Tare (MT)','Net Received (MT)','Shortage (MT)','Flags','Trip Time'];
    const rows=filtered.map(t=>[t.id,t.vehicle,t.driver,t.transporter,t.material,t.sourceName,t.destName,t.status,t.loadedGross||'',t.emptyTare||'',t.netReceived||'',t.shortage||'',t.flags.join(';'),t.tripTime]);
    const csv=[hdr,...rows].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='trips_export.csv';a.click();
  };

  // ─── Nav ───
  const navItems=[
    {key:'dashboard',label:'Dashboard',icon:Icons.home},
    {key:'trips',label:'Trips',icon:Icons.truck},
    {key:'weighments',label:'Weighments',icon:Icons.weight},
    {key:'duplicates',label:'Flagged / Dupes',icon:Icons.alert,badge:flaggedCount},
    {key:'reconciliation',label:'Reconciliation',icon:Icons.refresh,badge:pendingRecon},
    {key:'inventory',label:'Inventory',icon:Icons.box},
    {key:'reports',label:'Reports',icon:Icons.bar},
  ];

  return(
    <>
    <style>{css}</style>
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#D4915D"/><path d="M7 17V10l5-5 5 5v7" stroke="#0F1117" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          SandTrack <span>v1.0</span>
        </div>
        <nav className="nav-items">
          {navItems.map(n=>(
            <div key={n.key} className={`nav-item${page===n.key?' active':''}`} onClick={()=>setPage(n.key)}>
              <Icon d={n.icon} size={18}/>
              {n.label}
              {n.badge>0&&<span className="nav-badge">{n.badge}</span>}
            </div>
          ))}
        </nav>
        <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)',fontSize:'10.5px',color:'var(--text3)'}}>
          Dup Window: {dupWindow} min<br/>
          {trips.length} trips loaded
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{navItems.find(n=>n.key===page)?.label||'Dashboard'}</span>
          <div className="topbar-right">
            <div className="search-box">
              <Icon d={Icons.search} size={15} color="var(--text3)"/>
              <input placeholder="Search vehicle, trip…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            {page==='trips'&&<button className="btn btn-accent" onClick={()=>setModal('newTrip')}><Icon d={Icons.plus} size={15} color="#0F1117"/>New Trip</button>}
          </div>
        </header>

        <div className="content animate-in" key={page}>
          {page==='dashboard'&&<DashboardPage trips={trips} flagged={flaggedCount} pending={pendingRecon} setPage={setPage}/>}
          {page==='trips'&&<TripsPage trips={filtered} filter={tripFilter} setFilter={setTripFilter} onStatusChange={updateTripStatus} onExport={exportCSV} setModal={setModal}/>}
          {page==='weighments'&&<WeighmentsPage trips={trips}/>}
          {page==='duplicates'&&<DuplicatesPage trips={trips} onReview={reviewFlag} onScan={runDupScan}/>}
          {page==='reconciliation'&&<ReconciliationPage trips={trips} tab={reconTab} setTab={setReconTab} onReconcile={reconcileTrip}/>}
          {page==='inventory'&&<InventoryPage summary={inventorySummary}/>}
          {page==='reports'&&<ReportsPage trips={trips}/>}
        </div>
      </div>

      {/* Modal: New Trip */}
      {modal==='newTrip'&&<NewTripModal onSave={addTrip} onClose={()=>setModal(null)}/>}
    </div>
    </>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function DashboardPage({trips,flagged,pending,setPage}){
  const totalNet=trips.reduce((s,t)=>s+(t.netReceived||0),0);
  const todayTrips=trips.filter(t=>{const d=new Date(t.tripTime);const n=new Date();return d.toDateString()===n.toDateString()}).length;
  const delivered=trips.filter(t=>['Delivered (Plant)','Reconciled','Closed'].includes(t.status)).length;
  const inTransit=trips.filter(t=>t.status==='In-Transit').length;

  const byMaterial={};trips.filter(t=>t.netReceived).forEach(t=>{byMaterial[t.material]=(byMaterial[t.material]||0)+t.netReceived});
  const byDest={};trips.filter(t=>t.netReceived).forEach(t=>{byDest[t.destName]=(byDest[t.destName]||0)+t.netReceived});

  return(<>
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">Total Received</div><div className="stat-value" style={{color:'var(--green)'}}>{totalNet.toFixed(1)}<span style={{fontSize:14,color:'var(--text2)'}}> MT</span></div></div>
      <div className="stat-card"><div className="stat-label">Total Trips</div><div className="stat-value">{trips.length}</div><div className="stat-sub">{todayTrips} today</div></div>
      <div className="stat-card"><div className="stat-label">Delivered</div><div className="stat-value" style={{color:'var(--blue)'}}>{delivered}</div></div>
      <div className="stat-card"><div className="stat-label">In-Transit</div><div className="stat-value" style={{color:'var(--yellow)'}}>{inTransit}</div></div>
      <div className="stat-card" style={{cursor:'pointer'}} onClick={()=>setPage('duplicates')}><div className="stat-label">Flagged Dupes</div><div className="stat-value" style={{color:flagged?'var(--red)':'var(--text)'}}>{flagged}</div></div>
      <div className="stat-card" style={{cursor:'pointer'}} onClick={()=>setPage('reconciliation')}><div className="stat-label">Pending Recon</div><div className="stat-value" style={{color:pending?'var(--yellow)':'var(--text)'}}>{pending}</div></div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="table-wrap">
        <div className="table-header"><h3>Quantity by Material</h3></div>
        <div className="table-scroll">
          <table><thead><tr><th>Material</th><th style={{textAlign:'right'}}>Qty (MT)</th></tr></thead>
          <tbody>{Object.entries(byMaterial).sort((a,b)=>b[1]-a[1]).map(([m,q])=>(
            <tr key={m}><td>{m}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{q.toFixed(2)}</td></tr>
          ))}</tbody></table>
        </div>
      </div>
      <div className="table-wrap">
        <div className="table-header"><h3>Quantity by Destination</h3></div>
        <div className="table-scroll">
          <table><thead><tr><th>Destination</th><th style={{textAlign:'right'}}>Qty (MT)</th></tr></thead>
          <tbody>{Object.entries(byDest).sort((a,b)=>b[1]-a[1]).map(([d,q])=>(
            <tr key={d}><td>{d}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{q.toFixed(2)}</td></tr>
          ))}</tbody></table>
        </div>
      </div>
    </div>

    <div className="table-wrap" style={{marginTop:14}}>
      <div className="table-header"><h3>Recent Trips</h3></div>
      <div className="table-scroll">
        <table><thead><tr><th>Trip</th><th>Vehicle</th><th>Material</th><th>Destination</th><th>Status</th><th style={{textAlign:'right'}}>Net (MT)</th></tr></thead>
        <tbody>{trips.slice(0,8).map(t=>(
          <tr key={t.id}><td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{t.id.slice(0,10)}</td><td>{t.vehicle}</td><td>{t.material}</td><td>{t.destName}</td><td><StatusBadge status={t.status}/></td><td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{fmtN(t.netReceived)}</td></tr>
        ))}</tbody></table>
      </div>
    </div>
  </>);
}

// ─── Trips Page ──────────────────────────────────────────────────────────────

function TripsPage({trips,filter,setFilter,onStatusChange,onExport,setModal}){
  const [detail,setDetail]=useState(null);
  return(<>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
      {['All',...STATUSES].map(s=>(
        <button key={s} className={`btn btn-sm${filter===s?' btn-accent':''}`} onClick={()=>setFilter(s)}>{s==='All'?'All':s.replace('Delivered (','').replace(')','').replace(', Empty Pending',' Pend.')}</button>
      ))}
      <div style={{marginLeft:'auto'}}><button className="btn btn-sm" onClick={onExport}><Icon d={Icons.download} size={14}/>Export CSV</button></div>
    </div>
    <div className="table-wrap">
      <div className="table-scroll">
        <table><thead><tr><th>Trip ID</th><th>Vehicle</th><th>Transporter</th><th>Material</th><th>Route</th><th>Status</th><th>Flags</th><th>Gross</th><th>Tare</th><th>Net</th><th>Time</th><th></th></tr></thead>
        <tbody>{trips.map(t=>(
          <tr key={t.id}>
            <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{t.id.slice(0,10)}</td>
            <td style={{fontWeight:600}}>{t.vehicle}</td>
            <td>{t.transporter}</td>
            <td>{t.material}</td>
            <td style={{fontSize:11.5}}>{t.sourceName} → {t.destName}</td>
            <td><StatusBadge status={t.status}/></td>
            <td>{t.flags.map(f=><span key={f} className="flag-tag">{f.replace('FLAG_','')}</span>)}</td>
            <td style={{fontFamily:'JetBrains Mono',fontSize:12}}>{t.loadedGross?t.loadedGross.toFixed(2):'—'}</td>
            <td style={{fontFamily:'JetBrains Mono',fontSize:12}}>{t.emptyTare?t.emptyTare.toFixed(2):'—'}</td>
            <td style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>{t.netReceived?t.netReceived.toFixed(2):'—'}</td>
            <td style={{fontSize:11,color:'var(--text2)'}}>{fmt(t.tripTime)}</td>
            <td>
              <div style={{display:'flex',gap:4}}>
                <button className="btn btn-icon btn-sm" title="View" onClick={()=>setDetail(t)}><Icon d={Icons.eye} size={14}/></button>
                {t.status==='Planned'&&<button className="btn btn-icon btn-sm" title="Mark In-Transit" onClick={()=>onStatusChange(t.id,'In-Transit')}><Icon d={Icons.truck} size={14}/></button>}
                {t.status==='In-Transit'&&<button className="btn btn-icon btn-sm" title="Mark Arrived" onClick={()=>onStatusChange(t.id,'Arrived')}><Icon d={Icons.check} size={14}/></button>}
                {t.status==='Arrived'&&t.destType==='Plant'&&<button className="btn btn-icon btn-sm badge-green" style={{background:'var(--green-bg)',color:'var(--green)',border:'1px solid var(--green)'}} title="Plant Delivered" onClick={()=>onStatusChange(t.id,'Delivered (Plant)')}><Icon d={Icons.check} size={14} color="var(--green)"/></button>}
                {t.status==='Arrived'&&t.destType==='Site'&&<button className="btn btn-icon btn-sm" style={{background:'var(--purple-bg)',color:'var(--purple)',border:'1px solid var(--purple)'}} title="Site Unloaded" onClick={()=>onStatusChange(t.id,'Delivered (Site, Empty Pending)')}><Icon d={Icons.box} size={14} color="var(--purple)"/></button>}
              </div>
            </td>
          </tr>
        ))}</tbody></table>
      </div>
    </div>

    {/* Trip Detail Modal */}
    {detail&&(
      <div className="modal-overlay" onClick={()=>setDetail(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head"><h2>Trip {detail.id.slice(0,10)}</h2><button className="btn btn-icon btn-sm" onClick={()=>setDetail(null)}><Icon d={Icons.x} size={16}/></button></div>
          <div className="modal-body">
            <div className="form-grid">
              {[['Vehicle',detail.vehicle],['Driver',detail.driver],['Transporter',detail.transporter],['Material',detail.material],['Source',detail.sourceName],['Destination',detail.destName],['Status',detail.status],['LR No',detail.lrNo],['Weighbridge',detail.wbId],['Loaded Gross',fmtN(detail.loadedGross)],['Empty Tare',fmtN(detail.emptyTare)],['Net Received',fmtN(detail.netReceived)],['Shortage',fmtN(detail.shortage)],['Trip Time',fmt(detail.tripTime)]].map(([l,v])=>(
                <div className="form-group" key={l}><div className="form-label">{l}</div><div style={{fontSize:13.5,fontWeight:500}}>{v||'—'}</div></div>
              ))}
              <div className="form-group full"><div className="form-label">Flags</div><div>{detail.flags.length?detail.flags.map(f=><span key={f} className="flag-tag">{f}</span>):'None'}</div></div>
            </div>
          </div>
        </div>
      </div>
    )}
  </>);
}

// ─── Weighments Page ─────────────────────────────────────────────────────────

function WeighmentsPage({trips}){
  const weighments=trips.filter(t=>t.loadedGross).map(t=>({
    trip:t.id,vehicle:t.vehicle,wb:t.wbId,type:'Loaded',weight:t.loadedGross,time:t.tripTime,photo:t.loadedPhotoUri
  })).concat(
    trips.filter(t=>t.emptyTare).map(t=>({
      trip:t.id,vehicle:t.vehicle,wb:t.wbId,type:'Empty',weight:t.emptyTare,time:t.tripTime,photo:t.emptyPhotoUri
    }))
  ).sort((a,b)=>new Date(b.time)-new Date(a.time));

  return(
    <div className="table-wrap">
      <div className="table-header"><h3>All Weighments ({weighments.length})</h3></div>
      <div className="table-scroll">
        <table><thead><tr><th>Trip</th><th>Vehicle</th><th>WB</th><th>Type</th><th style={{textAlign:'right'}}>Weight (MT)</th><th>Timestamp</th><th>Photo</th></tr></thead>
        <tbody>{weighments.map((w,i)=>(
          <tr key={i}>
            <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{w.trip.slice(0,10)}</td>
            <td style={{fontWeight:600}}>{w.vehicle}</td>
            <td>{w.wb}</td>
            <td><span className={`badge ${w.type==='Loaded'?'badge-blue':'badge-yellow'}`}>{w.type}</span></td>
            <td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{w.weight.toFixed(2)}</td>
            <td style={{fontSize:11,color:'var(--text2)'}}>{fmt(w.time)}</td>
            <td>{w.photo?<span style={{fontSize:11,color:'var(--accent)',cursor:'pointer'}}>📷 {w.photo.slice(0,18)}…</span>:'—'}</td>
          </tr>
        ))}</tbody></table>
      </div>
    </div>
  );
}

// ─── Duplicates Page ─────────────────────────────────────────────────────────

function DuplicatesPage({trips,onReview,onScan}){
  const flagged=trips.filter(t=>t.flags.includes('FLAG_DUP_LOADED'));
  const [notes,setNotes]=useState({});

  return(<>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
      <button className="btn btn-accent" onClick={onScan}><Icon d={Icons.search} size={15} color="#0F1117"/>Run Duplicate Scan</button>
      <span style={{fontSize:12,color:'var(--text2)'}}>{flagged.length} flagged record(s)</span>
    </div>
    {flagged.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--text3)',fontSize:14}}>No flagged duplicates. Run a scan to check.</div>}
    {flagged.map(t=>(
      <div key={t.id} className="recon-card" style={{flexDirection:'column',alignItems:'stretch'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <span style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>{t.id.slice(0,10)}</span>
            <span style={{margin:'0 8px',color:'var(--text3)'}}>|</span>
            <span style={{fontWeight:600}}>{t.vehicle}</span>
            <span style={{margin:'0 8px',color:'var(--text3)'}}>|</span>
            <span>{t.destName}</span>
            <span style={{margin:'0 8px',color:'var(--text3)'}}>|</span>
            <span style={{fontSize:11,color:'var(--text2)'}}>{fmt(t.tripTime)}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span className="flag-tag">DUP_LOADED</span>
            {t.reviewStatus==='Pending'&&<span className="badge badge-yellow">Pending Review</span>}
            {t.reviewStatus==='Valid'&&<span className="badge badge-green">Cleared</span>}
            {t.reviewStatus==='Invalid'&&<span className="badge badge-red">Rejected</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginTop:10,alignItems:'center'}}>
          <input className="form-input" placeholder="Reviewer notes…" style={{flex:1,fontSize:12}} value={notes[t.id]||''} onChange={e=>setNotes(n=>({...n,[t.id]:e.target.value}))}/>
          <button className="btn btn-sm badge-green" style={{background:'var(--green-bg)',color:'var(--green)',borderColor:'var(--green)'}} onClick={()=>{onReview(t.id,'Valid',notes[t.id]||'');setNotes(n=>({...n,[t.id]:''}));}}>✓ Valid</button>
          <button className="btn btn-sm" style={{background:'var(--red-bg)',color:'var(--red)',borderColor:'var(--red)'}} onClick={()=>{onReview(t.id,'Invalid',notes[t.id]||'');setNotes(n=>({...n,[t.id]:''}));}}>✗ Invalid</button>
        </div>
      </div>
    ))}
  </>);
}

// ─── Reconciliation Page ─────────────────────────────────────────────────────

function ReconciliationPage({trips,tab,setTab,onReconcile}){
  const pending=trips.filter(t=>t.status==='Delivered (Site, Empty Pending)');
  const reconciled=trips.filter(t=>t.status==='Reconciled');

  return(<>
    <div className="tabs">
      <div className={`tab${tab==='pending'?' active':''}`} onClick={()=>setTab('pending')}>Pending ({pending.length})</div>
      <div className={`tab${tab==='reconciled'?' active':''}`} onClick={()=>setTab('reconciled')}>Reconciled ({reconciled.length})</div>
    </div>

    {tab==='pending'&&(<>
      {pending.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--text3)'}}>All site unloads reconciled.</div>}
      {pending.map(t=>(
        <div key={t.id} className="recon-card">
          <div style={{flex:1}}>
            <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:6}}>
              <span style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>{t.id.slice(0,10)}</span>
              <span style={{fontWeight:600}}>{t.vehicle}</span>
              <StatusBadge status={t.status}/>
            </div>
            <div style={{fontSize:12,color:'var(--text2)'}}>
              {t.sourceName} → {t.destName} &nbsp;|&nbsp; Material: {t.material} &nbsp;|&nbsp; Loaded Gross: <b>{fmtN(t.loadedGross)}</b> &nbsp;|&nbsp; Empty: <b style={{color:'var(--yellow)'}}>Pending</b>
            </div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Trip Time: {fmt(t.tripTime)}</div>
          </div>
          <button className="btn btn-accent btn-sm" onClick={()=>onReconcile(t.id)}>Allocate Empty &amp; Reconcile</button>
        </div>
      ))}
    </>)}

    {tab==='reconciled'&&(
      <div className="table-wrap">
        <div className="table-scroll">
          <table><thead><tr><th>Trip</th><th>Vehicle</th><th>Destination</th><th>Material</th><th style={{textAlign:'right'}}>Gross</th><th style={{textAlign:'right'}}>Tare</th><th style={{textAlign:'right'}}>Net</th><th style={{textAlign:'right'}}>Shortage</th><th>Status</th></tr></thead>
          <tbody>{reconciled.map(t=>(
            <tr key={t.id}>
              <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{t.id.slice(0,10)}</td>
              <td style={{fontWeight:600}}>{t.vehicle}</td>
              <td>{t.destName}</td>
              <td>{t.material}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{fmtN(t.loadedGross)}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{fmtN(t.emptyTare)}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{fmtN(t.netReceived)}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono',color:t.shortage>0.5?'var(--red)':'var(--green)'}}>{fmtN(t.shortage)}</td>
              <td><StatusBadge status={t.status}/></td>
            </tr>
          ))}</tbody></table>
        </div>
      </div>
    )}
  </>);
}

// ─── Inventory Page ──────────────────────────────────────────────────────────

function InventoryPage({summary}){
  const total=summary.reduce((s,r)=>s+r.qty,0);
  return(<>
    <div className="stat-grid" style={{marginBottom:20}}>
      <div className="stat-card"><div className="stat-label">Total Inventory In</div><div className="stat-value" style={{color:'var(--green)'}}>{total.toFixed(1)} <span style={{fontSize:14,color:'var(--text2)'}}>MT</span></div></div>
      <div className="stat-card"><div className="stat-label">Destinations</div><div className="stat-value">{new Set(summary.map(s=>s.dest)).size}</div></div>
      <div className="stat-card"><div className="stat-label">Materials</div><div className="stat-value">{new Set(summary.map(s=>s.material)).size}</div></div>
    </div>
    <div className="table-wrap">
      <div className="table-header"><h3>Inventory Ledger Summary</h3></div>
      <div className="table-scroll">
        <table><thead><tr><th>Destination</th><th>Material</th><th style={{textAlign:'right'}}>Qty In (MT)</th><th style={{textAlign:'right'}}>Trips</th></tr></thead>
        <tbody>{summary.map((r,i)=>(
          <tr key={i}><td>{r.dest}</td><td>{r.material}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{r.qty.toFixed(2)}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{r.trips}</td></tr>
        ))}</tbody></table>
      </div>
    </div>
  </>);
}

// ─── Reports Page ────────────────────────────────────────────────────────────

function ReportsPage({trips}){
  // Shortage by transporter
  const byTransporter={};
  trips.filter(t=>t.shortage!=null).forEach(t=>{
    if(!byTransporter[t.transporter])byTransporter[t.transporter]={trips:0,totalShortage:0,totalNet:0};
    byTransporter[t.transporter].trips++;
    byTransporter[t.transporter].totalShortage+=Math.max(0,t.shortage);
    byTransporter[t.transporter].totalNet+=(t.netReceived||0);
  });

  // Vehicle utilization
  const byVehicle={};
  trips.forEach(t=>{
    if(!byVehicle[t.vehicle])byVehicle[t.vehicle]={trips:0,totalNet:0};
    byVehicle[t.vehicle].trips++;
    byVehicle[t.vehicle].totalNet+=(t.netReceived||0);
  });

  return(<>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="table-wrap">
        <div className="table-header"><h3>Shortage by Transporter</h3></div>
        <div className="table-scroll">
          <table><thead><tr><th>Transporter</th><th style={{textAlign:'right'}}>Trips</th><th style={{textAlign:'right'}}>Total Shortage (MT)</th><th style={{textAlign:'right'}}>Shortage %</th></tr></thead>
          <tbody>{Object.entries(byTransporter).sort((a,b)=>b[1].totalShortage-a[1].totalShortage).map(([name,d])=>(
            <tr key={name}>
              <td style={{fontWeight:500}}>{name}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{d.trips}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono',color:d.totalShortage>1?'var(--red)':'var(--text)'}}>{d.totalShortage.toFixed(2)}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{d.totalNet?(d.totalShortage/d.totalNet*100).toFixed(1)+'%':'—'}</td>
            </tr>
          ))}</tbody></table>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header"><h3>Vehicle Utilization</h3></div>
        <div className="table-scroll">
          <table><thead><tr><th>Vehicle</th><th style={{textAlign:'right'}}>Trips</th><th style={{textAlign:'right'}}>Total Carried (MT)</th></tr></thead>
          <tbody>{Object.entries(byVehicle).sort((a,b)=>b[1].trips-a[1].trips).map(([veh,d])=>(
            <tr key={veh}>
              <td style={{fontWeight:600,fontFamily:'JetBrains Mono',fontSize:12}}>{veh}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{d.trips}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{d.totalNet.toFixed(2)}</td>
            </tr>
          ))}</tbody></table>
        </div>
      </div>
    </div>

    <div className="table-wrap" style={{marginTop:14}}>
      <div className="table-header"><h3>Daily Receipt Summary</h3></div>
      <div className="table-scroll">
        <table><thead><tr><th>Date</th><th style={{textAlign:'right'}}>Trips</th><th style={{textAlign:'right'}}>Total Net (MT)</th><th style={{textAlign:'right'}}>Avg Net/Trip</th></tr></thead>
        <tbody>{(()=>{
          const byDay={};
          trips.filter(t=>t.netReceived).forEach(t=>{
            const d=new Date(t.tripTime).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
            if(!byDay[d])byDay[d]={trips:0,net:0};byDay[d].trips++;byDay[d].net+=t.netReceived;
          });
          return Object.entries(byDay).map(([d,v])=>(
            <tr key={d}><td>{d}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{v.trips}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{v.net.toFixed(2)}</td><td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{(v.net/v.trips).toFixed(2)}</td></tr>
          ));
        })()}</tbody></table>
      </div>
    </div>
  </>);
}

// ─── New Trip Modal ──────────────────────────────────────────────────────────

function NewTripModal({onSave,onClose}){
  const [form,setForm]=useState({vehicle:VEHICLES[0],driver:DRIVERS[0],transporter:TRANSPORTERS[0],material:MATERIALS[0],
    source:QUARRIES[0].id,sourceName:QUARRIES[0].name,destId:PLANTS[0].id,destName:PLANTS[0].name,destType:'Plant',lrNo:'LR'+Math.floor(1000+Math.random()*9000),wbId:WB_IDS[0],tripTime:new Date().toISOString()});
  const allDest=[...PLANTS.map(p=>({...p,type:'Plant'})),...SITES.map(s=>({...s,type:'Site'}))];

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h2>New Trip</h2><button className="btn btn-icon btn-sm" onClick={onClose}><Icon d={Icons.x} size={16}/></button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Vehicle</label><select className="form-input" value={form.vehicle} onChange={e=>set('vehicle',e.target.value)}>{VEHICLES.map(v=><option key={v}>{v}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Driver</label><select className="form-input" value={form.driver} onChange={e=>set('driver',e.target.value)}>{DRIVERS.map(v=><option key={v}>{v}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Transporter</label><select className="form-input" value={form.transporter} onChange={e=>set('transporter',e.target.value)}>{TRANSPORTERS.map(v=><option key={v}>{v}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Material</label><select className="form-input" value={form.material} onChange={e=>set('material',e.target.value)}>{MATERIALS.map(v=><option key={v}>{v}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Source (Quarry)</label><select className="form-input" value={form.source} onChange={e=>{const q=QUARRIES.find(q=>q.id===e.target.value);set('source',q.id);set('sourceName',q.name);}}>{QUARRIES.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Destination</label><select className="form-input" value={form.destId} onChange={e=>{const d=allDest.find(d=>d.id===e.target.value);set('destId',d.id);set('destName',d.name);set('destType',d.type);}}>{allDest.map(d=><option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}</select></div>
            <div className="form-group"><label className="form-label">LR / Challan No</label><input className="form-input" value={form.lrNo} onChange={e=>set('lrNo',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Weighbridge</label><select className="form-input" value={form.wbId} onChange={e=>set('wbId',e.target.value)}>{WB_IDS.map(w=><option key={w}>{w}</option>)}</select></div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={()=>onSave(form)}>Create Trip</button>
        </div>
      </div>
    </div>
  );
}
