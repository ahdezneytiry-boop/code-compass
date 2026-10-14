import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {ProjectReader,scanProject}=require('../dist/core.cjs');
const root=path.resolve(import.meta.dirname,'..');const reader=new ProjectReader();await reader.init(path.join(root,'dist'));
const project=await scanProject(path.join(root,'examples','idea-notes'),reader);
const bridge=`(()=>{let saved;try{saved=JSON.parse(sessionStorage.getItem('reader-preview-state'))}catch{}window.acquireVsCodeApi=()=>({getState:()=>saved,setState:s=>{saved=s;sessionStorage.setItem('reader-preview-state',JSON.stringify(s))},postMessage:async m=>{if(m.action==='ready'||m.action==='refresh'){const p=await fetch('/project').then(r=>r.json());window.postMessage({kind:'project',project:p,completed:[]},'*')}else if(m.action==='read'){window.postMessage({kind:'read',file:m.file,chapter:m.chapter},'*')}else window.postMessage({kind:'notice',message:'这是插件实际界面的浏览器预览，正在读取示例项目。打开本机文件夹、对照编辑器与复制提问请在 VS Code 插件中使用。'},'*')}});let stamp;setInterval(async()=>{try{const next=await fetch('/stamp').then(r=>r.text());if(stamp&&next!==stamp)location.reload();stamp=next}catch{}},1200)})();`;
const files={'/reader.css':'media/reader.css','/reader.js':'media/reader.js'};
http.createServer(async(req,res)=>{try{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/project'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(await fs.readFile(path.join(root,'test-results/reader-preview.json'),'utf8').catch(()=>JSON.stringify(project)));return;}
 if(req.url==='/stamp'){const stats=await Promise.all(['media/reader.html','media/reader.css','media/reader.js','test-results/reader-preview.json'].map(p=>fs.stat(path.join(root,p)).catch(()=>({mtimeMs:0}))));res.end(stats.map(s=>s.mtimeMs).join(':'));return;}
 if(req.url==='/bridge.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bridge);return;}
 if(req.url==='/'||req.url==='/index.html'){let html=await fs.readFile(path.join(root,'media','reader.html'),'utf8');html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace('{{CSS}}','/reader.css').replace('{{JS}}','/reader.js').replace('<body>','<body><div style="padding:7px 18px;background:#326c51;color:#fff;font:12px/1.5 system-ui">开发中 · 实时预览　|　实际插件界面 + 灵感便签示例代码　|　修改后自动刷新</div><script src="/bridge.js"></script>');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(files[req.url]){res.setHeader('Content-Type',req.url.endsWith('css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(await fs.readFile(path.join(root,files[req.url])));return;}
 res.writeHead(404);res.end('Not found');
 }catch(e){res.writeHead(500);res.end('Preview error');}}).listen(4317,'127.0.0.1',()=>console.log('Reader preview: http://127.0.0.1:4317'));
