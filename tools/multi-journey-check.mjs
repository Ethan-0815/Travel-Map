// Real map, camera, route tweens and controller with isolated memory records.
import {readFileSync} from 'node:fs';
const src=readFileSync('tools/requested-interactions-check.mjs','utf8');
const header=src.slice(0,src.indexOf('  console.log(await evaluate'))
  .replace('const port = 9386','const port = 9394')
  .replace("'--headless=new'", "'--headless=new', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'");
await import('data:text/javascript,'+encodeURIComponent(header+' globalThis.multiTools={send,evaluate,ws,edge}; }catch(e){ws?.close();edge.kill();throw e;}'));
const {send,evaluate,ws,edge}=globalThis.multiTools;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=name=>evaluate(`import('/tools/multi-journey-browser.js').then(m=>m.${name}())`);
try {
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  console.log('Browser visibility:', await evaluate('document.visibilityState'));
  for(const name of ['setup','replay','restart','reenter']) console.log(await run(name));
  await send('Page.reload',{ignoreCache:true});await sleep(500);
  for(let i=0;i<80 && !await evaluate('window.reviewReady===true');i++)await sleep(100);
  console.log('After full page reload:',await run('setup'));
  await send('Page.reload',{ignoreCache:true});await sleep(500);
  for(let i=0;i<80 && !await evaluate('window.reviewReady===true');i++)await sleep(100);
  console.log(await run('initialReenter'));
} catch(error) { console.error(error.message);process.exitCode=1; }
finally { ws.close();edge.kill(); }
