import { readFileSync } from 'node:fs';
import { fitComps, scoreProtocol, exp } from '../lib/comps.ts';
const snap = JSON.parse(readFileSync('/home/hatch/workspace/makefun/token-radar/kit/input/snapshot.json','utf8'));
const m = fitComps(snap.protocols, snap.as_of);
const W = new Set(snap.watchlist);
const pre = snap.protocols.filter((p:any)=>!(p.gecko_id||p.symbol)&&p.tvl_usd>=5e6);
const rows = pre.map((p:any)=>{const s=scoreProtocol(m,p); const logN = m.curve.a + m.curve.b*Math.log(p.tvl_usd); const discount=Math.max(0, Math.log(2)-(logN-s.centralLog)); return {p, c:Math.exp(s.centralLog), h:Math.exp(s.highLog), r:(s.centralLog-logN)/Math.LN10, x:discount/Math.LN10};});
rows.sort((a:any,b:any)=>b.c-a.c);
rows.forEach((r:any,i:number)=>console.log(String(i+1).padStart(3), (r.p.tvl_usd/1e6).toFixed(0).padStart(6), String(r.p.change_7d).padStart(8), (r.p.category??'').padEnd(20).slice(0,20), (r.c/1e6).toExponential(2).padStart(8), (r.h/1e6).toExponential(2).padStart(8), 'ratio10^'+r.r.toFixed(2), 'x'+r.x.toFixed(2), W.has(r.p.slug)?'W':'', r.p.name.slice(0,24)));
