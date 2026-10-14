const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {ProjectReader,scanProject}=require('../dist/core.cjs');const reader=new ProjectReader();
before(()=>reader.init(path.resolve(__dirname,'../dist')));after(()=>reader.dispose());
test('Python reading uses real function bodies and ignores function-like text in strings',()=>{
 const file=reader.read('main.py','text = "def fake():"\ndef greet(name):\n    """拼出问候"""\n    return "你好" + name\n\nif __name__ == "__main__":\n    print(greet("小林"))\n');
 assert.ok(file.entry);assert.equal(file.chapters.filter(c=>c.title.includes('一组处理步骤')).length,1);const chapter=file.chapters.find(c=>c.title.startsWith('greet'));assert.ok(chapter.summary.includes('name'));assert.ok(chapter.output.includes('"你好" + name'));assert.ok(chapter.terms.some(t=>t.word==='return'));assert.equal(chapter.start,1);
});
test('JavaScript event callback is not mislabeled as a variable declared inside it',()=>{
 const file=reader.read('app.js',"form.addEventListener('submit', (event) => {\n const idea = input.value.trim();\n if (!idea) return;\n notes.push(idea);\n input.value = '';\n});");const c=file.chapters[0];assert.match(c.title,/submit/);assert.doesNotMatch(c.title,/idea/);assert.match(c.summary,/触发/);assert.equal(c.output,'没有额外的值');assert.ok(c.steps.some(s=>s.includes('两端的空白')));assert.ok(c.steps.some(s=>s.includes('input.value')));
});
test('TypeScript and React JSX receive real chapters and do not execute code',()=>{
 const ts=reader.read('math.ts','export function double(value: number): number { return value * 2; }');assert.match(ts.chapters[0].title,/double/);assert.equal(ts.chapters[0].output,'value * 2');
 const jsx=reader.read('App.tsx','export default function App() { return <button>提交</button>; }');assert.equal(jsx.role,'页面与交互');assert.equal(jsx.hasErrors,false);assert.match(jsx.chapters[0].code,/<button>/);
});
test('HTML includes ordinary body divs and starts with visible content before head resources',()=>{
 const f=reader.read('index.html','<html><head><title>标题</title></head><body><div><h1>你好</h1><input placeholder="名字" required></div><script src="./app.js"></script></body></html>');assert.ok(f.chapters[0].summary.includes('你好'));assert.ok(f.chapters[0].steps.some(s=>s.includes('要求填写')));assert.ok(f.imports.includes('./app.js'));assert.match(f.chapters.at(-1).title,/资源/);
});
test('project scan resolves only existing local imports and reports read limits and symlink skips',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhima-read-'));try{
 fs.writeFileSync(path.join(dir,'index.html'),'<script src="./app.js"></script>');fs.writeFileSync(path.join(dir,'app.js'),"import {save} from './storage.js'; import remote from 'some-package';");fs.writeFileSync(path.join(dir,'storage.js'),'export const save = value => value;');fs.writeFileSync(path.join(dir,'README.md'),'# 测试项目\n\n用于存便签');fs.writeFileSync(path.join(dir,'big.py'),'a'.repeat(256*1024+1));fs.mkdirSync(path.join(dir,'node_modules'));fs.writeFileSync(path.join(dir,'node_modules','bad.js'),'throw new Error("never execute")');
 const external=fs.mkdtempSync(path.join(os.tmpdir(),'zhima-outside-'));try{fs.writeFileSync(path.join(external,'private.py'),'print("private")');fs.symlinkSync(external,path.join(dir,'linked'),'junction');const p=await scanProject(dir,reader);assert.equal(p.files.length,4);assert.equal(p.edges.length,2);assert.ok(p.skipped>=2);assert.ok(p.description.includes('测试项目'));assert.equal(p.files[0].path,'index.html');assert.ok(p.edges.some(e=>e.to==='storage.js'));assert.ok(!p.files.some(f=>f.path.includes('private')));}finally{fs.rmSync(external,{recursive:true,force:true});}
 await assert.rejects(()=>scanProject(dir,reader,{cancelled:()=>true}),/取消/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Python relative module references resolve inside the project',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhima-python-'));try{fs.mkdirSync(path.join(dir,'pkg'));fs.writeFileSync(path.join(dir,'pkg','main.py'),'from .service import greet\n');fs.writeFileSync(path.join(dir,'pkg','service.py'),'def greet():\n    return "hi"\n');const p=await scanProject(dir,reader);assert.deepEqual(p.edges,[{from:'pkg/main.py',to:'pkg/service.py',label:'引用'}]);}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
