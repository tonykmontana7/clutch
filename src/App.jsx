import { useState, useEffect, useRef } from "react";

const API_KEY = import.meta.env.VITE_API_KEY;
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const IS_LIVE = typeof window !== "undefined" && window.location.hostname !== "localhost" && !window.location.hostname.includes("claude.ai");

const C = {
  bg:"#0A0A0F", card:"#13131A", border:"#1E1E2E",
  accent:"#F5A623", accentDim:"#7A5215",
  green:"#22C55E", red:"#EF4444", blue:"#3B82F6", purple:"#8B5CF6",
  text:"#F0EEE8", muted:"#6B7280",
  font:"'Barlow Condensed',sans-serif", body:"'DM Sans',sans-serif"
};

const sc = s => s>=7 ? C.green : s>=5 ? C.accent : C.red;
const sl = s => s>=8 ? "GREAT DEAL" : s>=6 ? "FAIR DEAL" : s>=4 ? "PROCEED WITH CAUTION" : "WALK AWAY";

const VT = [
  {id:"car", e:"🚗", l:"Car / Truck / SUV", es:"Auto / Camioneta / SUV"},
  {id:"motorcycle", e:"🏍️", l:"Motorcycle", es:"Motocicleta"},
  {id:"dirtbike", e:"🏁", l:"Dirt Bike", es:"Moto de Tierra"},
  {id:"atv", e:"🛻", l:"ATV / UTV", es:"ATV / UTV"},
  {id:"scooter", e:"🛵", l:"Scooter / Moped", es:"Scooter"},
];

const RVT = [
  {id:"economy", e:"🚗", l:"Economy", es:"Económico"},
  {id:"sedan", e:"🚙", l:"Sedan", es:"Sedán"},
  {id:"suv", e:"🛻", l:"SUV", es:"SUV"},
  {id:"minivan", e:"🚐", l:"Minivan", es:"Minivan"},
  {id:"truck", e:"🚚", l:"Truck", es:"Camioneta"},
  {id:"luxury", e:"✨", l:"Luxury", es:"Lujo"},
];

async function getCoords(zip) {
  const r = await fetch("https://api.zippopotam.us/us/" + zip);
  if (!r.ok) throw new Error("bad zip");
  const d = await r.json();
  return { lat: +d.places[0].latitude, lng: +d.places[0].longitude, city: d.places[0]["place name"], state: d.places[0]["state abbreviation"] };
}

async function getClimate(lat, lng) {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lng + "&daily=temperature_2m_min,snowfall_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&forecast_days=1&past_days=92";
    const r = await fetch(url);
    if (!r.ok) throw new Error("weather failed");
    const d = await r.json();
    const snow = d.daily?.snowfall_sum || [];
    const temps = d.daily?.temperature_2m_min || [];
    const snowDays = snow.filter(s => s > 0.1).length;
    const totalSnow = Math.round(snow.reduce((a, b) => a + (b || 0), 0));
    const freezingDays = temps.filter(t => t <= 32).length;
    let sev = 1;
    if (totalSnow > 2) sev = 3;
    if (totalSnow > 8) sev = 5;
    if (totalSnow > 15) sev = 7;
    if (totalSnow > 25) sev = 9;
    if (freezingDays > 20) sev = Math.min(10, sev + 1);
    if (freezingDays > 45) sev = Math.min(10, sev + 1);
    return { snowDays, totalSnowInches: totalSnow, freezingDays, severity: Math.round(sev) };
  } catch(e) {
    return null;
  }
}

function sevInfo(s) {
  if (s <= 2) return { label:"MILD WINTERS", color:C.green, emoji:"☀️" };
  if (s <= 4) return { label:"LIGHT WINTERS", color:"#84CC16", emoji:"🌤️" };
  if (s <= 6) return { label:"MODERATE WINTERS", color:C.accent, emoji:"🌨️" };
  if (s <= 8) return { label:"HARSH WINTERS", color:C.red, emoji:"❄️" };
  return { label:"EXTREME WINTERS", color:"#7C3AED", emoji:"🥶" };
}

function climateRecs(sev, vt) {
  const m = ["motorcycle","scooter","dirtbike"].includes(vt);
  if (sev >= 7) return {
    best: ["Subaru Outback/Forester — best AWD in snow", "Toyota RAV4 AWD — reliable winter traction", "Ford F-150 4x4 — great for extreme conditions", "Jeep Wrangler 4WD — built for harsh winters"],
    avoid: [m ? "⚠️ Motorcycles NOT safe Oct–Apr in your area" : "RWD sports cars — dangerous on ice", "Low-clearance sedans without AWD"],
    warn: sev >= 9 ? "⚠️ Extreme winters here. AWD/4WD is essential for safety." : null
  };
  if (sev >= 4) return {
    best: ["AWD crossovers — RAV4, CR-V, Escape", "Subaru Legacy/Outback — great value AWD", "4WD trucks with all-season tires"],
    avoid: [m ? "Motorcycles need 3-4 months winter storage" : "RWD without winter tires"],
    warn: null
  };
  return { best: ["Most vehicles work well in your mild climate", "AWD is a bonus, not required"], avoid: [], warn: null };
}

async function callAI(prompt, maxTok) {
  const endpoint = IS_LIVE ? "/api/chat" : ANTHROPIC_API;
  const headers = IS_LIVE
    ? { "Content-Type":"application/json" }
    : { "Content-Type":"application/json", "x-api-key":API_KEY, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" };
  const r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model:"claude-haiku-4-5", max_tokens: maxTok || 1200, messages:[{role:"user", content:prompt}] })
  });
  if (!r.ok) { const errText = await r.text(); throw new Error("API error " + r.status + ": " + errText); }
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "API error");
  return d.content?.map(b => b.text || "").join("") || "";
}

function useFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap";
    document.head.appendChild(l);
  }, []);
}

function Dots() {
  return (
    <div style={{display:"flex", gap:6}}>
      {[0,1,2].map(i => <span key={i} style={{width:8, height:8, borderRadius:"50%", background:C.accent, display:"inline-block", animation:"bop 1.2s " + (i*0.2) + "s ease-in-out infinite"}}/>)}
      <style>{"@keyframes bop{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-8px)}}"}</style>
    </div>
  );
}

function Gauge({score, animate}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let c = 0;
    const iv = setInterval(() => { c += 0.15; setV(Math.min(c, score)); if (c >= score) clearInterval(iv); }, 20);
    return () => clearInterval(iv);
  }, [score, animate]);
  const val = animate ? v : score;
  return (
    <div style={{textAlign:"center", marginBottom:24}}>
      <div style={{width:120, height:120, borderRadius:"50%", border:"4px solid " + sc(score), display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:sc(score) + "12", margin:"0 auto 8px", boxShadow:"0 0 40px " + sc(score) + "30"}}>
        <span style={{fontFamily:C.font, fontWeight:800, fontSize:36, color:sc(score), lineHeight:1}}>{val.toFixed(1)}</span>
        <span style={{fontSize:11, color:C.text}}>/10</span>
      </div>
      <div style={{fontFamily:C.font, fontWeight:800, fontSize:14, letterSpacing:2, color:sc(score)}}>{sl(score)}</div>
    </div>
  );
}

function Card({children, style}) {
  return <div style={{background:C.card, border:"1px solid " + C.border, borderRadius:12, padding:24, marginBottom:16, ...(style||{})}}>{children}</div>;
}

function SLabel({children, color}) {
  return <div style={{fontFamily:C.font, fontSize:13, letterSpacing:2, color:color||C.accent, fontWeight:700, marginBottom:10}}>{children}</div>;
}

function ClimateCard({climate, location, zip, vt}) {
  if (!climate) return null;
  const {label, color, emoji} = sevInfo(climate.severity);
  const {best, avoid, warn} = climateRecs(climate.severity, vt);
  return (
    <Card style={{borderLeft:"3px solid " + color}}>
      <SLabel color={color}>{emoji} CLIMATE — {location || ("ZIP " + zip)}</SLabel>
      {warn && <div style={{background:color + "15", border:"1px solid " + color + "40", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:13, color, fontWeight:700}}>{warn}</div>}
      <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
        <span style={{fontSize:13, fontWeight:700, color:C.text}}>{label}</span>
        <span style={{fontSize:13, color, fontWeight:700}}>{climate.severity}/10</span>
      </div>
      <div style={{height:6, background:C.border, borderRadius:3, marginBottom:14}}>
        <div style={{height:"100%", width:(climate.severity * 10) + "%", background:"linear-gradient(90deg," + C.green + "," + color + ")", borderRadius:3, transition:"width 1.2s ease"}}/>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14}}>
        {[["❄️ Snow Days", climate.snowDays + "/yr"], ["🌨️ Snowfall", climate.totalSnowInches + " in"], ["🥶 Freezing", climate.freezingDays + "/yr"]].map(([lb, val]) => (
          <div key={lb} style={{background:"#0D0D14", borderRadius:8, padding:"10px 8px", textAlign:"center"}}>
            <div style={{fontSize:10, color:C.text, marginBottom:4}}>{lb}</div>
            <div style={{fontFamily:C.font, fontWeight:700, fontSize:15}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:12, fontWeight:700, color:C.green, marginBottom:8}}>✓ BEST FOR YOUR CLIMATE</div>
      {best.map(v => <div key={v} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:6}}><span style={{color:C.green}}>+</span>{v}</div>)}
      {avoid.length > 0 && <>
        <div style={{fontSize:12, fontWeight:700, color:C.red, marginBottom:8, marginTop:10}}>✗ AVOID</div>
        {avoid.map(v => <div key={v} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:6}}><span style={{color:C.red}}>–</span>{v}</div>)}
      </>}
    </Card>
  );
}

function TradeInCard({ti}) {
  if (!ti) return null;
  return (
    <Card style={{borderLeft:"3px solid " + C.accent}}>
      <SLabel>🔄 YOUR TRADE-IN ESTIMATE</SLabel>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
        {[["Dealer Will Offer", ti.dealerOffer], ["Private Sale", ti.privateSale], ["KBB Range", ti.kbbRange], ["Your Leverage", ti.leverage]].map(([lb, val]) => (
          <div key={lb} style={{background:"#0D0D14", borderRadius:8, padding:"12px 14px"}}>
            <div style={{fontSize:11, color:C.text, marginBottom:4}}>{lb}</div>
            <div style={{fontFamily:C.font, fontWeight:700, fontSize:16, color:C.accent}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{background:C.red + "10", border:"1px solid " + C.red + "30", borderRadius:8, padding:14, marginBottom:10}}>
        <div style={{fontSize:12, fontWeight:700, color:C.red, marginBottom:8}}>⚠️ DEALER TACTICS TO WATCH FOR</div>
        {ti.tactics?.map(t => <div key={t} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:8}}><span style={{color:C.red}}>!</span>{t}</div>)}
      </div>
      <div style={{background:C.green + "10", border:"1px solid " + C.green + "30", borderRadius:8, padding:14}}>
        <div style={{fontSize:12, fontWeight:700, color:C.green, marginBottom:6}}>💡 PRO MOVE</div>
        <div style={{fontSize:13, color:C.text}}>{ti.proMove}</div>
      </div>
    </Card>
  );
}

function InsuranceCard({ins, lang}) {
  if (!ins) return null;
  return (
    <Card style={{borderLeft:"3px solid " + C.blue}}>
      <SLabel color={C.blue}>🛡️ {lang === "es" ? "ESTIMACIÓN DE SEGURO" : "INSURANCE ESTIMATE"}</SLabel>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <div style={{background:"#0D0D14", borderRadius:8, padding:"12px 14px"}}>
          <div style={{fontSize:11, color:C.text, marginBottom:4}}>{lang === "es" ? "Mensual Est." : "Est. Monthly"}</div>
          <div style={{fontFamily:C.font, fontWeight:700, fontSize:20}}>${ins.low}–${ins.high}<span style={{fontSize:11, color:C.text}}>/mo</span></div>
        </div>
        <div style={{background:"#0D0D14", borderRadius:8, padding:"12px 14px"}}>
          <div style={{fontSize:11, color:C.text, marginBottom:4}}>{lang === "es" ? "Anual Est." : "Est. Annual"}</div>
          <div style={{fontFamily:C.font, fontWeight:700, fontSize:20}}>${(ins.low*12).toLocaleString()}–${(ins.high*12).toLocaleString()}</div>
        </div>
      </div>
      <div style={{fontSize:12, color:C.text, fontStyle:"italic"}}>💡 {ins.note}</div>
    </Card>
  );
}

function CheatSheet({results, lang}) {
  if (!results) return null;
  const [copied, setCopied] = useState(false);
  const [dl, setDl] = useState(false);
  const se = results.dealScore >= 8 ? "🔥" : results.dealScore >= 6 ? "👍" : "⚠️";
  const redFlagsText = (results.redFlags || []).map((f, i) => (i+1) + ". " + f).join("\n");
  const txt = [
    "━━━━━━━━━━━━━━━━━━━━━━━",
    lang === "es" ? "📋 MI HOJA CLUTCH" : "📋 MY CLUTCH CHEAT SHEET",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    se + " " + (lang === "es" ? "PUNTAJE" : "DEAL SCORE") + ": " + results.dealScore + "/10",
    results.dealVerdict || "",
    "",
    "🚗 " + (results.answers?.vehicle || ""),
    "💰 $" + (results.priceRange?.low?.toLocaleString() || "") + "–$" + (results.priceRange?.high?.toLocaleString() || ""),
    "🚪 ~$" + (results.outTheDoor?.toLocaleString() || ""),
    "📅 $" + (results.monthlyPayment?.low || "") + "–$" + (results.monthlyPayment?.high || "") + "/mo",
    "",
    "💡 " + (lang === "es" ? "CONSEJO" : "TIP") + ":",
    results.dealerTip || "",
    "",
    "🚩 " + (lang === "es" ? "SEÑALES DE ALERTA" : "RED FLAGS") + ":",
    redFlagsText,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "Clutch",
    "━━━━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  function copy() { navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }); }
  function download() {
    const b = new Blob([txt], {type:"text/plain"});
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = "clutch-" + (results.answers?.vehicle || "deal").replace(/\s+/g, "-") + ".txt";
    a.click();
    URL.revokeObjectURL(u);
    setDl(true);
    setTimeout(() => setDl(false), 2500);
  }

  return (
    <Card style={{borderLeft:"3px solid " + C.green}}>
      <SLabel color={C.green}>📋 {lang === "es" ? "HOJA DE NEGOCIACIÓN" : "DEALER CHEAT SHEET"}</SLabel>
      <p style={{fontSize:13, color:C.text, marginBottom:14}}>{lang === "es" ? "Descarga y lleva al dealer. Tus números clave y señales de alerta." : "Download and walk in with it. Key numbers, red flags, and negotiation tip."}</p>
      <div style={{background:"#0D0D14", borderRadius:8, padding:14, marginBottom:14, fontFamily:"monospace", fontSize:13, lineHeight:1.8}}>
        <div style={{fontFamily:C.font, fontWeight:800, fontSize:20, color:sc(results.dealScore)}}>{se} {lang === "es" ? "PUNTAJE" : "SCORE"}: {results.dealScore}/10</div>
        <div style={{fontSize:12, color:C.text, marginBottom:10}}>{results.dealVerdict}</div>
        <div>🚗 {results.answers?.vehicle}</div>
        <div>💰 ${results.priceRange?.low?.toLocaleString()}–${results.priceRange?.high?.toLocaleString()}</div>
        <div>🚪 ~${results.outTheDoor?.toLocaleString()}</div>
        <div>📅 ${results.monthlyPayment?.low}–${results.monthlyPayment?.high}/mo</div>
        <div style={{marginTop:8, paddingTop:8, borderTop:"1px solid " + C.border, fontSize:12, color:C.text}}>{results.dealerTip}</div>
        <div style={{marginTop:8, paddingTop:8, borderTop:"1px solid " + C.border}}>
          {(results.redFlags || []).map((f, i) => <div key={i} style={{fontSize:12, color:C.text}}>🚩 {f}</div>)}
        </div>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <button onClick={copy} style={{background:copied?C.green:"transparent", color:copied?"#0A0A0F":C.green, border:"1.5px solid " + C.green, borderRadius:8, padding:"11px 0", fontFamily:C.font, fontWeight:800, fontSize:14, letterSpacing:1, cursor:"pointer"}}>{copied ? "✅ COPIED!" : (lang === "es" ? "📋 COPIAR" : "📋 COPY")}</button>
        <button onClick={download} style={{background:dl?C.green:C.green+"18", color:dl?"#0A0A0F":C.green, border:"1.5px solid " + C.green, borderRadius:8, padding:"11px 0", fontFamily:C.font, fontWeight:800, fontSize:14, letterSpacing:1, cursor:"pointer"}}>{dl ? "✅ SAVED!" : (lang === "es" ? "⬇️ DESCARGAR" : "⬇️ DOWNLOAD")}</button>
      </div>
    </Card>
  );
}

function ShareBtn({results, lang}) {
  if (!results) return null;
  const [shared, setShared] = useState(false);
  const se = results.dealScore >= 8 ? "🔥" : results.dealScore >= 6 ? "👍" : "⚠️";
  const txt = lang === "es"
    ? se + " Obtuve " + results.dealScore + "/10 en mi " + results.answers?.vehicle + " con Clutch!"
    : se + " I got a " + results.dealScore + "/10 Deal Score on my " + results.answers?.vehicle + " with Clutch!";
  function share() {
    if (navigator.share) { navigator.share({title:"Clutch", text:txt, url:window.location.href}); }
    else { navigator.clipboard?.writeText(txt).then(() => { setShared(true); setTimeout(() => setShared(false), 2500); }); }
  }
  return (
    <button onClick={share} style={{width:"100%", background:"transparent", color:C.purple, border:"1.5px solid " + C.purple, borderRadius:8, padding:"13px 0", fontFamily:C.font, fontWeight:800, fontSize:15, letterSpacing:1, cursor:"pointer", marginBottom:10}}>
      {shared ? (lang === "es" ? "✅ COPIADO!" : "✅ COPIED!") : (lang === "es" ? "📤 COMPARTIR MI PUNTAJE" : "📤 SHARE MY DEAL SCORE")}
    </button>
  );
}

function BestTimeToBuy({lang}) {
  const now = new Date();
  const day = now.getDate();
  const mo = now.getMonth();
  let alert = null;
  if (day >= 28) alert = {e:"⚡", c:C.green, msg: lang === "es" ? "Fin de mes — dealers necesitan cumplir metas. Máximo poder de negociación HOY." : "End of month — dealers need to hit quotas. Maximum negotiating power RIGHT NOW."};
  else if ([2,5,8,11].includes(mo) && day >= 25) alert = {e:"🔥", c:C.accent, msg: lang === "es" ? "Fin de trimestre — dealers muy motivados para cerrar tratos." : "End of quarter — dealers highly motivated to close deals."};
  else if (mo === 8 && day >= 1) alert = {e:"🚨", c:C.green, msg: lang === "es" ? "Septiembre — nuevos modelos llegan. Grandes descuentos en los del año anterior." : "September — new models arriving. Dealers discount prior year models aggressively."};
  else if (mo === 11 && day >= 20) alert = {e:"🎄", c:C.green, msg: lang === "es" ? "Fin de año — último chance para metas anuales. Grandes descuentos posibles." : "Year-end — last chance to hit annual targets. Big discounts possible."};
  else if (now.getDay() === 1) alert = {e:"📅", c:C.muted, msg: lang === "es" ? "Los lunes hay menos clientes — más tiempo para negociar contigo." : "Mondays dealers have fewer customers — more time to negotiate."};
  if (!alert) return null;
  return (
    <div style={{background:alert.c+"12", border:"1px solid " + alert.c + "40", borderRadius:10, padding:"12px 18px", marginBottom:14, display:"flex", gap:12, alignItems:"flex-start"}}>
      <span style={{fontSize:24, flexShrink:0}}>{alert.e}</span>
      <div>
        <div style={{fontFamily:C.font, fontSize:11, letterSpacing:2, color:alert.c, fontWeight:700, marginBottom:4}}>⚡ {lang === "es" ? "ALERTA — MEJOR MOMENTO" : "ALERT — BEST TIME TO BUY"}</div>
        <div style={{fontSize:13, color:C.text, lineHeight:1.5}}>{alert.msg}</div>
      </div>
    </div>
  );
}

function NearMe({zip, vehicle, lang}) {
  if (!zip) return null;
  const url = "https://www.google.com/maps/search/" + encodeURIComponent((vehicle || "car") + " dealership near " + zip);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{display:"block", textDecoration:"none", marginBottom:10}}>
      <div style={{background:C.card, border:"1.5px solid " + C.blue, borderRadius:8, padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer"}}>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <span style={{fontSize:22}}>📍</span>
          <div>
            <div style={{fontFamily:C.font, fontWeight:800, fontSize:15, color:C.blue, letterSpacing:1}}>{lang === "es" ? "BUSCAR DEALERS CERCA DE MÍ" : "FIND DEALERS NEAR ME"}</div>
            <div style={{fontSize:12, color:C.text}}>{vehicle} {lang === "es" ? "cerca del ZIP" : "near ZIP"} {zip}</div>
          </div>
        </div>
        <span style={{color:C.blue, fontSize:20}}>→</span>
      </div>
    </a>
  );
}

function RateXP({lang}) {
  const [h, setH] = useState(0);
  const [done, setDone] = useState(false);
  if (done) return (
    <Card style={{textAlign:"center"}}>
      <div style={{fontSize:28, marginBottom:8}}>🙏</div>
      <div style={{fontFamily:C.font, fontWeight:800, fontSize:18, color:C.accent}}>{lang === "es" ? "¡Gracias por tu opinión!" : "Thanks for your feedback!"}</div>
    </Card>
  );
  return (
    <Card style={{textAlign:"center"}}>
      <SLabel>{lang === "es" ? "⭐ CALIFICA TU EXPERIENCIA" : "⭐ RATE YOUR EXPERIENCE"}</SLabel>
      <p style={{fontSize:13, color:C.text, marginBottom:14}}>{lang === "es" ? "¿Qué tan útil fue tu Puntaje?" : "How useful was your Deal Score?"}</p>
      <div style={{display:"flex", justifyContent:"center", gap:10, marginBottom:8}}>
        {[1,2,3,4,5].map(star => (
          <button key={star} onMouseEnter={() => setH(star)} onMouseLeave={() => setH(0)} onClick={() => setDone(true)}
            style={{background:"none", border:"none", cursor:"pointer", fontSize:30, transform:h >= star ? "scale(1.2)" : "scale(1)", filter:h >= star ? "none" : "grayscale(1) brightness(0.5)", transition:"all 0.1s"}}>⭐</button>
        ))}
      </div>
      <div style={{fontSize:11, color:C.text}}>{lang === "es" ? "Toca para calificar" : "Tap to rate"}</div>
    </Card>
  );
}

function CompareBtn({onClick, lang}) {
  return (
    <button onClick={onClick} style={{width:"100%", background:"transparent", color:C.accent, border:"1.5px solid " + C.accent, borderRadius:8, padding:"13px 0", fontFamily:C.font, fontWeight:800, fontSize:15, letterSpacing:1, cursor:"pointer", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"center", gap:10}}>
      ⚖️ {lang === "es" ? "COMPARAR CON OTRO VEHÍCULO" : "COMPARE WITH ANOTHER VEHICLE"}
    </button>
  );
}

function AskAI({results, cmpResults, lang}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(false);
  const isComparing = !!(cmpResults && results);

  const ctx = isComparing
    ? "You are Clutch Pro. User is COMPARING: V1: " + cmpResults.answers?.vehicle + " Score " + cmpResults.dealScore + "/10 OTD ~$" + cmpResults.outTheDoor?.toLocaleString() + ". V2: " + results.answers?.vehicle + " Score " + results.dealScore + "/10 OTD ~$" + results.outTheDoor?.toLocaleString() + ". Give clear winner with specific reasons. Respond in " + (lang === "es" ? "Spanish" : "English") + ". Max 3 sentences."
    : "You are Clutch Pro. User analyzing: " + results.answers?.vehicle + ". Score: " + results.dealScore + "/10. Price: $" + results.priceRange?.low?.toLocaleString() + "–$" + results.priceRange?.high?.toLocaleString() + ". Respond in " + (lang === "es" ? "Spanish" : "English") + ". Max 3 sentences.";

  async function ask(overrideQ) {
    const question = (overrideQ || q).trim();
    if (!question) return;
    setQ("");
    setLoading(true);
    setHist(h => [...h, {r:"user", t:question}]);
    try {
      const res = await fetch(IS_LIVE ? "/api/chat" : ANTHROPIC_API, {
        method:"POST",
        headers:IS_LIVE ? {"Content-Type":"application/json"} : {"Content-Type":"application/json","x-api-key":API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-6", max_tokens:200, system:ctx, messages:[{role:"user", content:question}]})
      });
      const d = await res.json();
      const txt = d.content?.map(b => b.text || "").join("") || "";
      setHist(h => [...h, {r:"ai", t:txt}]);
    } catch(e) {
      setHist(h => [...h, {r:"ai", t: lang === "es" ? "Lo siento, intenta de nuevo." : "Sorry, try again."}]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (isComparing && !open) {
      setOpen(true);
      const autoQ = lang === "es"
        ? "¿Cuál es el mejor trato entre el " + cmpResults?.answers?.vehicle + " y el " + results?.answers?.vehicle + "? Dame un ganador claro y razones específicas."
        : "Which is the better deal — " + cmpResults?.answers?.vehicle + " or " + results?.answers?.vehicle + "? Give me a clear winner and specific reasons why.";
      setTimeout(() => ask(autoQ), 600);
    }
  }, [isComparing]);

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{width:"100%", background:C.card, border:"1.5px solid " + C.border, borderRadius:8, padding:"14px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, marginBottom:10, textAlign:"left"}}>
      <span style={{fontSize:22}}>💬</span>
      <div>
        <div style={{fontFamily:C.font, fontWeight:800, fontSize:15, color:C.text, letterSpacing:1}}>{isComparing ? (lang === "es" ? "🏆 VER ANÁLISIS DE COMPARACIÓN" : "🏆 SEE COMPARISON ANALYSIS") : (lang === "es" ? "PREGÚNTALE A CLUTCH AI" : "ASK CLUTCH AI")}</div>
        <div style={{fontSize:12, color:C.text}}>{isComparing ? (lang === "es" ? "La IA explica cuál es mejor y por qué" : "AI explains which is better and why") : (lang === "es" ? "¿Qué digo cuando entro?" : "What do I say when I walk in?")}</div>
      </div>
      <span style={{color:C.accent, fontSize:18, marginLeft:"auto"}}>→</span>
    </button>
  );

  return (
    <div style={{background:C.card, border:"1px solid " + C.border, borderRadius:12, padding:20, marginBottom:10, borderLeft:"3px solid " + C.accent}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <span style={{fontFamily:C.font, fontSize:13, letterSpacing:2, color:C.accent, fontWeight:700}}>💬 CLUTCH AI {isComparing ? "⚖️" : ""}</span>
        <button onClick={() => setOpen(false)} style={{background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16}}>✕</button>
      </div>
      <div style={{maxHeight:200, overflowY:"auto", marginBottom:10, display:"flex", flexDirection:"column", gap:8}}>
        {hist.length === 0 && <div style={{fontSize:13, color:C.text, fontStyle:"italic"}}>{lang === "es" ? "Haz una pregunta sobre tu trato..." : "Ask anything about your deal..."}</div>}
        {hist.map((h, i) => (
          <div key={i} style={{background:h.r==="user"?C.accent+"18":"#0D0D14", borderRadius:8, padding:"8px 12px", fontSize:13, color:h.r==="user"?C.accent:C.text, alignSelf:h.r==="user"?"flex-end":"flex-start", maxWidth:"90%", lineHeight:1.5}}>{h.t}</div>
        ))}
        {loading && <div style={{fontSize:13, color:C.muted, fontStyle:"italic"}}>...</div>}
      </div>
      <div style={{display:"flex", gap:8}}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()}
          placeholder={lang === "es" ? "Escribe tu pregunta..." : "Type your question..."}
          style={{flex:1, background:"#0D0D14", border:"1.5px solid " + C.border, borderRadius:8, padding:"10px 14px", fontSize:14, color:C.text, outline:"none"}}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        <button onClick={() => ask()} disabled={loading || !q.trim()} style={{background:C.accent, color:"#0A0A0F", border:"none", borderRadius:8, padding:"10px 18px", fontFamily:C.font, fontWeight:800, fontSize:14, cursor:"pointer", flexShrink:0}}>{lang === "es" ? "Enviar" : "Ask"}</button>
      </div>
    </div>
  );
}

function MarketPulse({lang}) {
  const [pulse, setPulse] = useState(null);
  const now = new Date();
  const my = now.toLocaleDateString(lang === "es" ? "es-US" : "en-US", {month:"long", year:"numeric"}).toUpperCase();
  useEffect(() => {
    const prompt = "Give a 1-sentence vehicle market pulse for " + my + " in " + (lang === "es" ? "Spanish" : "English") + ". Good time to buy or rent? Under 20 words. Return ONLY the sentence.";
    callAI(prompt, 100).then(txt => setPulse(txt.trim())).catch(() => setPulse(lang === "es" ? "Mercado estable — buen momento con preparación." : "Market stable — good time to buy with preparation."));
  }, [lang]);
  return (
    <div style={{background:C.accent+"12", border:"1px solid " + C.accent + "40", borderRadius:10, padding:"12px 18px", margin:"0 24px 20px", display:"flex", gap:12, alignItems:"center"}}>
      <span style={{fontSize:20}}>📊</span>
      <div>
        <div style={{fontFamily:C.font, fontSize:11, letterSpacing:2, color:C.accent, fontWeight:700, marginBottom:2}}>{lang === "es" ? "PULSO DEL MERCADO" : "MARKET PULSE"} — {my}</div>
        <div style={{fontSize:13, color:C.text}}>{pulse || "..."}</div>
      </div>
    </div>
  );
}

function Pricing({onUpgrade, lang}) {
  const plans = [
    {name:"FREE", price:"$0", sub:lang==="es"?"para siempre":"forever", features:lang==="es"?["1 estimación/mes","Puntaje de Trato","Estimación de precio","Inteligencia Climática","1 estimación de renta/mes"]:["1 estimate/month","Deal Score","Price estimate","Climate Intelligence","1 rental estimate/month"], cta:lang==="es"?"Empezar Gratis":"Get Started", hi:false},
    {name:"PRO", price:"$12.99", sub:lang==="es"?"/mes · o $99/año":"/month · or $99/yr", features:lang==="es"?["Estimaciones ilimitadas","Reporte de confiabilidad","Costos de reparación","Dealers clasificados","Estimador de auto a cambio","Empresas de renta","Reporte Climático completo"]:["Unlimited estimates","Full reliability report","Repair cost breakdown","Ranked dealer match","Trade-in estimator","Rental company rankings","Full Climate Report"], cta:lang==="es"?"Prueba Gratis 7 Días":"Start 7-Day Free Trial", hi:true, badge:lang==="es"?"MÁS POPULAR":"MOST POPULAR"},
  ];
  return (
    <div style={{padding:"60px 24px", maxWidth:560, margin:"0 auto"}}>
      <div style={{textAlign:"center", marginBottom:32}}>
        <div style={{display:"inline-block", background:C.accent+"18", color:C.accent, fontSize:12, fontWeight:700, letterSpacing:2, padding:"6px 14px", borderRadius:20, marginBottom:16, border:"1px solid " + C.accent + "40"}}>{lang === "es" ? "PRECIOS" : "PRICING"}</div>
        <h2 style={{fontFamily:C.font, fontWeight:800, fontSize:38, marginBottom:8, color:C.text}}>{lang === "es" ? "Ahorra miles." : "Save thousands."}<br/>{lang === "es" ? "Paga casi nada." : "Pay almost nothing."}</h2>
        <p style={{color:C.text, fontSize:15}}>{lang === "es" ? "Ya sea comprando o rentando — el plan Pro se paga solo." : "Whether buying or renting — our Pro plan pays for itself."}</p>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
        {plans.map(p => (
          <div key={p.name} style={{background:C.card, border:p.hi?"2px solid " + C.accent:"1px solid " + C.border, borderRadius:12, padding:24, position:"relative", boxShadow:p.hi?"0 0 40px " + C.accent + "18":"none"}}>
            {p.badge && <div style={{position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:C.accent, color:"#0A0A0F", fontSize:10, fontWeight:800, letterSpacing:1.5, padding:"3px 10px", borderRadius:20}}>{p.badge}</div>}
            <div style={{fontFamily:C.font, fontWeight:800, fontSize:18, letterSpacing:2, marginBottom:4}}>{p.name}</div>
            <div style={{fontFamily:C.font, fontWeight:800, fontSize:34, color:p.hi?C.accent:C.text, lineHeight:1}}>{p.price}</div>
            <div style={{fontSize:12, color:C.muted, marginBottom:16}}>{p.sub}</div>
            <ul style={{listStyle:"none", padding:0, margin:"0 0 16px", display:"flex", flexDirection:"column", gap:7}}>
              {p.features.map(f => <li key={f} style={{fontSize:13, display:"flex", gap:6}}><span style={{color:p.hi?C.accent:C.green}}>✓</span><span style={{color:C.text}}>{f}</span></li>)}
            </ul>
            <button onClick={() => p.hi && onUpgrade && onUpgrade()} style={{width:"100%", background:p.hi?C.accent:"transparent", color:p.hi?"#0A0A0F":C.muted, border:p.hi?"none":"1px solid " + C.border, borderRadius:6, padding:"11px 0", fontFamily:C.font, fontWeight:800, fontSize:13, letterSpacing:1, cursor:"pointer"}}>{p.cta}</button>
          </div>
        ))}
      </div>
      <p style={{textAlign:"center", fontSize:12, color:C.muted, marginTop:16}}>{lang === "es" ? "Sin tarjeta de crédito · Cancela cuando quieras" : "No credit card required · Cancel anytime"}</p>
    </div>
  );
}

export default function App() {
  useFonts();
  const [lang, setLang] = useState("en");
  const [mode, setMode] = useState(null);
  const [screen, setScreen] = useState("home");
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState({});
  const [results, setResults] = useState(null);
  const [rental, setRental] = useState(null);
  const [climate, setClimate] = useState(null);
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState("");
  const [cmpResults, setCmpResults] = useState(null);
  const retRef = useRef(null);

  const iStyle = {width:"100%", background:"#0D0D14", border:"1.5px solid " + C.border, borderRadius:8, padding:"14px 16px", fontSize:16, color:C.text, fontFamily:C.body, outline:"none", boxSizing:"border-box"};

  function buildBuyingSteps(a) {
    const base = [
      {key:"vehicleType", title:lang==="es"?"¿Qué estás comprando?":"What are you buying?", sub:lang==="es"?"Adaptaremos todo al tipo de vehículo.":"We'll tailor everything to your vehicle type.", type:"grid", opts:VT.map(v=>({val:v.id, lbl:lang==="es"?v.es:v.l, e:v.e}))},
      {key:"condition", title:lang==="es"?"¿Nuevo o usado?":"New or used?", sub:lang==="es"?"Afecta precio, tasas y estrategia.":"Affects pricing, financing rates, and dealer strategy.", type:"opts", opts:lang==="es"?[{val:"new",lbl:"🆕 Nuevo"},{val:"used",lbl:"🔄 Usado"},{val:"either",lbl:"🤷 Cualquiera"}]:[{val:"new",lbl:"🆕 Brand New"},{val:"used",lbl:"🔄 Used / Pre-Owned"},{val:"either",lbl:"🤷 Open to Either"}]},
      {key:"vehicle", title:lang==="es"?"¿Qué vehículo?":"Which vehicle?", sub:lang==="es"?"Año, Marca y Modelo.":"Year, Make, and Model.", type:"text", ph:() => lang==="es"?"ej. 2022 Honda Accord":"e.g. 2022 Honda Accord"},
    ];
    if (a.condition === "used" || a.condition === "either") {
      base.splice(3, 0, {key:"mileage", title:lang==="es"?"¿Cuántas millas tiene?":"What's the mileage?", sub:lang==="es"?"El millaje afecta enormemente el valor.":"Mileage drastically affects value.", type:"opts",
        opts:lang==="es"?[{val:"under30k",lbl:"🟢 Menos de 30k — Casi nuevo"},{val:"30to60k",lbl:"🟡 30k–60k — Bajo"},{val:"60to100k",lbl:"🟠 60k–100k — Moderado"},{val:"100to150k",lbl:"🔴 100k–150k — Alto"},{val:"over150k",lbl:"⚫ Más de 150k — Muy alto"}]
        :[{val:"under30k",lbl:"🟢 Under 30k — Nearly new"},{val:"30to60k",lbl:"🟡 30k–60k miles — Low"},{val:"60to100k",lbl:"🟠 60k–100k miles — Moderate"},{val:"100to150k",lbl:"🔴 100k–150k miles — High"},{val:"over150k",lbl:"⚫ Over 150k miles — Very high"}]
      });
    }
    const creditOpts = [
      {val:"poor", lbl:"😬 " + (lang==="es"?"Malo 300–579":"Poor 300–579")},
      {val:"fair", lbl:"😐 " + (lang==="es"?"Regular 580–669":"Fair 580–669")},
      {val:"good", lbl:"🙂 " + (lang==="es"?"Bueno 670–739":"Good 670–739")},
      {val:"verygood", lbl:"😊 " + (lang==="es"?"Muy Bueno 740–799":"Very Good 740–799")},
      {val:"exceptional", lbl:"🌟 " + (lang==="es"?"Excepcional 800+":"Exceptional 800+")},
      {val:"skip", lbl:lang==="es"?"⏭️ Omitir (no recomendado)":"⏭️ Skip (not recommended — less accurate)"},
    ];
    base.push({key:"credit", title:lang==="es"?"¿Rango de crédito?":"Credit score range?", sub:lang==="es"?"Auto-reportado — nunca lo verificamos.":"Self-reported — we never verify it.", type:"opts", opts:creditOpts});
    base.push({key:"downpayment", title:lang==="es"?"¿Cuánto de enganche?":"Down payment?", sub:lang==="es"?"Más enganche = menor pago mensual.":"More down = lower monthly + better rate.", type:"opts",
      opts:[{val:"0",lbl:"💸 $0"},{val:"under1k",lbl:"💵 " + (lang==="es"?"Menos de $1,000":"Under $1,000")},{val:"1k3k",lbl:"💵 $1,000–$3,000"},{val:"3k5k",lbl:"💰 $3,000–$5,000"},{val:"5kplus",lbl:"🏦 $5,000+"}]
    });
    base.push({key:"tradeIn", title:lang==="es"?"¿Tienes auto a cambio?":"Do you have a trade-in?", sub:lang==="es"?"Los dealers usan tu auto a su ventaja.":"Dealers use your trade to their advantage.", type:"opts",
      opts:[{val:"yes",lbl:lang==="es"?"✅ Sí — Doy mi auto a cambio":"✅ Yes — I'm trading in"},{val:"no",lbl:lang==="es"?"❌ No tengo auto a cambio":"❌ No trade-in"}]
    });
    if (a.tradeIn === "yes") {
      base.push({key:"tradeInVehicle", title:lang==="es"?"¿Qué auto das a cambio?":"What are you trading in?", sub:lang==="es"?"Año, Marca y Modelo de tu auto actual.":"Year, Make, and Model of your current vehicle.", type:"text", ph:() => lang==="es"?"ej. 2018 Toyota Camry":"e.g. 2018 Toyota Camry"});
      base.push({key:"tradeInCond", title:lang==="es"?"¿Condición del auto?":"Trade-in condition?", sub:lang==="es"?"Sé honesto — los dealers lo inspeccionarán.":"Be honest — dealers will inspect it anyway.", type:"opts",
        opts:lang==="es"?[{val:"excellent",lbl:"⭐ Excelente"},{val:"good",lbl:"👍 Bueno"},{val:"fair",lbl:"😐 Regular"},{val:"poor",lbl:"👎 Malo"}]:[{val:"excellent",lbl:"⭐ Excellent — Like new"},{val:"good",lbl:"👍 Good — Minor wear"},{val:"fair",lbl:"😐 Fair — Some issues"},{val:"poor",lbl:"👎 Poor — Major issues"}]
      });
    }
    base.push({key:"zip", title:lang==="es"?"¿Tu código ZIP?":"Your ZIP code?", sub:lang==="es"?"Para clima, precios regionales y dealers.":"For climate, regional pricing, and dealer matching.", type:"text", ph:() => lang==="es"?"ej. 48601":"e.g. 48601"});
    return base;
  }

  function buildRentalSteps(a) {
    const base = [
      {key:"tripType", title:lang==="es"?"¿Local o viajando?":"Local or traveling?", sub:lang==="es"?"Esto nos ayuda a encontrar las mejores empresas.":"Helps us find the right rental companies.", type:"opts",
        opts:lang==="es"?[{val:"local",lbl:"📍 Renta local"},{val:"travel",lbl:"✈️ Viajando fuera"}]:[{val:"local",lbl:"📍 Local rental"},{val:"travel",lbl:"✈️ Traveling out of town"}]},
      {key:"destination", title:lang==="es"?"¿ZIP de tu destino?":"Destination ZIP?", sub:lang==="es"?"Revisaremos el clima y encontraremos empresas.":"We'll check weather and find rental companies.", type:"text", ph:() => "e.g. 80202"},
      {key:"travelDates", title:lang==="es"?"¿Cuándo viajas?":"When are you traveling?", sub:lang==="es"?"Ingresa fechas de salida y regreso.":"Enter departure and return dates.", type:"daterange", ph:() => "MM/DD/YY"},
      {key:"tripSize", title:lang==="es"?"¿Solo o en familia?":"Solo or family trip?", sub:lang==="es"?"Determina el tamaño del vehículo.":"Determines the right vehicle size.", type:"opts",
        opts:lang==="es"?[{val:"solo",lbl:"🧍 Solo yo"},{val:"couple",lbl:"👫 Yo y mi pareja"},{val:"family",lbl:"👨‍👩‍👧‍👦 Viaje familiar"},{val:"group",lbl:"👥 Grupo de amigos"}]:[{val:"solo",lbl:"🧍 Just me"},{val:"couple",lbl:"👫 Me + partner"},{val:"family",lbl:"👨‍👩‍👧‍👦 Family trip"},{val:"group",lbl:"👥 Group of friends"}]},
    ];
    if (a.tripSize === "family") {
      base.push({key:"familySize", title:lang==="es"?"¿Cuántas personas?":"How many people?", sub:lang==="es"?"Incluyendo adultos y niños.":"Including adults and children.", type:"opts", opts:[{val:"3",lbl:"👨‍👩‍👦 3"},{val:"4",lbl:"👨‍👩‍👧‍👦 4"},{val:"5",lbl:"👪 5"},{val:"6plus",lbl:"👨‍👩‍👧‍👦‍👦 6+"}]});
      base.push({key:"kidsCount", title:lang==="es"?"¿Cuántos niños?":"How many kids?", sub:lang==="es"?"Para sillas y espacio de equipaje.":"For car seat and luggage space.", type:"opts",
        opts:lang==="es"?[{val:"1",lbl:"1 niño"},{val:"2",lbl:"2 niños"},{val:"3plus",lbl:"3+ niños"}]:[{val:"1",lbl:"1 child"},{val:"2",lbl:"2 children"},{val:"3plus",lbl:"3+ children"}]});
    }
    base.push({key:"vehiclePref", title:lang==="es"?"¿Preferencia de vehículo?":"Vehicle preference?", sub:lang==="es"?"¿Qué tipo de renta buscas?":"What type of rental?", type:"grid", opts:RVT.map(v=>({val:v.id, lbl:lang==="es"?v.es:v.l, e:v.e}))});
    base.push({key:"budget", title:lang==="es"?"¿Presupuesto diario?":"Daily budget?", sub:lang==="es"?"Encontraremos las mejores opciones.":"We'll find the best options.", type:"opts",
      opts:lang==="es"?[{val:"under40",lbl:"💚 Menos de $40/día"},{val:"40to70",lbl:"💛 $40–$70/día"},{val:"70to100",lbl:"🧡 $70–$100/día"},{val:"100plus",lbl:"❤️ $100+/día"}]:[{val:"under40",lbl:"💚 Under $40/day"},{val:"40to70",lbl:"💛 $40–$70/day"},{val:"70to100",lbl:"🧡 $70–$100/day"},{val:"100plus",lbl:"❤️ $100+/day"}]});
    return base;
  }

  const steps = mode === "renting" ? buildRentalSteps(ans) : buildBuyingSteps(ans);
  const TOTAL = steps.length;
  const cur = steps[step];
  const accent = mode === "renting" ? C.purple : C.accent;

  function pick(val) {
    const updated = {...ans, [cur.key]: val};
    setAns(updated);
    setTimeout(() => {
      const ns = mode === "renting" ? buildRentalSteps(updated) : buildBuyingSteps(updated);
      if (step < ns.length - 1) setStep(s => s + 1);
      else mode === "renting" ? runRental(updated) : runBuying(updated);
    }, 200);
  }

  function textNext() {
    if (!ans[cur.key]?.trim()) return;
    const ns = mode === "renting" ? buildRentalSteps(ans) : buildBuyingSteps(ans);
    if (step < ns.length - 1) setStep(s => s + 1);
    else mode === "renting" ? runRental(ans) : runBuying(ans);
  }

  async function runBuying(data) {
    setScreen("loading");
    const msgs = lang === "es"
      ? ["Detectando zona climática...", "Analizando valor de auto a cambio...", "Obteniendo datos del mercado...", "Construyendo tu Puntaje...", "¡Casi listo!"]
      : ["Detecting climate zone...", "Analyzing trade-in value...", "Pulling market data...", "Building your Deal Score...", "Almost ready..."];
    let mi = 0; setMsg(msgs[0]);
    const tk = setInterval(() => { mi = (mi + 1) % msgs.length; setMsg(msgs[mi]); }, 1800);
    const tl = VT.find(v => v.id === data.vehicleType)?.l || data.vehicleType;
    let cd = null, ll = null;
    try { const co = await getCoords(data.zip); ll = co.city + ", " + co.state; cd = await getClimate(co.lat, co.lng); } catch(e) {}
    const cc = cd ? " Climate at " + ll + ": severity " + cd.severity + "/10, " + cd.totalSnowInches + " inches snow, " + cd.freezingDays + " freezing days." : "";
    const mc = data.mileage ? " Mileage: " + data.mileage + "." : "";
    const tc = data.tradeIn === "yes" && data.tradeInVehicle ? " Trade-in: " + data.tradeInVehicle + ", condition: " + data.tradeInCond + "." : "";
    const ti = data.tradeIn === "yes" && data.tradeInVehicle ? '"tradeInData":{"dealerOffer":"<range>","privateSale":"<range>","kbbRange":"<range>","leverage":"<text>","tactics":["<3 tactics>"],"proMove":"<move>"}' : '"tradeInData":null';
    const bw = ["motorcycle","dirtbike"].includes(data.vehicleType) ? '"<safety note>"' : "null";
    const prompt = "You are Clutch Pro. Respond ENTIRELY in " + (lang === "es" ? "Spanish" : "English") + ". CRITICAL: Return ONLY a valid JSON object, no markdown, no extra text. Buyer wants: " + data.condition + " " + data.vehicle + " (" + tl + "). Credit: " + data.credit + " | Down payment: " + data.downpayment + " | ZIP: " + data.zip + mc + cc + tc + ". Return this exact JSON structure with real values filled in: {\"dealScore\":7.5,\"dealVerdict\":\"sentence here\",\"priceRange\":{\"low\":25000,\"high\":28000},\"outTheDoor\":29500,\"monthlyPayment\":{\"low\":450,\"high\":520,\"apr\":\"6.9-8.9%\",\"term\":60},\"totalLoanCost\":31200,\"insuranceEstimate\":{\"low\":95,\"high\":140,\"note\":\"reason based on ZIP and vehicle\"},\"pros\":[\"pro1\",\"pro2\",\"pro3\",\"pro4\",\"pro5\"],\"cons\":[\"con1\",\"con2\",\"con3\",\"con4\",\"con5\"],\"dealerTip\":\"negotiation advice here\",\"redFlags\":[\"flag1\",\"flag2\",\"flag3\"],\"marketNote\":\"one sentence here\",\"beginnerWarning\":" + bw + "," + ti + "} — replace ALL placeholder values with real accurate data for this specific vehicle, credit score, location, and market conditions.";
    try {
      const txt = await callAI(prompt, 1200);
      clearInterval(tk);
      const clean = txt.replace(/```json|```/g, "").trim();
      const m = clean.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no json: " + txt.slice(0, 100));
      const r = JSON.parse(m[0]);
      setClimate(cd); setLoc(ll); setResults({...r, answers:data}); setScreen("results");
    } catch(e) { clearInterval(tk); setErr("Error: " + e.message); setScreen("results"); }
  }

  async function runRental(data) {
    setScreen("loading");
    const msgs = lang === "es"
      ? ["Verificando clima en destino...", "Buscando empresas de renta...", "Calculando tu Puntaje de Renta...", "¡Casi listo!"]
      : ["Checking weather at destination...", "Finding rental companies...", "Calculating Rental Deal Score...", "Almost ready..."];
    let mi = 0; setMsg(msgs[0]);
    const tk = setInterval(() => { mi = (mi + 1) % msgs.length; setMsg(msgs[mi]); }, 1800);
    let cd = null, ll = null;
    try { const co = await getCoords(data.destination); ll = co.city + ", " + co.state; cd = await getClimate(co.lat, co.lng); } catch(e) {}
    const wc = cd ? "Destination weather: " + ll + ", severity " + cd.severity + "/10, " + cd.totalSnowInches + " inches snow, " + cd.freezingDays + " freezing days." : "ZIP: " + data.destination;
    const fc = data.tripSize === "family" ? "Family of " + data.familySize + ", " + data.kidsCount + " kids." : "Trip: " + data.tripSize;
    const prompt = "You are Clutch Pro rental advisor. Respond ENTIRELY in " + (lang === "es" ? "Spanish" : "English") + ". CRITICAL: Return ONLY a valid JSON object, no markdown, no extra text. " + wc + " | " + fc + " | Vehicle preference: " + data.vehiclePref + " | Daily budget: " + data.budget + " | Travel dates: " + data.travelDates + ". Return this exact JSON structure: {\"dealScore\":7.5,\"verdict\":\"sentence here\",\"weatherWarning\":null,\"recommendedVehicle\":\"Toyota RAV4 AWD\",\"vehicleReason\":\"reason here\",\"familyTips\":null,\"dailyRate\":\"$55-$75/day\",\"totalCost\":\"$385-$525 total\",\"budgetRating\":\"Good Match\",\"bestValue\":\"Enterprise\",\"companies\":[{\"name\":\"Enterprise\",\"rating\":\"4.3\",\"priceRange\":\"$55-$70\",\"note\":\"note here\"},{\"name\":\"Hertz\",\"rating\":\"4.1\",\"priceRange\":\"$60-$75\",\"note\":\"note here\"},{\"name\":\"Turo\",\"rating\":\"4.4\",\"priceRange\":\"$50-$65\",\"note\":\"note here\"},{\"name\":\"Avis\",\"rating\":\"4.0\",\"priceRange\":\"$58-$72\",\"note\":\"note here\"},{\"name\":\"Budget\",\"rating\":\"3.9\",\"priceRange\":\"$45-$60\",\"note\":\"note here\"}],\"pros\":[\"pro1\",\"pro2\",\"pro3\",\"pro4\",\"pro5\"],\"cons\":[\"con1\",\"con2\",\"con3\",\"con4\",\"con5\"],\"redFlags\":[\"flag1\",\"flag2\",\"flag3\"]} — fill in all values based on the actual trip details, weather, family size, and budget.";
    try {
      const txt = await callAI(prompt, 1200);
      clearInterval(tk);
      const clean = txt.replace(/```json|```/g, "").trim();
      const m = clean.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no json: " + txt.slice(0, 100));
      const r = JSON.parse(m[0]);
      setClimate(cd); setLoc(ll); setRental({...r, answers:data}); setScreen("results");
    } catch(e) { clearInterval(tk); setErr("Error: " + e.message); setScreen("results"); }
  }

  function restart() { setStep(0); setAns({}); setResults(null); setRental(null); setClimate(null); setLoc(null); setErr(null); setMode(null); setCmpResults(null); setScreen("home"); }

  return (
    <div style={{minHeight:"100vh", background:C.bg, fontFamily:C.body, color:C.text, overflowX:"hidden"}}>
      {/* NAV */}
      <nav style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 24px", borderBottom:"1px solid " + C.border, background:"rgba(10,10,15,0.92)", backdropFilter:"blur(12px)", position:"sticky", top:0, zIndex:100}}>
        <div onClick={restart} style={{fontFamily:C.font, fontWeight:700, fontSize:22, letterSpacing:1, color:C.accent, cursor:"pointer"}}>CLUTCH</div>
        <div style={{display:"flex", gap:6, alignItems:"center"}}>
          <div style={{background:C.accentDim, color:C.accent, fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:4, letterSpacing:1}}>AI-POWERED</div>
          {[["en","🇺🇸"],["es","🇪🇸"]].map(([code, flag]) => (
            <button key={code} onClick={() => setLang(code)} style={{background:lang===code?C.accent+"20":"transparent", border:"1px solid " + (lang===code?C.accent:C.border), borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:16}}>{flag}</button>
          ))}
          <button onClick={() => setScreen("pricing")} style={{background:"transparent", color:C.muted, fontFamily:C.body, fontSize:13, padding:"6px 12px", borderRadius:8, border:"1px solid " + C.border, cursor:"pointer"}}>{lang === "es" ? "Precios" : "Pricing"}</button>
          {screen !== "home" && <button onClick={restart} style={{background:"transparent", color:C.muted, fontFamily:C.body, fontSize:13, padding:"6px 12px", borderRadius:8, border:"1px solid " + C.border, cursor:"pointer"}}>{lang === "es" ? "← Inicio" : "← Home"}</button>}
        </div>
      </nav>

      {/* HOME */}
      {screen === "home" && <>
        <div style={{padding:"60px 24px 40px", maxWidth:560, margin:"0 auto", textAlign:"center"}}>
          <div style={{display:"inline-block", background:C.accent+"18", color:C.accent, fontSize:12, fontWeight:700, letterSpacing:2, padding:"6px 14px", borderRadius:20, marginBottom:20, border:"1px solid " + C.accent + "40"}}>{lang === "es" ? "GRATIS · IA · SIN REGISTRO" : "FREE · AI-POWERED · NO SIGNUP NEEDED"}</div>
          <h1 style={{fontFamily:C.font, fontWeight:800, fontSize:"clamp(36px,8vw,62px)", lineHeight:1, letterSpacing:-1, marginBottom:16, color:C.text}}>
            {lang === "es" ? "Conoce Tu" : "Know Your"}<br/>
            <span style={{color:C.accent}}>{lang === "es" ? "Trato Real" : "Real Deal"}</span><br/>
            {lang === "es" ? "Antes de Entrar." : "Before You Go In."}
          </h1>
          <p style={{fontSize:16, color:C.text, lineHeight:1.6, marginBottom:32}}>{lang === "es" ? "Tu movimiento mágico antes del dealer. Puntaje, precios reales, clima — comprando o rentando." : "Your magic move before hitting the lot. Deal Score, real pricing, climate intel — buying or renting."}</p>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, maxWidth:420, margin:"0 auto 16px"}}>
            {[{m:"buying",e:"🚗",l:lang==="es"?"ESTOY COMPRANDO":"I'M BUYING",s:lang==="es"?"Obtén tu Puntaje":"Get your Deal Score",c:C.accent},{m:"renting",e:"✈️",l:lang==="es"?"ESTOY RENTANDO":"I'M RENTING",s:lang==="es"?"Planifica tu viaje":"Plan your trip",c:C.purple}].map(({m,e,l,s,c}) => (
              <button key={m} onClick={() => { setMode(m); setScreen("intake"); }} style={{background:c+"18", border:"2px solid " + c, borderRadius:12, padding:"18px 12px", cursor:"pointer", textAlign:"center"}}>
                <div style={{fontSize:30, marginBottom:6}}>{e}</div>
                <div style={{fontFamily:C.font, fontWeight:800, fontSize:17, color:c, letterSpacing:1}}>{l}</div>
                <div style={{fontSize:12, color:C.text, marginTop:4}}>{s}</div>
              </button>
            ))}
          </div>
        </div>
        <MarketPulse lang={lang}/>
        <div style={{display:"flex", justifyContent:"center", flexWrap:"wrap", gap:28, padding:"20px 24px", borderTop:"1px solid " + C.border, borderBottom:"1px solid " + C.border, marginBottom:36}}>
          {[["$2,400", lang==="es"?"paga de más en promedio":"avg buyer overpays"],["3 min",lang==="es"?"a tu puntaje":"to your deal score"],["5 " + (lang==="es"?"tipos":"types"),lang==="es"?"de vehículos":"vehicles covered"],["50 " + (lang==="es"?"estados":"states"),lang==="es"?"datos de clima":"climate data"]].map(([n,l]) => (
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontFamily:C.font, fontWeight:800, fontSize:26, color:C.accent}}>{n}</div>
              <div style={{fontSize:12, color:C.text}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{maxWidth:520, margin:"0 auto", padding:"0 24px 60px"}}>
          <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:28}}>
            {[{i:"🌨️",t:lang==="es"?"Inteligencia Climática":"Climate Intelligence",d:lang==="es"?"Ingresa cualquier ZIP — analizamos los inviernos y te decimos qué vehículos funcionan mejor.":"Enter any ZIP — we analyze winters and tell you which vehicles thrive or fail.",c:C.blue},{i:"🔄",t:lang==="es"?"Estimador de Auto a Cambio":"Trade-In Estimator",d:lang==="es"?"Dinos tu auto y mostramos lo que los dealers ofrecerán vs lo que realmente vale.":"Tell us your trade-in and we'll show what dealers will offer vs what it's really worth.",c:C.accent},{i:"✈️",t:lang==="es"?"Asesor de Renta":"Rental Trip Advisor",d:lang==="es"?"¿Viajando? Recomendamos la renta correcta según el clima, familia y presupuesto.":"Traveling? We'll recommend the right rental for your weather, family size, and budget.",c:C.purple},{i:"🎯",t:lang==="es"?"Puntaje de Trato":"Deal Score",d:lang==="es"?"Un número del 1 al 10 — gran trato o retírate.":"One number — 1 to 10 — great deal or walk away.",c:C.green}].map(f => (
              <div key={f.t} style={{background:C.card, border:"1px solid " + C.border, borderRadius:12, padding:20, borderLeft:"3px solid " + f.c, display:"flex", gap:14, alignItems:"flex-start"}}>
                <span style={{fontSize:26, flexShrink:0}}>{f.i}</span>
                <div><div style={{fontFamily:C.font, fontWeight:800, fontSize:15, marginBottom:4}}>{f.t}</div><div style={{fontSize:13, color:C.text, lineHeight:1.5}}>{f.d}</div></div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center", marginBottom:14}}><span style={{display:"inline-block", background:C.accent+"18", color:C.accent, fontSize:12, fontWeight:700, letterSpacing:2, padding:"6px 14px", borderRadius:20, border:"1px solid " + C.accent + "40"}}>{lang === "es" ? "COMPRANDO — TODOS ESTOS VEHÍCULOS" : "BUYING — WORKS FOR ALL OF THESE"}</span></div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10}}>
            {VT.map(v => (
              <div key={v.id} style={{background:C.card, border:"1px solid " + C.border, borderRadius:12, padding:"14px 6px", textAlign:"center", cursor:"pointer"}} onClick={() => { setMode("buying"); setScreen("intake"); }}>
                <div style={{fontSize:26, marginBottom:4}}>{v.e}</div>
                <div style={{fontSize:11, color:C.text, lineHeight:1.2}}>{lang === "es" ? v.es : v.l}</div>
              </div>
            ))}
          </div>
        </div>
        <Pricing onUpgrade={() => setScreen("pricing")} lang={lang}/>
      </>}

      {/* INTAKE */}
      {screen === "intake" && cur && <>
        <div style={{height:3, background:C.border}}>
          <div style={{height:"100%", width:((step/TOTAL)*100) + "%", background:"linear-gradient(90deg," + accent + ",#FFD166)", transition:"width 0.4s ease"}}/>
        </div>
        <div style={{maxWidth:520, margin:"0 auto", padding:"40px 24px"}}>
          <div style={{display:"inline-block", background:accent+"18", border:"1px solid " + accent + "40", borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:700, color:accent, letterSpacing:1, marginBottom:14}}>
            {mode === "renting" ? (lang === "es" ? "✈️ ASESOR DE RENTA" : "✈️ RENTAL ADVISOR") : (lang === "es" ? "🚗 ESTIMADOR DE COMPRA" : "🚗 BUYING ESTIMATOR")}
          </div>
          <div style={{fontFamily:C.font, fontSize:13, letterSpacing:2, color:accent, fontWeight:700, marginBottom:8}}>STEP {step+1} {lang === "es" ? "DE" : "OF"} {TOTAL}</div>
          <h2 style={{fontFamily:C.font, fontWeight:800, fontSize:30, marginBottom:6}}>{cur.title}</h2>
          <p style={{fontSize:14, color:C.text, marginBottom:24}}>{cur.sub}</p>
          {cur.key === "tradeInVehicle" && <div style={{background:C.accent+"12", border:"1px solid " + C.accent + "40", borderRadius:8, padding:"12px 16px", marginBottom:18, fontSize:13, color:C.accent}}>{lang === "es" ? "💡 Conocer el valor de tu auto es una de las herramientas más poderosas." : "💡 Knowing your trade-in value is one of your most powerful negotiating tools."}</div>}
          {cur.type === "grid" && (
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              {cur.opts.map(o => (
                <button key={o.val} onClick={() => pick(o.val)} style={{background:ans[cur.key]===o.val?accent+"18":"#0D0D14", border:"1.5px " + (ans[cur.key]===o.val?"solid " + accent:"solid " + C.border), borderRadius:8, padding:"14px 10px", cursor:"pointer", color:ans[cur.key]===o.val?accent:C.text, fontFamily:C.body, fontSize:14, fontWeight:ans[cur.key]===o.val?700:400, display:"flex", alignItems:"center", gap:10}}>
                  <span style={{fontSize:22}}>{o.e}</span><span>{o.lbl}</span>
                </button>
              ))}
            </div>
          )}
          {cur.type === "opts" && (
            <div style={{display:"flex", flexDirection:"column", gap:10}}>
              {cur.opts.map(o => (
                <button key={o.val} onClick={() => pick(o.val)} style={{background:o.val==="skip"?"transparent":ans[cur.key]===o.val?accent+"18":"#0D0D14", border:(o.val==="skip"?"dashed":"solid") + " 1.5px " + (o.val==="skip"?C.muted:ans[cur.key]===o.val?accent:C.border), borderRadius:8, padding:"13px 14px", cursor:"pointer", color:o.val==="skip"?C.muted:ans[cur.key]===o.val?accent:C.text, fontFamily:C.body, fontSize:o.val==="skip"?13:14, fontWeight:ans[cur.key]===o.val?700:400, textAlign:"left", opacity:o.val==="skip"?0.6:1, width:"100%"}}>
                  {o.lbl}
                </button>
              ))}
            </div>
          )}
          {cur.type === "text" && (
            <div>
              <input style={iStyle} placeholder={cur.ph()} value={ans[cur.key]||""} onChange={e => setAns(a => ({...a, [cur.key]:e.target.value}))}
                onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = C.border}
                onKeyDown={e => e.key === "Enter" && textNext()} autoFocus/>
              <button onClick={textNext} style={{width:"100%", marginTop:14, background:accent, color:"#0A0A0F", border:"none", borderRadius:8, padding:"15px 0", fontFamily:C.font, fontWeight:800, fontSize:17, letterSpacing:1, cursor:"pointer"}}>{lang === "es" ? "Continuar →" : "Continue →"}</button>
            </div>
          )}
          {cur.type === "daterange" && (
            <div>
              <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:10, alignItems:"center", marginBottom:14}}>
                <div>
                  <div style={{fontSize:11, color:C.muted, marginBottom:6, letterSpacing:1}}>{lang === "es" ? "SALIDA" : "DEPARTURE"}</div>
                  <input style={{...iStyle, textAlign:"center", fontSize:20, fontFamily:C.font, fontWeight:700, letterSpacing:2}} placeholder="MM/DD/YY" maxLength={8} value={ans._dep||""}
                    onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = C.border}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.length >= 2) v = v.slice(0,2) + "/" + v.slice(2);
                      if (v.length >= 5) v = v.slice(0,5) + "/" + v.slice(5);
                      v = v.slice(0, 8);
                      const u = {...ans, _dep:v};
                      setAns(u);
                      if (v.length === 8 && u._ret?.length === 8) setAns(a => ({...a, travelDates:v + " - " + u._ret}));
                      if (v.length === 8) setTimeout(() => retRef.current?.focus(), 50);
                    }} autoFocus/>
                </div>
                <div style={{fontFamily:C.font, fontWeight:800, fontSize:20, color:C.muted, textAlign:"center", paddingTop:20}}>→</div>
                <div>
                  <div style={{fontSize:11, color:C.muted, marginBottom:6, letterSpacing:1}}>{lang === "es" ? "REGRESO" : "RETURN"}</div>
                  <input ref={retRef} style={{...iStyle, textAlign:"center", fontSize:20, fontFamily:C.font, fontWeight:700, letterSpacing:2}} placeholder="MM/DD/YY" maxLength={8} value={ans._ret||""}
                    onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = C.border}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.length >= 2) v = v.slice(0,2) + "/" + v.slice(2);
                      if (v.length >= 5) v = v.slice(0,5) + "/" + v.slice(5);
                      v = v.slice(0, 8);
                      const u = {...ans, _ret:v};
                      setAns(u);
                      if (v.length === 8 && u._dep?.length === 8) setAns(a => ({...a, travelDates:u._dep + " - " + v}));
                    }}/>
                </div>
              </div>
              {ans.travelDates && <div style={{background:accent+"12", border:"1px solid " + accent + "40", borderRadius:8, padding:"10px 14px", marginBottom:14, textAlign:"center", fontFamily:C.font, fontWeight:700, fontSize:16, color:accent}}>✈️ {ans.travelDates}</div>}
              <button onClick={() => { if (ans.travelDates) textNext(); }} style={{width:"100%", background:ans.travelDates?accent:C.muted, color:"#0A0A0F", border:"none", borderRadius:8, padding:"15px 0", fontFamily:C.font, fontWeight:800, fontSize:17, letterSpacing:1, cursor:ans.travelDates?"pointer":"not-allowed", opacity:ans.travelDates?1:0.5}}>{lang === "es" ? "Continuar →" : "Continue →"}</button>
            </div>
          )}
          {step > 0 && <button onClick={() => setStep(s => s-1)} style={{marginTop:18, background:"transparent", color:C.muted, border:"1px solid " + C.border, borderRadius:8, padding:"10px 18px", cursor:"pointer", fontFamily:C.body, fontSize:13}}>{lang === "es" ? "← Atrás" : "← Back"}</button>}
        </div>
      </>}

      {/* LOADING */}
      {screen === "loading" && (
        <div style={{display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:20}}>
          <div style={{fontFamily:C.font, fontWeight:800, fontSize:48, color:mode==="renting"?C.purple:C.accent, animation:"pulse 2s ease-in-out infinite"}}>{mode === "renting" ? (lang === "es" ? "CARRENTA" : "CARRENTAL") : "CLUTCH"}</div>
          <Dots/>
          <p style={{color:C.text, fontSize:14}}>{msg}</p>
          <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}"}</style>
        </div>
      )}

      {/* RESULTS */}
      {screen === "results" && (
        <div style={{maxWidth:560, margin:"0 auto", padding:"40px 24px 80px"}}>
          {cmpResults && results && (
            <Card style={{borderLeft:"3px solid " + C.accent, background:C.accent+"10"}}>
              <SLabel>⚖️ {lang === "es" ? "COMPARACIÓN" : "VEHICLE COMPARISON"}</SLabel>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
                {[cmpResults, results].map((r, i) => (
                  <div key={i} style={{background:"#0D0D14", borderRadius:8, padding:12, textAlign:"center"}}>
                    <div style={{fontSize:11, color:C.text, marginBottom:4}}>{lang === "es" ? "VEHÍCULO " + (i+1) : "VEHICLE " + (i+1)}</div>
                    <div style={{fontFamily:C.font, fontWeight:800, fontSize:13, marginBottom:4}}>{r.answers?.vehicle}</div>
                    <div style={{fontFamily:C.font, fontWeight:800, fontSize:28, color:sc(r.dealScore)}}>{r.dealScore}<span style={{fontSize:13}}>/10</span></div>
                  </div>
                ))}
              </div>
              <div style={{textAlign:"center", fontSize:13, color:C.accent, fontWeight:700}}>
                {cmpResults.dealScore > results.dealScore ? "🏆 " + cmpResults.answers?.vehicle + (lang === "es" ? " es el mejor trato!" : " is the better deal!") : cmpResults.dealScore < results.dealScore ? "🏆 " + results.answers?.vehicle + (lang === "es" ? " es el mejor trato!" : " is the better deal!") : (lang === "es" ? "¡Empate!" : "It's a tie!")}
              </div>
            </Card>
          )}

          {err ? (
            <div style={{background:C.card, border:"1px solid " + C.border, borderRadius:12, padding:24, textAlign:"center", color:C.red}}>
              <div style={{fontSize:36, marginBottom:12}}>⚠️</div>
              <div>{err}</div>
              <button onClick={restart} style={{marginTop:16, background:C.accent, color:"#0A0A0F", border:"none", borderRadius:8, padding:"13px 28px", fontFamily:C.font, fontWeight:800, fontSize:15, cursor:"pointer"}}>{lang === "es" ? "Intentar de Nuevo" : "Try Again"}</button>
            </div>
          ) : mode === "renting" && rental ? (
            <>
              <Card style={{textAlign:"center", borderTop:"3px solid " + C.purple, padding:"28px 24px"}}>
                <SLabel color={C.purple}>✈️ {lang === "es" ? "PUNTAJE DE RENTA" : "RENTAL DEAL SCORE"}</SLabel>
                <Gauge score={rental.dealScore} animate={true}/>
                <p style={{fontSize:15, color:C.text, maxWidth:360, margin:"0 auto 12px"}}>{rental.verdict}</p>
                {rental.weatherWarning && <div style={{background:C.red+"15", border:"1px solid " + C.red + "40", borderRadius:8, padding:"10px 14px", fontSize:13, color:C.red, fontWeight:700}}>⚠️ {rental.weatherWarning}</div>}
              </Card>
              <Card style={{borderLeft:"3px solid " + C.purple}}>
                <SLabel color={C.purple}>🚗 {lang === "es" ? "VEHÍCULO RECOMENDADO" : "RECOMMENDED VEHICLE"}</SLabel>
                <div style={{fontFamily:C.font, fontWeight:800, fontSize:22, marginBottom:4}}>{rental.recommendedVehicle}</div>
                <p style={{fontSize:13, color:C.text, marginBottom:12}}>{rental.vehicleReason}</p>
                {rental.familyTips && <div style={{background:C.blue+"10", border:"1px solid " + C.blue + "30", borderRadius:8, padding:12}}><div style={{fontSize:12, fontWeight:700, color:C.blue, marginBottom:6}}>👨‍👩‍👧‍👦 {lang === "es" ? "CONSEJOS PARA FAMILIAS" : "FAMILY TIPS"}</div><div style={{fontSize:13, color:C.text}}>{rental.familyTips}</div></div>}
              </Card>
              <Card>
                <SLabel>💰 {lang === "es" ? "ESTIMACIÓN DE PRECIO" : "RENTAL PRICE ESTIMATE"}</SLabel>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:8}}>
                  {[[lang==="es"?"Tarifa Diaria":"Daily Rate", rental.dailyRate],[lang==="es"?"Total del Viaje":"Total Trip", rental.totalCost],[lang==="es"?"Presupuesto":"Budget Rating", rental.budgetRating],[lang==="es"?"Mejor Valor":"Best Value", rental.bestValue]].map(([lb, val]) => (
                    <div key={lb} style={{background:"#0D0D14", borderRadius:8, padding:"12px 14px"}}>
                      <div style={{fontSize:11, color:C.text, marginBottom:4}}>{lb}</div>
                      <div style={{fontFamily:C.font, fontWeight:700, fontSize:16}}>{val}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <SLabel>🏢 {lang === "es" ? "EMPRESAS DE RENTA CERCA DE" : "RENTAL COMPANIES NEAR"} {loc?.toUpperCase()}</SLabel>
                <div style={{display:"flex", flexDirection:"column", gap:8, marginTop:8}}>
                  {rental.companies?.map((co, i) => (
                    <div key={co.name} style={{background:"#0D0D14", borderRadius:8, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontFamily:C.font, fontWeight:700, fontSize:14, marginBottom:2}}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]} {co.name} <span style={{color:C.accent, fontSize:12}}>★{co.rating}</span></div>
                        <div style={{fontSize:12, color:C.text}}>{co.note}</div>
                      </div>
                      <div style={{fontFamily:C.font, fontWeight:700, fontSize:14, color:C.green, textAlign:"right"}}>{co.priceRange}<br/><span style={{fontSize:11, color:C.muted, fontWeight:400}}>/day</span></div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <SLabel>PROS & CONS — {rental.recommendedVehicle?.toUpperCase()}</SLabel>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:10}}>
                  <div><div style={{fontSize:12, fontWeight:700, color:C.green, marginBottom:8}}>✓ PROS</div>{rental.pros?.map(p => <div key={p} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:6}}><span style={{color:C.green}}>+</span>{p}</div>)}</div>
                  <div><div style={{fontSize:12, fontWeight:700, color:C.red, marginBottom:8}}>✗ CONS</div>{rental.cons?.map(c => <div key={c} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:6}}><span style={{color:C.red}}>–</span>{c}</div>)}</div>
                </div>
              </Card>
              <ClimateCard climate={climate} location={loc} zip={rental.answers?.destination} vt="car"/>
              <Card style={{textAlign:"center", border:"2px solid " + C.purple, boxShadow:"0 0 40px " + C.purple + "18", padding:"26px 20px"}}>
                <div style={{fontFamily:C.font, fontWeight:800, fontSize:19, marginBottom:8}}>🔒 {lang === "es" ? "Desbloquear Reporte Pro de Renta" : "Unlock Full Rental Pro Report"}</div>
                <p style={{fontSize:14, color:C.text, marginBottom:18}}>{lang === "es" ? "Disponibilidad en tiempo real para tu viaje a" : "Real-time availability for your trip to"} {loc || "your destination"}.</p>
                <button onClick={() => setScreen("pricing")} style={{width:"100%", background:C.purple, color:"#0A0A0F", border:"none", borderRadius:8, padding:"14px 0", fontFamily:C.font, fontWeight:800, fontSize:16, cursor:"pointer"}}>{lang === "es" ? "Prueba Gratis 7 Días → $12.99/mes" : "Start 7-Day Free Trial → $12.99/mo"}</button>
                <p style={{fontSize:11, color:C.muted, marginTop:8}}>{lang === "es" ? "Sin tarjeta · Cancela cuando quieras" : "No credit card required · Cancel anytime"}</p>
              </Card>
              <button onClick={restart} style={{width:"100%", background:"transparent", color:C.muted, border:"1px solid " + C.border, borderRadius:8, padding:"12px 0", cursor:"pointer", fontFamily:C.body, fontSize:14}}>{lang === "es" ? "← Planificar Otro Viaje" : "← Plan Another Trip"}</button>
            </>
          ) : results ? (
            <>
              <Card style={{textAlign:"center", padding:"28px 20px"}}>
                <div style={{fontFamily:C.font, fontSize:13, letterSpacing:2, color:C.accent, fontWeight:700, marginBottom:10}}>{lang === "es" ? "TU PUNTAJE DE TRATO" : "YOUR DEAL SCORE"}</div>
                <Gauge score={results.dealScore} animate={true}/>
                <p style={{fontSize:15, color:C.text, maxWidth:360, margin:"0 auto 12px"}}>{results.dealVerdict}</p>
                <div style={{fontSize:13, color:C.text, fontStyle:"italic"}}>{results.marketNote}</div>
              </Card>
              <TradeInCard ti={results.tradeInData}/>
              <ClimateCard climate={climate} location={loc} zip={results.answers?.zip} vt={results.answers?.vehicleType}/>
              <Card>
                <SLabel>{lang === "es" ? "ESTIMACIÓN DE PRECIO" : "PRICE ESTIMATE"}</SLabel>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:8}}>
                  {[[lang==="es"?"Precio de Mercado":"Market Price","$"+results.priceRange?.low?.toLocaleString()+"–$"+results.priceRange?.high?.toLocaleString()],[lang==="es"?"Precio Final":"Out the Door","~$"+results.outTheDoor?.toLocaleString()],[lang==="es"?"Pago Mensual":"Monthly Payment","$"+results.monthlyPayment?.low+"–$"+results.monthlyPayment?.high+"/mo"],[lang==="es"?"Rango APR":"APR Range",results.monthlyPayment?.apr]].map(([lb, val]) => (
                    <div key={lb} style={{background:"#0D0D14", borderRadius:8, padding:"12px 14px"}}>
                      <div style={{fontSize:11, color:C.text, marginBottom:4}}>{lb}</div>
                      <div style={{fontFamily:C.font, fontWeight:700, fontSize:17}}>{val}</div>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:11, color:C.text, marginTop:10}}>* {lang === "es" ? "Estimaciones basadas en datos de mercado. Costo total en" : "Estimates based on market data. Total loan cost over"} {results.monthlyPayment?.term} {lang === "es" ? "meses" : "months"}: ~${results.totalLoanCost?.toLocaleString()}</p>
              </Card>
              <Card style={{borderLeft:"3px solid " + C.accent}}>
                <SLabel>{lang === "es" ? "💡 CONSEJO DE NEGOCIACIÓN" : "💡 NEGOTIATION TIP"}</SLabel>
                <p style={{fontSize:14, lineHeight:1.6, marginTop:6, color:C.text}}>{results.dealerTip}</p>
              </Card>
              <Card>
                <SLabel>{lang === "es" ? "PROS Y CONTRAS" : "PROS & CONS"} — {results.answers?.vehicle?.toUpperCase()}</SLabel>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:10}}>
                  <div><div style={{fontSize:12, fontWeight:700, color:C.green, marginBottom:8}}>✓ {lang === "es" ? "PROS" : "PROS"}</div>{results.pros?.map(p => <div key={p} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:6}}><span style={{color:C.green}}>+</span>{p}</div>)}</div>
                  <div><div style={{fontSize:12, fontWeight:700, color:C.red, marginBottom:8}}>✗ {lang === "es" ? "CONTRAS" : "CONS"}</div>{results.cons?.map(c => <div key={c} style={{fontSize:13, color:C.text, marginBottom:6, display:"flex", gap:6}}><span style={{color:C.red}}>–</span>{c}</div>)}</div>
                </div>
              </Card>
              <Card>
                <SLabel color={C.red}>🚩 {lang === "es" ? "SEÑALES DE ALERTA" : "RED FLAGS TO WATCH FOR"}</SLabel>
                {results.redFlags?.map(f => <div key={f} style={{fontSize:13, color:C.text, marginBottom:8, display:"flex", gap:8}}><span style={{color:C.red}}>!</span>{f}</div>)}
              </Card>
              {results.beginnerWarning && <Card style={{borderLeft:"3px solid " + C.blue}}><SLabel color={C.blue}>🪖 {lang === "es" ? "NOTA DE SEGURIDAD" : "SAFETY NOTE"}</SLabel><p style={{fontSize:14, lineHeight:1.6, marginTop:6}}>{results.beginnerWarning}</p></Card>}
              <InsuranceCard ins={results.insuranceEstimate} lang={lang}/>
              <BestTimeToBuy lang={lang}/>
              <NearMe zip={results.answers?.zip} vehicle={results.answers?.vehicle} lang={lang}/>
              <CheatSheet results={results} lang={lang}/>
              <AskAI results={results} cmpResults={cmpResults} lang={lang}/>
              <ShareBtn results={results} lang={lang}/>
              <CompareBtn lang={lang} onClick={() => { setCmpResults(results); setStep(0); setAns({}); setResults(null); setClimate(null); setLoc(null); setScreen("intake"); }}/>
              <RateXP lang={lang}/>
              <Card style={{textAlign:"center", border:"2px solid " + C.accent, boxShadow:"0 0 40px " + C.accent + "18", padding:"26px 20px"}}>
                <div style={{fontFamily:C.font, fontWeight:800, fontSize:19, marginBottom:8}}>🔒 {lang === "es" ? "Desbloquear Reporte Pro" : "Unlock Full Pro Report"}</div>
                <p style={{fontSize:14, color:C.text, marginBottom:18}}>{lang === "es" ? "Puntaje de confiabilidad, costos de reparación y dealers clasificados cerca de" : "Full reliability score, repair costs, and ranked dealers near"} {loc || ("ZIP " + results.answers?.zip)}.</p>
                <button onClick={() => setScreen("pricing")} style={{width:"100%", background:C.accent, color:"#0A0A0F", border:"none", borderRadius:8, padding:"14px 0", fontFamily:C.font, fontWeight:800, fontSize:16, cursor:"pointer"}}>{lang === "es" ? "Prueba Gratis 7 Días → $12.99/mes" : "Start 7-Day Free Trial → $12.99/mo"}</button>
                <p style={{fontSize:11, color:C.muted, marginTop:8}}>{lang === "es" ? "Sin tarjeta · Cancela cuando quieras" : "No credit card required · Cancel anytime"}</p>
              </Card>
              <button onClick={restart} style={{width:"100%", background:"transparent", color:C.muted, border:"1px solid " + C.border, borderRadius:8, padding:"12px 0", cursor:"pointer", fontFamily:C.body, fontSize:14}}>{lang === "es" ? "← Hacer Otra Estimación" : "← Run Another Estimate"}</button>
            </>
          ) : null}
        </div>
      )}

      {/* PRICING */}
      {screen === "pricing" && <>
        <Pricing onUpgrade={() => setScreen("home")} lang={lang}/>
        <div style={{textAlign:"center", padding:"0 24px 60px"}}>
          <button onClick={() => setScreen("home")} style={{background:C.accent, color:"#0A0A0F", border:"none", borderRadius:8, padding:"16px 36px", fontFamily:C.font, fontWeight:800, fontSize:18, letterSpacing:1, cursor:"pointer"}}>{lang === "es" ? "Empezar Gratis →" : "Get Started Free →"}</button>
        </div>
      </>}

      <div style={{borderTop:"1px solid " + C.border, padding:"18px 24px", textAlign:"center"}}>
        <p style={{fontSize:11, color:C.text}}>{lang === "es" ? "Clutch · Todas las estimaciones son aproximadas y solo para fines informativos." : "Clutch · All estimates are approximate and for informational purposes only."}</p>
      </div>
    </div>
  );
}