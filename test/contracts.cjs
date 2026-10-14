const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const init=require('sql.js');const path=require('node:path');
test('future SQL schema enforces cross-project anchors, graph membership and term uniqueness',async()=>{
 const SQL=await init({locateFile:()=>path.resolve(__dirname,'../dist/sql-wasm.wasm')});const db=new SQL.Database();try{
 db.run(fs.readFileSync(path.join(__dirname,'../docs/schema-v2.sql'),'utf8'));assert.equal(db.exec('PRAGMA foreign_keys')[0].values[0][0],1);
 db.run("INSERT INTO workspaces VALUES ('w','demo','now','now',1); INSERT INTO projects VALUES ('p1','w','one','now','now',1),('p2','w','two','now','now',1)");
 db.run("INSERT INTO roots(id,project_id,display_name,canonical_uri,path_key) VALUES('r1','p1','one','file:///one','one'),('r2','p2','two','file:///two','two')");
 const h='a'.repeat(64);db.run('INSERT INTO files(id,project_id,root_id,relative_path,path_key,language,byte_size,content_hash) VALUES(?,?,?,?,?,?,?,?)',['f1','p1','r1','hello.py','hello.py','python',20,h]);
 assert.throws(()=>db.run('INSERT INTO files(id,project_id,root_id,relative_path,path_key,language,byte_size,content_hash) VALUES(?,?,?,?,?,?,?,?)',['bad','p2','r1','hello.py','hello.py','python',20,h]),/FOREIGN KEY|UNIQUE/);
 db.run("INSERT INTO flow_graphs VALUES('g1','p1','first','call','x','now'),('g2','p1','second','call','x','now')");
 db.run("INSERT INTO flow_nodes(id,project_id,graph_id,type,label) VALUES('n1','p1','g1','function','one'),('n2','p1','g2','function','two')");
 assert.throws(()=>db.run("INSERT INTO flow_edges VALUES('e','p1','g1','n1','n2','calls',1,'{}')"),/FOREIGN KEY/);
 db.run("INSERT INTO terms(id,scope_key,key,key_normalized,title,definition,language,source) VALUES('t1','builtin','def','def','function','demo','python','builtin')");
 assert.throws(()=>db.run("INSERT INTO terms(id,scope_key,key,key_normalized,title,definition,language,source) VALUES('t2','builtin','DEF','def','function','demo','python','builtin')"),/UNIQUE/);
 const annotation=['a1','p1','f1',0,0,0,1,0,1,'x',h,h,'note','me','active',1,'now','now'];db.run('INSERT INTO annotations VALUES('+annotation.map(()=>'?').join(',')+')',annotation);
 assert.throws(()=>db.run('INSERT INTO annotations VALUES('+annotation.map(()=>'?').join(',')+')',['a2','p2',...annotation.slice(2)]),/FOREIGN KEY/);
 assert.equal(db.exec('PRAGMA foreign_key_check').length,0);
 }finally{db.close()}
});
test('OpenAPI references, unique operations, path bindings and concurrency headers are complete',()=>{
 const api=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/openapi-v1.json'),'utf8'));assert.equal(api.openapi,'3.1.0');const names=new Set();
 function visit(value){if(!value||typeof value!=='object')return;if(value.$ref){let v=api;for(const segment of value.$ref.replace(/^#\//,'').split('/'))v=v?.[segment];assert.ok(v,`broken reference ${value.$ref}`)}for(const item of Object.values(value))visit(item)}visit(api);
 for(const [route,methods] of Object.entries(api.paths))for(const [verb,op] of Object.entries(methods)){
 assert.ok(!names.has(op.operationId));names.add(op.operationId);for(const [,name] of route.matchAll(/\{([^}]+)\}/g))assert.ok(op.parameters.some(p=>p.in==='path'&&p.name===name&&p.required));
 assert.ok(op.responses['401']);assert.ok(op.description.includes('DESIGN ONLY'));
 if(verb==='patch'||verb==='delete')assert.ok(op.parameters.some(p=>p.name==='If-Match'&&p.required));
 }
 assert.ok(names.size>=60);
});
