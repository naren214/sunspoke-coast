import './style.css';
import './home.css';
import {GameDownloads} from './downloads';
import type {BootManifest} from './downloads';
import {OpeningScreen} from './opening';
const opening=new OpeningScreen();
const downloads=new GameDownloads(opening.downloads);
async function start(){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  let manifest:BootManifest;
  try{const response=await fetch('/boot-manifest.json',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Could not read the download list. Check your connection and retry.');manifest=await response.json();}finally{clearTimeout(timeout);}
  const [,engine]=await Promise.all([downloads.preload(manifest),import('./main')]);
  opening.stage('Unfolding the coastline');await new Promise(resolve=>requestAnimationFrame(resolve));
  await engine.boot(downloads,opening);
}
start().catch(error=>{console.error(error);opening.fail(error instanceof DOMException&&error.name==='AbortError'?Error('The connection took too long. Check your connection and retry.'):error);downloads.release();});
