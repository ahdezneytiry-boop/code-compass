const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {buildSync}=require('esbuild');
const {NoteStore,hash}=require('../dist/core.cjs');
const bundle=buildSync({entryPoints:[path.resolve(__dirname,'../src/backupCommands.ts')],bundle:true,write:false,platform:'node',format:'cjs',external:['vscode']}).outputFiles[0].text;
const file=p=>({scheme:'file',fsPath:path.resolve(p),toString(){return pathToFileURL(this.fsPath).href}});
async function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhima-command-'));const root=path.join(dir,'项目');fs.mkdirSync(root);
 const store=new NoteStore(path.join(dir,'notes.sqlite'),path.resolve(__dirname,'../dist'));await store.init();
 const selectedText='print("你好")';fs.writeFileSync(path.join(root,'例子.py'),selectedText);
 const now=new Date().toISOString();store.put({id:'n1',uri:file(path.join(root,'例子.py')).toString(),start:0,end:selectedText.length,selectedText,codeHash:hash(selectedText),content:'笔记',createdAt:now,updatedAt:now,status:'active',author:'我'});
 const ui={messages:[],errors:[],saved:file(path.join(dir,'备份.json')),opened:undefined,confirm:true,choice:'skip',onConfirm:undefined,refresh:0};const commands=new Map();
 const vscode={Uri:{file,parse:s=>file(fileURLToPath(s)),joinPath:(u,...parts)=>file(path.join(u.fsPath,...parts))},
 workspace:{workspaceFolders:[{name:'项目',uri:file(root)}],getConfiguration:()=>({get:(_,fallback)=>fallback}),fs:{writeFile:async(u,data)=>fs.writeFileSync(u.fsPath,data),readFile:async u=>fs.readFileSync(u.fsPath),stat:async u=>fs.statSync(u.fsPath)}},
 window:{showSaveDialog:async()=>ui.saved,showOpenDialog:async()=>ui.opened,showQuickPick:async items=>items.find(i=>i.policy===ui.choice)||items[0],showErrorMessage:async m=>ui.errors.push(m),showInformationMessage:async(m,opts,...actions)=>{ui.messages.push({m,opts});if(actions.length){if(ui.onConfirm)ui.onConfirm();return ui.confirm?actions[0]:undefined}}},
 commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return {dispose(){}}}}};
 const mod={exports:{}};vm.runInNewContext(bundle,{module:mod,exports:mod.exports,require:n=>n==='vscode'?vscode:require(n),Buffer});
 mod.exports.registerBackupCommands({subscriptions:[]},store,u=>u.fsPath.startsWith(root+path.sep),()=>ui.refresh++);
 return {dir,root,store,ui,commands,dispose:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('export and restore command dialogs round-trip notes, with cancellation and duplicate summaries',async()=>{
 const f=await setup();try{
 await f.commands.get('zhima.exportNotes')();assert.equal(f.ui.errors.length,0);assert.ok(fs.existsSync(f.ui.saved.fsPath));
 f.ui.opened=[f.ui.saved];const n=f.store.list()[0];f.store.delete(n.id,n.revision);
 f.ui.confirm=false;await f.commands.get('zhima.importNotes')();assert.equal(f.store.list().length,0);
 f.ui.confirm=true;await f.commands.get('zhima.importNotes')();assert.equal(f.store.list().length,1);assert.equal(f.store.list()[0].content,'笔记');assert.equal(f.ui.refresh,1);
 await f.commands.get('zhima.importNotes')();assert.equal(f.store.list().length,1);assert.match(f.ui.messages.at(-1).m,/相同内容跳过 1 条/);
 assert.equal(f.ui.errors.length,0);
 }finally{f.dispose()}
});
test('restore command preserves both conflict versions and rejects a post-preview file change',async()=>{
 const f=await setup();try{
 await f.commands.get('zhima.exportNotes')();f.ui.opened=[f.ui.saved];const n=f.store.list()[0];f.store.put({...n,content:'当前窗口的内容'});f.ui.choice='keepBoth';
 await f.commands.get('zhima.importNotes')();assert.equal(f.store.list().length,2);assert.ok(f.store.list().some(n=>n.content==='当前窗口的内容'));assert.equal(f.ui.errors.length,0);
 f.ui.onConfirm=()=>fs.writeFileSync(path.join(f.root,'例子.py'),'# moved\nprint("你好")');
 await f.commands.get('zhima.importNotes')();assert.match(f.ui.errors.at(-1),/预览后项目文件发生变化/);assert.equal(f.store.list().length,2);
 }finally{f.dispose()}
});
test('invalid backup and cancelled file picker leave notes untouched',async()=>{
 const f=await setup();try{
 await f.commands.get('zhima.importNotes')();assert.equal(f.store.list().length,1);assert.equal(f.ui.messages.length,0);
 fs.writeFileSync(f.ui.saved.fsPath,'{"kind":"bad"}');f.ui.opened=[f.ui.saved];await f.commands.get('zhima.importNotes')();assert.match(f.ui.errors.at(-1),/不是完整的知码笔记备份/);assert.equal(f.store.list().length,1);
 }finally{f.dispose()}
});
