const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {Analyzer,NoteStore,hash,relocate,findTerm,safeFixes,translateError}=require('../dist/core.cjs');
const analyzer=new Analyzer();
before(()=>analyzer.init(path.resolve(__dirname,'../dist')));
after(()=>analyzer.dispose());
test('Python AST extracts real functions without counting strings/comments',()=>{
 const code='# def fake():\ntext = "def fake2():"\ndef add(a, b):\n    return a + b\n';
 const result=analyzer.analyze(code,'python','service.py');assert.equal(result.functions,1);assert.equal(result.syntax.length,0);assert.equal(result.health.length,0);
});
test('decorators and imports receive distinct responsibility regions',()=>{
 const result=analyzer.analyze('from fastapi import FastAPI\napp = FastAPI()\n@app.get("/users")\ndef users():\n    return []\n','python','app.py');
 assert.ok(result.regions.some(r=>r.layer==='route'&&r.start===2));assert.ok(result.regions.some(r=>r.layer==='utility'&&r.start===0));
});
test('long functions, nesting, parameters and unused local candidates',()=>{
 const code='def build(a, b, c, d, e, f):\n    unused = 42\n    if a:\n        for x in b:\n            if x:\n                if c:\n                    if d:\n                        return e + f\n    return None\n';
 const result=analyzer.analyze(code,'python','service.py',{functionLines:5,nestingDepth:4,parameterCount:5});
 assert.deepEqual(new Set(result.health.map(i=>i.type)),new Set(['long_function','deep_nesting','long_params','unused_variable']));
});
test('scope-sensitive unused candidates preserve closures, dynamic access and ignored names',()=>{
 const code='def outer():\n    captured = 1\n    _ignored = 2\n    def inner():\n        return captured\n    return inner\n\ndef dynamic():\n    value = 1\n    return locals()\n';
 assert.equal(analyzer.analyze(code,'python','x.py').health.filter(i=>i.type==='unused_variable').length,0);
});
test('duplicate bodies use token identity without collapsing literal values',()=>{
 const fn=(name,value)=>`def ${name}():\n    a = ${value}\n    b = 2\n    c = a + b\n    return c\n`;
 const result=analyzer.analyze(fn('one',1)+fn('two',1)+fn('three',3),'python','x.py');assert.equal(result.health.filter(i=>i.type==='duplicate_code').length,1);
});
test('HTML parser returns UI regions and accessible image hint',()=>{
 const result=analyzer.analyze('<html><body><img src="a.png"><img src="b.png" alt=""></body></html>','html','index.html');assert.equal(result.regions[0].layer,'ui');assert.equal(result.health.length,1);assert.equal(result.health[0].type,'accessibility');
});
test('syntax errors are detected and narrow colon edit improves parse',()=>{
 const code='def f(x):\n    if x:\n        return 1\n    else\n        return 2\n';const fixes=safeFixes(code,'python');assert.equal(fixes.length,1);const f=fixes[0];const fixed=code.slice(0,f.start)+f.replacement+code.slice(f.end);assert.ok(analyzer.analyze(code,'python','x.py').syntax.length>0);assert.equal(analyzer.analyze(fixed,'python','x.py').syntax.length,0);
});
test('safe fixes do not mutate comments, triple strings, ordinary strings or valid colons',()=>{
 const code='text = """\nelse\ntry\nfinally\n"""\n# else\ntext2 = "else"\nelse:\n';assert.deepEqual(safeFixes(code,'python'),[]);assert.deepEqual(safeFixes('else','html'),[]);
 assert.equal(safeFixes('try\r\n    pass\r\n','python')[0].start,3);
});
const makeNote=(selectedText)=>({id:'n1',uri:'file:///workspace/demo.py',start:0,end:selectedText.length,selectedText,codeHash:hash(selectedText),content:'中文标注 <script> & SQL \' ',createdAt:'2026-01-01',updatedAt:'2026-01-01',status:'active',author:'test'});
test('anchor relocates uniquely, rejects duplicates and detects mutations',()=>{
 const note=makeNote('print("你好🌱")');const moved=relocate(note,'# heading\r\n'+note.selectedText);assert.equal(moved.start,11);assert.equal(moved.status,'active');assert.equal(relocate(note,note.selectedText+'\n'+note.selectedText).status,'stale');assert.equal(relocate(note,'print("changed")').status,'stale');assert.equal(relocate({...note,codeHash:'bad'},note.selectedText).status,'stale');
});
test('SQLite survives reopen, isolates URIs, merges separate instances and parameterizes data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhima-store-'));try{
 const file=path.join(dir,'notes.sqlite');const a=new NoteStore(file,path.resolve(__dirname,'../dist'));const b=new NoteStore(file,path.resolve(__dirname,'../dist'));await a.init();await b.init();a.put(makeNote('中文'));b.put({...makeNote('other'),id:'n2',uri:'file:///workspace/two.py'});assert.equal(a.list().length,2);assert.equal(b.list('file:///workspace/demo.py')[0].content,makeNote('中文').content);a.delete('n1',a.list().find(n=>n.id==='n1').revision);assert.equal(b.list().length,1);b.record({uri:'file:///workspace/two.py',title:'修复',time:'now'});assert.equal(a.history()[0].title,'修复');assert.equal(fs.readFileSync(file).subarray(0,15).toString(),'SQLite format 3');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('dictionary distinguishes Python class from HTML class and supports aliases',()=>{
 assert.equal(findTerm('class','python').title,'类');assert.equal(findTerm('class','html').title,'样式类');assert.equal(findTerm('await','python').key,'async');assert.equal(findTerm('def','html'),undefined);
});
test('diagnostic explanations preserve uncertainty and do not confuse unused with undefined',()=>{
 assert.equal(translateError('TypeError: cannot concatenate').title,'数据类型不匹配');assert.equal(translateError('x is not accessed').title,'变量尚未使用');assert.equal(translateError('mystery failure').title,'暂未匹配到中文规则');
});
test('beginner glossary covers installation and learning terms and prefers an exact key over an alias',()=>{
 for(const word of ['工作区','函数','VSIX','接口','锚点','npm','WASM'])assert.ok(findTerm(word,'python'),word);
 assert.equal(findTerm('Token','python').key,'Token');
 assert.equal(findTerm('workspace','python').key,'工作区');
});
