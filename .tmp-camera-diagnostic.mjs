import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
try {
const {parseLevel,parseRuntimeTuning}=await server.ssrLoadModule('/src/content/index.ts');
const {decodeReplay,ReplayIntentSource,BUILD_HASH}=await server.ssrLoadModule('/src/core/index.ts');
const {World}=await server.ssrLoadModule('/src/tools/route-solver/world.ts');
const c=await server.ssrLoadModule('/src/render/camera.ts');
const tuning=parseRuntimeTuning(JSON.parse(await readFile('content/tuning/runtime.json','utf8')));
for(const [id,anchor,shot] of [['1-2','m4',667],['1-3','a7',1187]]) {
const level=parseLevel(JSON.parse(await readFile(`content/levels/${id}.json`,'utf8')));
const solution=JSON.parse(await readFile(`content/solutions/${id}.json`,'utf8'));
const replay=decodeReplay(solution.replay,BUILD_HASH).replay;
const world=World.create(level,tuning), source=new ReplayIntentSource(replay);
const scale=c.cameraScale(1920,1080,c.DEFAULT_CAMERA), viewW=1920/scale,viewH=1080/scale;
const framed=c.framedAnchors(level.anchors),idx=level.anchors.findIndex(a=>a.id===anchor);
let eased=null,resets=-1;
while(world.tick<shot+2){
world.step({intents:t=>source.poll(t)});const s=world.sim.snapshot(),snap=eased===null||s.resets!==resets; resets=s.resets;
const raw=c.cameraTarget(s.player.position,s.player.velocity,c.DEFAULT_CAMERA);
const target=c.attentionTarget(raw,s.player.position,s.player.velocity,framed,viewW,viewH,tuning.sim.rope.maxLength,c.HUD_BAND_PX/scale,level.solids);
eased=c.stepCamera(eased??target,target,1/60,c.DEFAULT_CAMERA,snap);const centre=c.clampToBounds(eased,viewW,viewH,level.bounds),a=s.anchors[idx];
if(world.tick>=shot-45 && world.tick%5===0 || world.tick===shot) console.log(JSON.stringify({id,tick:world.tick,p:s.player.position,v:s.player.velocity,a,raw,target,eased,centre,dy:a.y-centre.y,dx:a.x-centre.x,viewH,viewW}));
}
}
} finally {await server.close()}
