const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {NoteStore,NoteConflictError,hash,createBackup,parseBackup,prepareRestore,safeRelativePath,MAX_BACKUP_BYTES}=require('../dist/core.cjs');
const wasm=path.resolve(__dirname,'../dist');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhima-backup-'));const root=path.join(dir,'项目');fs.mkdirSync(root);return {dir,root,dispose:()=>fs.rmSync(dir,{recursive:true,force:true})};}
function note(root,id='n1',content='我的理解 <script> & 🌱'){const selectedText='print("你好🌱")\r\n';return {id,uri:pathToFileURL(path.join(root,'中文.py')).href,start:0,end:selectedText.length,selectedText,codeHash:hash(selectedText),content,createdAt:'2026-09-24T00:00:00.000Z',updatedAt:'2026-09-24T00:00:00.000Z',status:'active',author:'我'};}
async function store(dir,name='notes.sqlite'){const s=new NoteStore(path.join(dir,name),wasm);await s.init();return s;}
test('backup round-trip moves Chinese paths and CRLF/emoji snapshots into a new project',()=>{
 const f=fixture();try{const n=note(f.root),backup=createBackup([n],f.root).backup;
 assert.equal(backup.notes[0].path,'中文.py');assert.equal('uri' in backup.notes[0],false);assert.equal('revision' in backup.notes[0],false);
 const parsed=parseBackup('\uFEFF'+JSON.stringify(backup));const target=path.join(f.dir,'另一个项目');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'中文.py'),'# 说明\r\n'+n.selectedText);
 const restored=prepareRestore(parsed,target,()=>true);assert.equal(restored.skipped.length,0);assert.equal(restored.notes[0].uri,pathToFileURL(path.join(target,'中文.py')).href);assert.equal(restored.notes[0].content,n.content);assert.equal(restored.notes[0].start,6);assert.equal(restored.notes[0].status,'active');
 }finally{f.dispose()}
});
test('bad paths, tampered hash, unknown format and malformed rows reject the entire backup',()=>{
 const f=fixture();try{const b=createBackup([note(f.root)],f.root).backup;
 for(const p of ['../evil.py','C:/evil.py','/tmp/e.py','a\\b.py','a//b.py','a/./b.py','a/../b.py','a./b.py','a /b.py','a.py:stream','a.js','CON.py','a/LPT1.html','NUL/x.py','a\u0000.py'])assert.equal(safeRelativePath(p),false,p);
 for(const change of [x=>x.version=2,x=>x.notes[0].path='../x.py',x=>x.notes[0].content='',x=>x.notes[0].codeHash='wrong',x=>x.notes[0].end=999,x=>x.notes[0].start=-1,x=>x.notes[0].author={},x=>x.notes[0].updatedAt='invalid',x=>x.notes.push(x.notes[0])]){const bad=structuredClone(b);change(bad);assert.throws(()=>parseBackup(JSON.stringify(bad)));}
 assert.throws(()=>parseBackup('{'));assert.throws(()=>parseBackup(' '.repeat(MAX_BACKUP_BYTES+1)),/10 MB/);
 }finally{f.dispose()}
});
test('unavailable and symlink-escaped files skip; changed or ambiguous snippets remain stale',()=>{
 const f=fixture();try{const b=createBackup([note(f.root)],f.root).backup;
 assert.deepEqual(prepareRestore(b,f.root,()=>true).skipped,['中文.py']);
 fs.writeFileSync(path.join(f.root,'中文.py'),'changed');assert.equal(prepareRestore(b,f.root,()=>true).notes[0].status,'stale');
 assert.equal(prepareRestore(b,f.root,()=>false).notes.length,0);
 fs.writeFileSync(path.join(f.root,'中文.py'),b.notes[0].selectedText.repeat(2));assert.equal(prepareRestore(b,f.root,()=>true).notes[0].status,'stale');assert.equal(prepareRestore(b,f.root,()=>true,1).notes.length,0);
 const outside=path.join(f.dir,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'中文.py'),b.notes[0].selectedText);fs.symlinkSync(outside,path.join(f.root,'link'),'junction');b.notes[0].path='link/中文.py';assert.equal(prepareRestore(b,f.root,()=>true).notes.length,0);
 }finally{f.dispose()}
});
test('export selects only the chosen project and keeps missing-file snapshots for later recovery',()=>{
 const f=fixture();try{const result=createBackup([note(f.root),note(f.dir,'outside')],f.root);assert.equal(result.backup.notes.length,1);assert.equal(result.skipped,1);}finally{f.dispose()}
});
test('same-note optimistic updates and deletes protect the newer content',async()=>{
 const f=fixture();try{const a=await store(f.dir),b=await store(f.dir);const first=a.put(note(f.root));assert.equal(first.revision,1);const stale=b.list()[0];
 const second=a.put({...first,content:'新内容'});assert.equal(second.revision,2);
 assert.throws(()=>b.put({...stale,content:'旧窗口输入'}),NoteConflictError);assert.throws(()=>b.delete(stale.id,stale.revision),NoteConflictError);assert.throws(()=>b.put(note(f.root)),NoteConflictError);
 assert.equal(a.list()[0].content,'新内容');a.delete(second.id,second.revision);assert.throws(()=>b.put(second),NoteConflictError);assert.equal(b.list().length,0);
 a.importNotes([note(f.root)],'skip');assert.ok(a.list()[0].revision>second.revision);assert.throws(()=>b.put({...stale,content:'删除前的草稿'}),NoteConflictError);
 }finally{f.dispose()}
});
test('legacy v0.2 rows default to revision 1 and upgrade without losing notes',async()=>{
 const f=fixture();try{const init=require('sql.js');const SQL=await init({locateFile:()=>path.join(wasm,'sql-wasm.wasm')});const db=new SQL.Database();db.run('CREATE TABLE notes(id TEXT PRIMARY KEY,uri TEXT NOT NULL,body TEXT NOT NULL)');const old=note(f.root);db.run('INSERT INTO notes VALUES(?,?,?)',[old.id,old.uri,JSON.stringify(old)]);fs.writeFileSync(path.join(f.dir,'notes.sqlite'),db.export());db.close();
 const s=await store(f.dir);assert.equal(s.list()[0].revision,1);s.put({...s.list()[0],content:'升级后'});assert.equal(s.list()[0].revision,2);assert.equal(s.list()[0].selectedText,old.selectedText);
 }finally{f.dispose()}
});
test('restore preview is read-only; collision decisions and repeated restores never overwrite',async()=>{
 const f=fixture();try{const s=await store(f.dir);s.put(note(f.root));const changed={...note(f.root),content:'来自备份的另一种理解'};
 assert.deepEqual(s.previewImport([changed],'skip'),{added:0,duplicates:0,conflicts:1,copies:0});assert.equal(s.list().length,1);
 assert.equal(s.importNotes([changed],'skip').added,0);assert.equal(s.importNotes([changed],'keepBoth').copies,1);assert.equal(s.list().length,2);assert.ok(s.list().some(n=>n.content===note(f.root).content));
 assert.equal(s.importNotes([changed],'keepBoth').duplicates,1);assert.equal(s.list().length,2);
 const newRow=note(f.root,'n2','另一条');assert.equal(s.previewImport([newRow],'skip').added,1);s.put(newRow);assert.equal(s.importNotes([newRow],'skip').duplicates,1);
 }finally{f.dispose()}
});
test('failed batch leaves the durable database intact and releases the lock',async()=>{
 const f=fixture();try{const s=await store(f.dir);s.put(note(f.root));const original=fs.readFileSync(path.join(f.dir,'notes.sqlite'));
 assert.throws(()=>s.importNotes([note(f.root,'n2','第二条'),{...note(f.root,'n3','第三条'),uri:null}],'skip'));
 assert.deepEqual(fs.readFileSync(path.join(f.dir,'notes.sqlite')),original);assert.equal(fs.existsSync(path.join(f.dir,'notes.sqlite.lock')),false);assert.equal(s.list().length,1);
 assert.equal(s.importNotes([note(f.root,'n2','第二条')],'skip').added,1);
 }finally{f.dispose()}
});
