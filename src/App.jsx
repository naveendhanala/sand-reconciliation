import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from './supabase';

// ─── Constants & Seed Data ───────────────────────────────────────────────────

const STATUSES = ["Arrived","Delivered (Plant)","Delivered (Site, Empty Pending)","Delivered (Site)"];
const MATERIALS = ["River Sand","M-Sand","P-Sand","Quarry Dust"];
const PLANTS = [{id:"P1",name:"Batching Plant 1",type:"Plant"},{id:"P2",name:"Batching Plant 2",type:"Plant"},{id:"P3",name:"Batching Plant 3",type:"Plant"}];
const SITES = [{id:"S1",name:"Tower A Site"},{id:"S2",name:"Tower B Site"},{id:"S3",name:"Villa Block Site"}];
const QUARRIES = [{id:"Q1",name:"Godavari Quarry"},{id:"Q2",name:"Krishna Quarry"}];
const VEHICLES = ["TS09EA1234","TS09EB5678","AP39TA9012","TS07FC3456","AP31TB7890","TS08ED2345","AP28TC6789"];
const TRANSPORTERS = ["Sri Sai Transport","Balaji Logistics","Durga Carriers","Kaveri Transport"];
const DRIVERS = ["Raju K.","Suresh M.","Venkat R.","Prasad B.","Kumar S.","Ramesh T.","Naresh D."];
const WB_IDS = ["WB-P1","WB-P2","WB-P3"];

const DUP_WINDOW_MIN = 60;
const DEV_THRESHOLD = 0.05;


function fmt(d){if(!d)return'—';const dt=new Date(d);return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' '+dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
function fmtN(n,u='MT'){return n!=null?(+n).toFixed(2)+' '+u:'—'}
function rand(arr){return arr[Math.floor(Math.random()*arr.length)]}
function randBetween(a,b){return+(a+Math.random()*(b-a)).toFixed(2)}


function applyDupScan(trips,windowMin){
  const sorted=[...trips].filter(t=>t.loadedGross).sort((a,b)=>new Date(a.tripTime)-new Date(b.tripTime));
  const result=trips.map(t=>({...t}));
  for(let i=0;i<sorted.length;i++){
    for(let j=i+1;j<sorted.length;j++){
      if(sorted[j].vehicle===sorted[i].vehicle){
        const diff=Math.abs(new Date(sorted[j].tripTime)-new Date(sorted[i].tripTime))/60000;
        if(diff<windowMin){
          const idx=result.findIndex(t=>t.id===sorted[j].id);
          if(idx>=0&&!result[idx].flags.includes('FLAG_DUP_LOADED')){
            result[idx].flags.push('FLAG_DUP_LOADED');
            result[idx].reviewStatus='Pending';
          }
        }
      }
    }
  }
  return result;
}

function applyDeviationScan(trips){
  const sorted=[...trips].sort((a,b)=>new Date(a.tripTime)-new Date(b.tripTime));
  const result=trips.map(t=>({...t}));
  for(let j=0;j<sorted.length;j++){
    const curr=sorted[j];
    let prevGross=null,prevTare=null;
    for(let i=j-1;i>=0;i--){
      if(sorted[i].vehicle===curr.vehicle){
        if(prevGross===null&&sorted[i].loadedGross)prevGross=sorted[i].loadedGross;
        if(prevTare===null&&sorted[i].emptyTare)prevTare=sorted[i].emptyTare;
        if(prevGross!==null&&prevTare!==null)break;
      }
    }
    const idx=result.findIndex(t=>t.id===curr.id);
    if(idx<0)continue;
    if(prevGross!==null&&curr.loadedGross&&Math.abs(curr.loadedGross-prevGross)/prevGross>DEV_THRESHOLD){
      if(!result[idx].flags.includes('FLAG_GROSS_DEV')){result[idx].flags.push('FLAG_GROSS_DEV');if(!result[idx].reviewStatus)result[idx].reviewStatus='Pending';}
    }
    if(prevTare!==null&&curr.emptyTare&&Math.abs(curr.emptyTare-prevTare)/prevTare>DEV_THRESHOLD){
      if(!result[idx].flags.includes('FLAG_TARE_DEV')){result[idx].flags.push('FLAG_TARE_DEV');if(!result[idx].reviewStatus)result[idx].reviewStatus='Pending';}
    }
  }
  return result;
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
  upload:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  camera:"M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z",
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
  const map={"Arrived":"badge-blue","Delivered (Plant)":"badge-green",
    "Delivered (Site, Empty Pending)":"badge-purple",
    "Delivered (Site)":"badge-green",
    };
  const short={"Delivered (Plant)":"Plant Delivered","Delivered (Site, Empty Pending)":"Site Unloaded, Tare Pending","Delivered (Site)":"Site Delivered"};
  return <span className={`badge badge-status ${map[status]||'badge-gray'}`}>{short[status]||status}</span>;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App(){
  const [data,setData]=useState({trips:[],weighments:[],inventory:[],nextId:1});
  const [loading,setLoading]=useState(true);
  const loaded=useRef(false);
  const prevTrips=useRef([]);

  // ─── Load from Supabase ───
  useEffect(()=>{
    supabase.from('trips').select('data').order('created_at',{ascending:false})
      .then(({data:rows,error})=>{
        if(!error&&rows&&rows.length>0){
          const trips=rows.map(r=>r.data);
          const maxId=Math.max(0,...trips.map(t=>Number(t.id)).filter(n=>!isNaN(n)));
          prevTrips.current=trips;
          setData(d=>({...d,trips,nextId:maxId+1}));
        }
        loaded.current=true;
        setLoading(false);
      });
  },[]);

  // ─── Sync changes to Supabase ───
  useEffect(()=>{
    if(!loaded.current)return;
    const changed=data.trips.filter(t=>{
      const prev=prevTrips.current.find(p=>p.id===t.id);
      return !prev||JSON.stringify(prev)!==JSON.stringify(t);
    });
    if(changed.length>0)supabase.from('trips').upsert(changed.map(t=>({id:t.id,data:t})));
    prevTrips.current=data.trips;
  },[data]);
  const [page,setPage]=useState('dashboard');
  const [search,setSearch]=useState('');
  const [modal,setModal]=useState(null);
  const [tripFilter,setTripFilter]=useState('All');

  const trips=data.trips;
  const flaggedCount=trips.filter(t=>t.flags.some(f=>['FLAG_DUP_LOADED','FLAG_GROSS_DEV','FLAG_TARE_DEV'].includes(f))).length;

  // ─── Trip CRUD ───
  const addTrip=(t)=>{
    setData(d=>{
      const newTrip={...t,id:String(d.nextId),status:'Arrived',flags:[],reviewStatus:null,reviewerNotes:'',
        emptyTare:null,emptyTareTime:null,netReceived:null,loadedPhotoUri:null,siteUnloadPhotoUri:null,emptyPhotoUri:null,
        emptyWeighmentSlipUri:null,emptyWeighmentSlipName:null};
      return {...d,nextId:d.nextId+1,trips:applyDeviationScan(applyDupScan([newTrip,...d.trips],DUP_WINDOW_MIN))};
    });
    setModal(null);
  };

  const updateTripStatus=(id,newStatus,extra={})=>{
    setData(d=>{
      const updated=d.trips.map(t=>{if(t.id!==id)return t;return {...t,status:newStatus,...extra};});
      return {...d,trips:'emptyTare' in extra?applyDeviationScan(updated):updated};
    });
  };

  const reviewFlag=(id,disposition,notes)=>{
    setData(d=>({...d,trips:d.trips.map(t=>{
      if(t.id!==id)return t;
      return {...t,reviewStatus:disposition,reviewerNotes:notes};
    })}));
  };


  // ─── Filtered trips ───
  const filtered=useMemo(()=>{
    let t=trips;
    if(tripFilter!=='All')t=t.filter(tr=>tr.status===tripFilter);
    if(search){const s=search.toLowerCase();t=t.filter(tr=>tr.vehicle.toLowerCase().includes(s)||tr.id.toLowerCase().includes(s)||tr.destName.toLowerCase().includes(s)||tr.transporter.toLowerCase().includes(s));}
    return [...t].sort((a,b)=>Number(b.id)-Number(a.id));
  },[trips,tripFilter,search]);

  // ─── Inventory summation ───
  const inventorySummary=useMemo(()=>{
    const map={};
    trips.filter(t=>t.netReceived&&(t.status==='Delivered (Plant)'||t.status==='Delivered (Site)')).forEach(t=>{
      const k=t.destName+'||'+t.material;
      if(!map[k])map[k]={dest:t.destName,material:t.material,qty:0,trips:0};
      map[k].qty+=t.netReceived;map[k].trips++;
    });
    return Object.values(map).sort((a,b)=>b.qty-a.qty);
  },[trips]);

  // ─── Export CSV ───
  const exportCSV=()=>{
    const hdr=['Trip ID','Vehicle','Driver','Transporter','Material','Source','Destination','Status','Loaded Gross (MT)','Empty Tare (MT)','Net Received (MT)','Flags','Gross Time','Tare Time'];
    const rows=filtered.map(t=>[t.id,t.vehicle,t.driver,t.transporter,t.material,t.sourceName,t.destName,t.status,t.loadedGross||'',t.emptyTare||'',t.netReceived||'',t.flags.join(';'),t.tripTime,t.emptyTareTime||'']);
    const csv=[hdr,...rows].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='trips_export.csv';a.click();
  };

  // ─── Nav ───
  const navItems=[
    {key:'dashboard',label:'Dashboard',icon:Icons.home},
    {key:'trips',label:'Trips',icon:Icons.truck},
    {key:'duplicates',label:'Flagged / Dupes',icon:Icons.alert,badge:flaggedCount},
    {key:'inventory',label:'Inventory',icon:Icons.box},
    {key:'reports',label:'Reports',icon:Icons.bar},
  ];

  if(loading)return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0F1117',color:'#9498AE',fontFamily:'DM Sans,sans-serif',fontSize:15}}>Loading trips…</div>;

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
          {page==='dashboard'&&<DashboardPage trips={trips} flagged={flaggedCount} setPage={setPage}/>}
          {page==='trips'&&<TripsPage trips={filtered} filter={tripFilter} setFilter={setTripFilter} onStatusChange={updateTripStatus} onExport={exportCSV} setModal={setModal}/>}
          {page==='duplicates'&&<DuplicatesPage trips={trips} onReview={reviewFlag}/>}
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

function DashboardPage({trips,flagged,setPage}){
  const totalNet=trips.reduce((s,t)=>s+(t.netReceived||0),0);
  const todayTrips=trips.filter(t=>{const d=new Date(t.tripTime);const n=new Date();return d.toDateString()===n.toDateString()}).length;
  const delivered=trips.filter(t=>['Delivered (Plant)','Delivered (Site)'].includes(t.status)).length;
  const atPlant=trips.filter(t=>t.status==='Arrived').length;

  const byMaterial={};trips.filter(t=>t.netReceived).forEach(t=>{byMaterial[t.material]=(byMaterial[t.material]||0)+t.netReceived});
  const byDest={};trips.filter(t=>t.netReceived).forEach(t=>{byDest[t.destName]=(byDest[t.destName]||0)+t.netReceived});

  return(<>
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">Total Received</div><div className="stat-value" style={{color:'var(--green)'}}>{totalNet.toFixed(1)}<span style={{fontSize:14,color:'var(--text2)'}}> MT</span></div></div>
      <div className="stat-card"><div className="stat-label">Total Trips</div><div className="stat-value">{trips.length}</div><div className="stat-sub">{todayTrips} today</div></div>
      <div className="stat-card"><div className="stat-label">Delivered</div><div className="stat-value" style={{color:'var(--blue)'}}>{delivered}</div></div>
      <div className="stat-card"><div className="stat-label">At Plant</div><div className="stat-value" style={{color:'var(--blue)'}}>{atPlant}</div></div>
      <div className="stat-card" style={{cursor:'pointer'}} onClick={()=>setPage('duplicates')}><div className="stat-label">Flagged Dupes</div><div className="stat-value" style={{color:flagged?'var(--red)':'var(--text)'}}>{flagged}</div></div>
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
          <tr key={t.id}><td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{t.id}</td><td>{t.vehicle}</td><td>{t.material}</td><td>{t.destName}</td><td><StatusBadge status={t.status}/></td><td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{fmtN(t.netReceived)}</td></tr>
        ))}</tbody></table>
      </div>
    </div>
  </>);
}

// ─── Trips Page ──────────────────────────────────────────────────────────────

const STATUS_DESC={
  'All':'Showing all trips regardless of status.',
  'Arrived':'Trip has been logged. Loaded gross weighment recorded, awaiting delivery.',
  'Delivered (Plant)':'Truck has delivered at the batching plant. Empty tare recorded, net weight calculated.',
  'Delivered (Site, Empty Pending)':'Material unloaded at site. Empty tare weighment not yet captured.',
  'Delivered (Site)':'Site delivery complete. Empty tare recorded and net weight calculated.',
};

function TripsPage({trips,filter,setFilter,onStatusChange,onExport}){
  const [detail,setDetail]=useState(null);
  const [deliverTrip,setDeliverTrip]=useState(null);
  const [siteUnloadTrip,setSiteUnloadTrip]=useState(null);
  const [siteDeliverTrip,setSiteDeliverTrip]=useState(null);

  return(<>
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        {['All',...STATUSES].map(s=>(
          <button key={s} className={`btn btn-sm${filter===s?' btn-accent':''}`} onClick={()=>setFilter(s)}>{s}</button>
        ))}
        <div style={{marginLeft:'auto'}}><button className="btn btn-sm" onClick={onExport}><Icon d={Icons.download} size={14}/>Export CSV</button></div>
      </div>
      {filter&&<p style={{margin:'8px 0 0',fontSize:12,color:'var(--text2)'}}>{STATUS_DESC[filter]}</p>}
    </div>
    <div className="table-wrap">
      <div className="table-scroll">
        <table><thead><tr><th>Trip ID</th><th>Vehicle</th><th>Transporter</th><th>Material</th><th>Route</th><th>Status</th><th>Flags</th><th>Gross</th><th>Tare</th><th>Net</th><th>Gross Time</th><th>Tare Time</th><th></th></tr></thead>
        <tbody>{trips.map(t=>(
          <tr key={t.id}>
            <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{t.id}</td>
            <td style={{fontWeight:600}}>{t.vehicle}</td>
            <td>{t.transporter}</td>
            <td>{t.material}</td>
            <td style={{fontSize:11.5}}>{t.sourceName} → {t.destName} <span className={`badge ${t.destType==='Plant'?'badge-blue':'badge-purple'}`} style={{fontSize:9,padding:'1px 5px',marginLeft:3}}>{t.destType}</span></td>
            <td><StatusBadge status={t.status}/></td>
            <td>
              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                {(t.flags.includes('FLAG_DUP_LOADED')||t.reviewStatus)&&<span className="flag-tag">DUP_LOADED</span>}
                {t.flags.filter(f=>f!=='FLAG_DUP_LOADED').map(f=><span key={f} className="flag-tag">{f.replace('FLAG_','')}</span>)}
                {t.reviewStatus==='Valid'&&<span className="badge badge-green" style={{fontSize:10}}>Valid</span>}
                {t.reviewStatus==='Invalid'&&<span className="badge badge-red" style={{fontSize:10}}>Invalid</span>}
                {t.reviewStatus==='Pending'&&<span className="badge badge-yellow" style={{fontSize:10}}>Pending</span>}
              </div>
            </td>
            <td style={{fontFamily:'JetBrains Mono',fontSize:12}}>{t.loadedGross?t.loadedGross.toFixed(2):'—'}</td>
            <td style={{fontFamily:'JetBrains Mono',fontSize:12}}>{t.emptyTare?t.emptyTare.toFixed(2):'—'}</td>
            <td style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>{t.netReceived?t.netReceived.toFixed(2):'—'}</td>
            <td style={{fontSize:11,color:'var(--text2)'}}>{fmt(t.tripTime)}</td>
            <td style={{fontSize:11,color:'var(--text2)'}}>{fmt(t.emptyTareTime)}</td>
            <td>
              <div style={{display:'flex',gap:4}}>
                <button className="btn btn-icon btn-sm" title="View" onClick={()=>setDetail(t)}><Icon d={Icons.eye} size={14}/></button>
                {t.status==='Arrived'&&t.destType==='Plant'&&<button className="btn btn-icon btn-sm" style={{background:'var(--green-bg)',color:'var(--green)',border:'1px solid var(--green)'}} title="Record Empty Tare & Deliver" onClick={()=>setDeliverTrip(t)}><Icon d={Icons.check} size={14} color="var(--green)"/></button>}
                {t.status==='Arrived'&&t.destType==='Site'&&<button className="btn btn-icon btn-sm" style={{background:'var(--purple-bg)',color:'var(--purple)',border:'1px solid var(--purple)'}} title="Mark Site Unloaded" onClick={()=>setSiteUnloadTrip(t)}><Icon d={Icons.camera} size={14} color="var(--purple)"/></button>}
                {t.status==='Delivered (Site, Empty Pending)'&&<button className="btn btn-icon btn-sm" style={{background:'var(--yellow-bg,#2a2200)',color:'var(--yellow)',border:'1px solid var(--yellow)'}} title="Record Empty Tare & Mark Site Delivered" onClick={()=>setSiteDeliverTrip(t)}><Icon d={Icons.weight} size={14} color="var(--yellow)"/></button>}
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
          <div className="modal-head"><h2>Trip {detail.id}</h2><button className="btn btn-icon btn-sm" onClick={()=>setDetail(null)}><Icon d={Icons.x} size={16}/></button></div>
          <div className="modal-body">
            <div className="form-grid">
              {[['Vehicle',detail.vehicle],['Driver',detail.driver],['Transporter',detail.transporter],['Material',detail.material],['Source',detail.sourceName],['Destination',detail.destName],['Status',detail.status],['LR No',detail.lrNo],['Weighbridge',detail.wbId],['Loaded Gross',fmtN(detail.loadedGross)],['Empty Tare',fmtN(detail.emptyTare)],['Net Received',fmtN(detail.netReceived)],['Trip Time',fmt(detail.tripTime)]].map(([l,v])=>(
                <div className="form-group" key={l}><div className="form-label">{l}</div><div style={{fontSize:13.5,fontWeight:500}}>{v||'—'}</div></div>
              ))}
              <div className="form-group full"><div className="form-label">Flags</div><div>{detail.flags.length?detail.flags.map(f=><span key={f} className="flag-tag">{f}</span>):'None'}</div></div>
              {detail.weighmentSlipUri&&<div className="form-group full"><div className="form-label">Weighment Slip (Loaded)</div><a href={detail.weighmentSlipUri} download={detail.weighmentSlipName} style={{color:'var(--accent)',fontSize:13}}>📎 {detail.weighmentSlipName}</a></div>}
              {detail.emptyWeighmentSlipUri&&<div className="form-group full"><div className="form-label">Weighment Slip (Empty)</div><a href={detail.emptyWeighmentSlipUri} download={detail.emptyWeighmentSlipName} style={{color:'var(--accent)',fontSize:13}}>📎 {detail.emptyWeighmentSlipName}</a></div>}
              {detail.siteUnloadPhotoUri&&<div className="form-group full"><div className="form-label">Site Unloading Photo</div>{detail.siteUnloadPhotoUri.startsWith('data:')?<img src={detail.siteUnloadPhotoUri} alt="Site unloading" style={{maxWidth:'100%',maxHeight:200,borderRadius:6,border:'1px solid var(--border)',marginTop:4}}/>:<span style={{fontSize:13,color:'var(--text2)'}}>📷 {detail.siteUnloadPhotoUri}</span>}</div>}
            </div>
          </div>
        </div>
      </div>
    )}

    {deliverTrip&&(
      <PlantDeliveryModal
        trip={deliverTrip}
        onSave={(emptyTare,slipUri,slipName)=>{
          const net=+(deliverTrip.loadedGross-emptyTare).toFixed(2);
          onStatusChange(deliverTrip.id,'Delivered (Plant)',{
            emptyTare,emptyTareTime:new Date().toISOString(),netReceived:net,
            emptyWeighmentSlipUri:slipUri,emptyWeighmentSlipName:slipName
          });
          setDeliverTrip(null);
        }}
        onClose={()=>setDeliverTrip(null)}
      />
    )}

    {siteUnloadTrip&&(
      <SiteUnloadModal
        trip={siteUnloadTrip}
        onSave={(photoUri)=>{
          onStatusChange(siteUnloadTrip.id,'Delivered (Site, Empty Pending)',{siteUnloadPhotoUri:photoUri});
          setSiteUnloadTrip(null);
        }}
        onClose={()=>setSiteUnloadTrip(null)}
      />
    )}

    {siteDeliverTrip&&(
      <SiteDeliveryModal
        trip={siteDeliverTrip}
        onSave={(emptyTare,slipUri,slipName)=>{
          const net=+(siteDeliverTrip.loadedGross-emptyTare).toFixed(2);
          onStatusChange(siteDeliverTrip.id,'Delivered (Site)',{
            emptyTare,emptyTareTime:new Date().toISOString(),netReceived:net,
            emptyWeighmentSlipUri:slipUri,emptyWeighmentSlipName:slipName
          });
          setSiteDeliverTrip(null);
        }}
        onClose={()=>setSiteDeliverTrip(null)}
      />
    )}
  </>);
}


// ─── Duplicates Page ─────────────────────────────────────────────────────────

function DupCard({t,notes,setNotes,onReview}){
  const [confirming,setConfirming]=useState(null); // 'Valid' | 'Invalid' | null

  const handleConfirm=()=>{
    onReview(t.id,confirming,notes[t.id]||'');
    setNotes(n=>({...n,[t.id]:''}));
    setConfirming(null);
  };

  return(
    <div className="recon-card" style={{flexDirection:'column',alignItems:'stretch'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <span style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>{t.id}</span>
          <span style={{margin:'0 8px',color:'var(--text3)'}}>|</span>
          <span style={{fontWeight:600}}>{t.vehicle}</span>
          <span style={{margin:'0 8px',color:'var(--text3)'}}>|</span>
          <span>{t.destName}</span>
          <span style={{margin:'0 8px',color:'var(--text3)'}}>|</span>
          <span style={{fontSize:11,color:'var(--text2)'}}>{fmt(t.tripTime)}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {(t.flags.length?t.flags:['FLAG_DUP_LOADED']).map(f=><span key={f} className="flag-tag">{f.replace('FLAG_','')}</span>)}
          {t.reviewStatus==='Pending'&&<span className="badge badge-yellow">Pending Review</span>}
          {t.reviewStatus==='Valid'&&<span className="badge badge-green">Cleared</span>}
          {t.reviewStatus==='Invalid'&&<span className="badge badge-red">Rejected</span>}
        </div>
      </div>
      {t.reviewStatus==='Pending'&&(
        confirming
          ?<div style={{display:'flex',gap:8,marginTop:10,alignItems:'center',background:'var(--bg2)',borderRadius:6,padding:'8px 12px'}}>
            <span style={{fontSize:13,flex:1}}>Mark as <strong>{confirming}</strong>?</span>
            <button className="btn btn-sm" style={{background:confirming==='Valid'?'var(--green-bg)':'var(--red-bg)',color:confirming==='Valid'?'var(--green)':'var(--red)',borderColor:confirming==='Valid'?'var(--green)':'var(--red)'}} onClick={handleConfirm}>Confirm</button>
            <button className="btn btn-sm" onClick={()=>setConfirming(null)}>Cancel</button>
          </div>
          :<div style={{display:'flex',gap:8,marginTop:10,alignItems:'center'}}>
            <input className="form-input" placeholder="Reviewer notes…" style={{flex:1,fontSize:12}} value={notes[t.id]||''} onChange={e=>setNotes(n=>({...n,[t.id]:e.target.value}))}/>
            <button className="btn btn-sm" style={{background:'var(--green-bg)',color:'var(--green)',borderColor:'var(--green)'}} onClick={()=>setConfirming('Valid')}>✓ Valid</button>
            <button className="btn btn-sm" style={{background:'var(--red-bg)',color:'var(--red)',borderColor:'var(--red)'}} onClick={()=>setConfirming('Invalid')}>✗ Invalid</button>
          </div>
      )}
      {t.reviewerNotes&&<div style={{marginTop:8,fontSize:12,color:'var(--text2)'}}>Notes: {t.reviewerNotes}</div>}
    </div>
  );
}

function DuplicatesPage({trips,onReview}){
  const flagged=trips.filter(t=>t.flags.some(f=>['FLAG_DUP_LOADED','FLAG_GROSS_DEV','FLAG_TARE_DEV'].includes(f))||t.reviewStatus);
  const pending=flagged.filter(t=>t.reviewStatus==='Pending');
  const [tab,setTab]=useState('pending');
  const [notes,setNotes]=useState({});

  return(<>
    <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
      <button onClick={()=>setTab('pending')} style={{padding:'8px 16px',fontSize:13,fontWeight:600,border:'none',borderBottom:tab==='pending'?'2px solid var(--accent)':'2px solid transparent',background:'none',color:tab==='pending'?'var(--accent)':'var(--text2)',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
        Pending Review <span className="badge badge-yellow">{pending.length}</span>
      </button>
      <button onClick={()=>setTab('all')} style={{padding:'8px 16px',fontSize:13,fontWeight:600,border:'none',borderBottom:tab==='all'?'2px solid var(--accent)':'2px solid transparent',background:'none',color:tab==='all'?'var(--accent)':'var(--text2)',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
        Dupes Identified <span className="badge badge-red">{flagged.length}</span>
      </button>
    </div>

    {tab==='pending'&&(
      pending.length===0
        ?<div style={{padding:'40px 0',textAlign:'center',color:'var(--text3)',fontSize:13}}>No trips awaiting review.</div>
        :pending.map(t=><DupCard key={t.id} t={t} notes={notes} setNotes={setNotes} onReview={onReview}/>)
    )}
    {tab==='all'&&(
      flagged.length===0
        ?<div style={{padding:'40px 0',textAlign:'center',color:'var(--text3)',fontSize:13}}>No duplicate trips detected.</div>
        :flagged.map(t=><DupCard key={t.id} t={t} notes={notes} setNotes={setNotes} onReview={onReview}/>)
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
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');

  const filtered=trips.filter(t=>{
    const d=new Date(t.tripTime);
    if(dateFrom&&d<new Date(dateFrom))return false;
    if(dateTo&&d>new Date(dateTo+'T23:59:59'))return false;
    return true;
  });

  // Transporter summary
  const byTransporter={};
  filtered.forEach(t=>{
    if(!byTransporter[t.transporter])byTransporter[t.transporter]={trips:0,totalNet:0};
    byTransporter[t.transporter].trips++;
    byTransporter[t.transporter].totalNet+=(t.netReceived||0);
  });

  // Vehicle utilization
  const byVehicle={};
  filtered.forEach(t=>{
    if(!byVehicle[t.vehicle])byVehicle[t.vehicle]={trips:0,totalNet:0};
    byVehicle[t.vehicle].trips++;
    byVehicle[t.vehicle].totalNet+=(t.netReceived||0);
  });

  return(<>
    {/* Date filter */}
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px'}}>
      <span style={{fontSize:12,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.4px'}}>Date Range</span>
      <input type="date" className="form-input" style={{width:160,fontSize:12}} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
      <span style={{color:'var(--text3)',fontSize:13}}>to</span>
      <input type="date" className="form-input" style={{width:160,fontSize:12}} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
      {(dateFrom||dateTo)&&<button className="btn btn-sm" onClick={()=>{setDateFrom('');setDateTo('');}}>Clear</button>}
      <span style={{marginLeft:'auto',fontSize:12,color:'var(--text2)'}}>{filtered.length} trip{filtered.length!==1?'s':''} in range</span>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="table-wrap">
        <div className="table-header"><h3>Trips by Transporter</h3></div>
        <div className="table-scroll">
          <table><thead><tr><th>Transporter</th><th style={{textAlign:'right'}}>Trips</th><th style={{textAlign:'right'}}>Total Qty (MT)</th><th style={{textAlign:'right'}}>Avg/Trip (MT)</th></tr></thead>
          <tbody>{Object.entries(byTransporter).sort((a,b)=>b[1].trips-a[1].trips).map(([name,d])=>(
            <tr key={name}>
              <td style={{fontWeight:500}}>{name}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono'}}>{d.trips}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono',fontWeight:600}}>{d.totalNet.toFixed(2)}</td>
              <td style={{textAlign:'right',fontFamily:'JetBrains Mono',color:'var(--text2)'}}>{d.trips?(d.totalNet/d.trips).toFixed(2):'—'}</td>
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
          filtered.filter(t=>t.netReceived).forEach(t=>{
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
    source:QUARRIES[0].id,sourceName:QUARRIES[0].name,destId:PLANTS[0].id,destName:PLANTS[0].name,destType:'Plant',
    lrNo:'LR'+Math.floor(1000+Math.random()*9000),wbId:WB_IDS[0],tripTime:new Date().toISOString(),
    loadedGross:'',weighmentSlipUri:null,weighmentSlipName:null});
  const allDest=[...PLANTS.map(p=>({...p,type:'Plant'})),...SITES.map(s=>({...s,type:'Site'}))];

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const handleSlip=(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ set('weighmentSlipUri',ev.target.result); set('weighmentSlipName',file.name); };
    reader.readAsDataURL(file);
  };

  const canSave=form.loadedGross&&+form.loadedGross>0;

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h2>Record Arrival</h2><button className="btn btn-icon btn-sm" onClick={onClose}><Icon d={Icons.x} size={16}/></button></div>
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
            <div className="form-group"><label className="form-label">Loaded Gross Weight (MT) *</label><input className="form-input" type="number" step="0.01" min="0" placeholder="e.g. 24.50" value={form.loadedGross} onChange={e=>set('loadedGross',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Weighment Slip</label>
              <label style={{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 12px',cursor:'pointer'}}>
                <Icon d={Icons.upload} size={14} color="var(--text2)"/>
                <span style={{fontSize:13,color:form.weighmentSlipName?'var(--accent)':'var(--text3)'}}>{form.weighmentSlipName||'Choose file…'}</span>
                <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={handleSlip}/>
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" disabled={!canSave} style={{opacity:canSave?1:0.5,cursor:canSave?'pointer':'not-allowed'}} onClick={()=>canSave&&onSave({...form,loadedGross:+form.loadedGross})}>Record Arrival</button>
        </div>
      </div>
    </div>
  );
}

// ─── Plant Delivery Modal ─────────────────────────────────────────────────────

function PlantDeliveryModal({trip,onSave,onClose}){
  const [emptyTare,setEmptyTare]=useState('');
  const [slipUri,setSlipUri]=useState(null);
  const [slipName,setSlipName]=useState(null);

  const handleSlip=(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ setSlipUri(ev.target.result); setSlipName(file.name); };
    reader.readAsDataURL(file);
  };

  const net=emptyTare&&+emptyTare>0?+(trip.loadedGross - +emptyTare).toFixed(2):null;
  const canSave=emptyTare&&+emptyTare>0&&net>0;

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{width:460}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Empty Tare</h2>
          <button className="btn btn-icon btn-sm" onClick={onClose}><Icon d={Icons.x} size={16}/></button>
        </div>
        <div className="modal-body">
          {/* Trip summary */}
          <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',marginBottom:18,fontSize:12.5}}>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>VEHICLE</div><b>{trip.vehicle}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>MATERIAL</div><b>{trip.material}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>LOADED GROSS</div><b style={{color:'var(--blue)'}}>{fmtN(trip.loadedGross)}</b></div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Empty Tare Weight (MT) *</label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="e.g. 10.20"
                value={emptyTare} onChange={e=>setEmptyTare(e.target.value)}/>
            </div>

            {/* Live net preview */}
            {net!==null&&(
              <div className="form-group full">
                <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',display:'flex',gap:24}}>
                  <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>NET RECEIVED</div>
                    <span style={{fontFamily:'JetBrains Mono',fontWeight:700,fontSize:18,color:net>0?'var(--green)':'var(--red)'}}>{net.toFixed(2)} MT</span>
                  </div>
                  <div style={{marginLeft:'auto',textAlign:'right'}}>
                    <div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>CALCULATION</div>
                    <span style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--text2)'}}>{trip.loadedGross} − {(+emptyTare).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group full">
              <label className="form-label">Empty Weighment Slip</label>
              <label style={{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 12px',cursor:'pointer'}}>
                <Icon d={Icons.upload} size={14} color="var(--text2)"/>
                <span style={{fontSize:13,color:slipName?'var(--accent)':'var(--text3)'}}>{slipName||'Choose file…'}</span>
                <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={handleSlip}/>
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" disabled={!canSave}
            style={{opacity:canSave?1:0.5,cursor:canSave?'pointer':'not-allowed'}}
            onClick={()=>canSave&&onSave(+emptyTare,slipUri,slipName)}>
            Confirm Delivery
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Site Unload Modal ────────────────────────────────────────────────────────

function SiteUnloadModal({trip,onSave,onClose}){
  const [photoUri,setPhotoUri]=useState(null);
  const [photoName,setPhotoName]=useState(null);

  const handlePhoto=(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ setPhotoUri(ev.target.result); setPhotoName(file.name); };
    reader.readAsDataURL(file);
  };

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{width:460}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h2>Mark Site Unloaded</h2>
          <button className="btn btn-icon btn-sm" onClick={onClose}><Icon d={Icons.x} size={16}/></button>
        </div>
        <div className="modal-body">
          <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',marginBottom:18,fontSize:12.5}}>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>VEHICLE</div><b>{trip.vehicle}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>MATERIAL</div><b>{trip.material}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>DESTINATION</div><b>{trip.destName}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>LOADED GROSS</div><b style={{color:'var(--blue)'}}>{fmtN(trip.loadedGross)}</b></div>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Unloading Photo at Site</label>
              <label style={{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 12px',cursor:'pointer'}}>
                <Icon d={Icons.camera} size={14} color="var(--text2)"/>
                <span style={{fontSize:13,color:photoName?'var(--accent)':'var(--text3)'}}>{photoName||'Choose photo…'}</span>
                <input type="file" accept="image/*" style={{display:'none'}} onChange={handlePhoto}/>
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={()=>onSave(photoUri)}>
            Confirm Site Unload
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Site Delivery Modal ──────────────────────────────────────────────────────

function SiteDeliveryModal({trip,onSave,onClose}){
  const [emptyTare,setEmptyTare]=useState('');
  const [slipUri,setSlipUri]=useState(null);
  const [slipName,setSlipName]=useState(null);

  const handleSlip=(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ setSlipUri(ev.target.result); setSlipName(file.name); };
    reader.readAsDataURL(file);
  };

  const net=emptyTare&&+emptyTare>0?+(trip.loadedGross - +emptyTare).toFixed(2):null;
  const canSave=emptyTare&&+emptyTare>0&&net>0;

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{width:460}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Empty Tare — Site</h2>
          <button className="btn btn-icon btn-sm" onClick={onClose}><Icon d={Icons.x} size={16}/></button>
        </div>
        <div className="modal-body">
          <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',marginBottom:18,fontSize:12.5}}>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>VEHICLE</div><b>{trip.vehicle}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>MATERIAL</div><b>{trip.material}</b></div>
              <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>LOADED GROSS</div><b style={{color:'var(--blue)'}}>{fmtN(trip.loadedGross)}</b></div>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Empty Tare Weight (MT) *</label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="e.g. 10.20"
                value={emptyTare} onChange={e=>setEmptyTare(e.target.value)}/>
            </div>

            {net!==null&&(
              <div className="form-group full">
                <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',display:'flex',gap:24}}>
                  <div><div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>NET RECEIVED</div>
                    <span style={{fontFamily:'JetBrains Mono',fontWeight:700,fontSize:18,color:net>0?'var(--green)':'var(--red)'}}>{net.toFixed(2)} MT</span>
                  </div>
                  <div style={{marginLeft:'auto',textAlign:'right'}}>
                    <div style={{color:'var(--text3)',fontSize:11,marginBottom:2}}>CALCULATION</div>
                    <span style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--text2)'}}>{trip.loadedGross} − {(+emptyTare).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group full">
              <label className="form-label">Empty Weighment Slip</label>
              <label style={{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 12px',cursor:'pointer'}}>
                <Icon d={Icons.upload} size={14} color="var(--text2)"/>
                <span style={{fontSize:13,color:slipName?'var(--accent)':'var(--text3)'}}>{slipName||'Choose file…'}</span>
                <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={handleSlip}/>
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" disabled={!canSave}
            style={{opacity:canSave?1:0.5,cursor:canSave?'pointer':'not-allowed'}}
            onClick={()=>canSave&&onSave(+emptyTare,slipUri,slipName)}>
            Confirm Site Delivery
          </button>
        </div>
      </div>
    </div>
  );
}
