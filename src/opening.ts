import type {DownloadState} from './downloads';
const $=<E extends HTMLElement>(id:string)=>document.getElementById(id) as E;
const text=(id:string,value:string)=>{const node=$(id);if(node.textContent!==value)node.textContent=value;};
export class OpeningScreen {
  private pending?:DownloadState;private frame=0;private lastStage='';
  constructor(){
    $('load-retry').onclick=()=>location.reload();
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('opening').hidden)($('home-controls') as HTMLDetailsElement).open=false;});
  }
  downloads=(state:DownloadState)=>{this.pending=state;if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.drawDownload();});};
  private drawDownload(){
    const s=this.pending;if(!s)return;
    text('loading-percent',s.percent+'%');text('loading-bytes',(s.loaded/1e6).toFixed(1)+' / '+(s.total/1e6).toFixed(1)+' MB');
    text('loading-files',s.completed+' / '+s.files+' files');$('loading-fill').style.width=s.percent+'%';
    const bar=$('loading-progress');bar.setAttribute('aria-valuenow',String(s.percent));bar.setAttribute('aria-valuetext',`${s.percent}% of game data received`);
    if(s.completed===s.files){
      text('loading-title','Preparing the world');
      text('loading-status','Download complete.');
      this.step('prepare');
    }
    else if(s.label!==this.lastStage){this.lastStage=s.label;text('loading-status',s.label);}
  }
  stage(label:string){this.drawDownload();text('loading-status',label);text('loading-title','Preparing the world');this.step('prepare');}
  private step(value:string){$('opening').dataset.stage=value;}
  ready(){
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}this.drawDownload();this.step('ready');
    $('opening').dataset.preview='live';$('opening').setAttribute('aria-busy','false');text('loading-status','Ready to drive.');text('drive-label','Drive the coast');text('preview-label','Live preview');
    ($('drive') as HTMLButtonElement).disabled=false;$('drive').setAttribute('aria-label','Drive the coast');
  }
  fail(error:unknown){
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}this.drawDownload();this.step('error');$('opening').setAttribute('aria-busy','false');
    text('loading-title','Could not load the game');text('loading-status',error instanceof Error?error.message:'Check your connection and retry.');
    $('load-retry').hidden=false;($('drive') as HTMLButtonElement).disabled=true;
  }
}
