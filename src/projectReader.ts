import Parser from 'web-tree-sitter';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface Chapter {id:string;title:string;start:number;end:number;code:string;clipped:boolean;summary:string;input:string;output:string;steps:string[];terms:{word:string;meaning:string}[]}
export interface ReadingFile {path:string;language:string;role:string;reason:string;hash:string;chapters:Chapter[];imports:string[];entry:boolean;hasErrors:boolean}
export interface ReadingProject {name:string;description:string;descriptionSource:string;files:ReadingFile[];edges:{from:string;to:string;label:string}[];skipped:number;limited:boolean;readme?:string}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const short=(s:string,n=90)=>s.replace(/\s+/g,' ').trim().slice(0,n);
const all=(node:Parser.SyntaxNode,predicate:(n:Parser.SyntaxNode)=>boolean)=>{const out:Parser.SyntaxNode[]=[];const todo=[node];while(todo.length){const n=todo.pop()!;if(predicate(n))out.push(n);todo.push(...n.namedChildren.slice().reverse());}return out;};
const leafWords=(node:Parser.SyntaxNode)=>{const words:string[]=[];const todo=[node];while(todo.length){const n=todo.pop()!;if(['comment','string','string_content','text'].includes(n.type))continue;if(!n.childCount)words.push(n.text);else todo.push(...n.children.slice().reverse());}return [...new Set(words)];};
const field=(n:Parser.SyntaxNode,key:string)=>n.childForFieldName(key);
const str=(s:string)=>s.replace(/^['"`]|['"`]$/g,'');
const returned=(n:Parser.SyntaxNode)=>short(n.text.replace(/^return\s*/,'').replace(/;\s*$/,''))||'没有额外的值';
const languages:Record<string,string>={'.py':'python','.html':'html','.htm':'html','.js':'javascript','.jsx':'tsx','.mjs':'javascript','.cjs':'javascript','.ts':'typescript','.tsx':'tsx','.css':'css','.json':'json','.md':'markdown'};
export function readingLanguage(file:string){return languages[path.extname(file).toLowerCase()];}
const terms:Record<string,string>={import:'借用别处写好的工具或代码。',from:'说明工具是从哪里借来的。',def:'把一组步骤起个名字，之后可以调用。',return:'把这一步得到的结果交回去。',if:'只有条件成立，才走这一条分支。',for:'把一组数据逐个拿出来处理。',async:'这组步骤可以等待耗时操作。',await:'等这里的操作完成，再继续往下。',function:'把可以重复执行的步骤放在一起。',const:'给一个值起名字；这个名字不会重新指向另一个值。',let:'给一个值起名字，之后允许重新赋值。',export:'让其他文件也能使用这里的内容。',class:'把相关的数据和行为组织在一起。',useState:'给页面一份可以更新的状态；更新时会重新显示。',useEffect:'安排在页面渲染后执行的工作，具体时机看依赖列表。',fetch:'向一个地址发请求，结果通常需要等待。',form:'把用户填写的输入项组织在一起。',input:'让用户填写或选择内容。',button:'页面上的按钮；点击行为还要看绑定的处理代码。',div:'将一组页面内容放进同一个容器。',JSON:'一种表示数据的文字格式。'};
function callDescription(n:Parser.SyntaxNode){
 const target=field(n,'function')?.text??n.namedChildren[0]?.text??'某个步骤';const args=field(n,'arguments')?.text??'';
 const known:Record<string,string>={'print':'把内容显示到输出区','console.log':'把内容写到调试输出区','fetch':'向给定地址发出请求','input':'等待用户输入文字','len':'计算长度','str':'转成文字','int':'尝试转成整数','JSON.parse':'把 JSON 文字读成数据','JSON.stringify':'把数据变成 JSON 文字','useState':'准备一份可更新的页面状态','useEffect':'安排页面渲染后的工作','document.querySelector':'按条件找到页面上的元素','document.getElementById':'按名字找到页面上的元素','open':'打开一个文件'};
 const methods:Record<string,string>={replaceChildren:'替换容器里的内容；没有参数时清空',append:'把内容添加到末尾',push:'把一项加入列表',trim:'去掉文字两端的空白',preventDefault:'阻止这次事件的默认行为',getItem:'读取浏览器里保存的内容',setItem:'把内容保存到当前浏览器',createElement:'创建一个页面元素',addEventListener:'为某个事件安排处理步骤',filter:'保留符合条件的项',map:'逐项处理并得到一个新列表'};
 const method=target.split('.').at(-1)!;
 return Object.hasOwn(known,target)?`${known[target]}：${short(args,65)}`:Object.hasOwn(methods,method)?`${methods[method]}（${short(target,60)}${short(args,65)}）`:`调用 ${short(target,60)}${short(args,65)}；具体行为要看这个步骤的定义`;
}
function explain(n:Parser.SyntaxNode):string{
 const type=n.type;
 if(['comment','string','expression_statement'].includes(type)&&n.text.trim().startsWith('#'))return `作者的备注：${short(n.text.replace(/^#+/,''))}`;
 if(type.includes('import'))return `引入其他文件或工具：${short(n.text)}`;
 if(type==='return_statement')return `把结果交回去：${returned(n)}`;
 if(type==='if_statement')return `先判断 ${short(field(n,'condition')?.text??'条件')}，再选择要执行的分支。`;
 if(type==='for_statement'||type==='for_in_statement')return `逐项处理数据：${short(n.text.split('\n')[0])}`;
 if(type==='while_statement')return `当 ${short(field(n,'condition')?.text??'条件')} 成立时重复执行。`;
 if(type==='try_statement')return '尝试执行这组步骤，并按代码中的异常分支处理失败。';
 if(type==='raise_statement'||type==='throw_statement')return `报告一个问题，让调用者处理：${short(n.text)}`;
 const assign=type==='assignment'?n:all(n,c=>c.type==='assignment'||c.type==='assignment_expression'||c.type==='variable_declarator')[0];
 if(assign){const left=field(assign,'left')??field(assign,'name');const right=field(assign,'right')??field(assign,'value');const call=right&&all(right,c=>c.type==='call'||c.type==='call_expression')[0];return `把${call?`“${callDescription(call)}”的结果`:` ${short(right?.text??'给定内容')} `}记在 ${short(left?.text??'这个名字')} 里。`;}
 const call=all(n,c=>c.type==='call'||c.type==='call_expression')[0];if(call)return callDescription(call)+'。';
 if(type==='function_definition'||type==='function_declaration')return `准备名为 ${field(n,'name')?.text??'未命名'} 的步骤；被调用时才执行。`;
 if(type==='expression_statement')return `执行这一句：${short(n.text)}。具体结果取决于这里用到的值与函数。`;
 return `这一部分是 ${short(n.text.split('\n')[0])}。请结合下面的原代码阅读。`;
}
export class ProjectReader {
 private parsers=new Map<string,Parser>();
 async init(directory:string){await Parser.init({locateFile:()=>path.join(directory,'tree-sitter.wasm')});for(const language of ['python','html','javascript','typescript','tsx']){const p=new Parser();p.setLanguage(await Parser.Language.load(path.join(directory,`tree-sitter-${language}.wasm`)));this.parsers.set(language,p);}}
 dispose(){for(const p of this.parsers.values())p.delete();this.parsers.clear();}
 read(file:string,source:string):ReadingFile{
   const language=readingLanguage(file)??'text';const parser=this.parsers.get(language);const tree=parser?.parse(source);const root=tree?.rootNode;
   const result:ReadingFile={path:file,language,role:'辅助内容',reason:'文件类型',hash:digest(source),chapters:[],imports:[],entry:false,hasErrors:false};
   try{
    if(!root){result.role=language==='css'?'页面样式':language==='json'?'项目配置':'项目说明';result.chapters=[{id:'0',title:result.role,start:0,end:Math.max(0,source.split('\n').length-1),code:source.slice(0,16000),clipped:source.length>16000,summary:language==='css'?'这里决定页面的颜色、间距、字体和排列。':'这是供人或工具读取的信息，不要当作程序的执行步骤。',input:'阅读里面的文字与键值',output:'帮助理解项目配置或外观',steps:[language==='css'?'先找到你想改的样式名称，再对照页面中的同名元素。':'先看标题、说明和字段名；不要只凭文件名推断功能。'],terms:[]}];return result;}
    result.hasErrors=root.hasError();
    const importNodes=all(root,n=>['import_statement','import_from_statement','call_expression'].includes(n.type));
    for(const n of importNodes){
      if(language==='python'&&n.type==='import_from_statement'){const m=field(n,'module_name');if(m)result.imports.push(m.text);}
      else if(language==='python'&&n.type==='import_statement'){for(const c of n.namedChildren){const m=c.type==='aliased_import'?field(c,'name'):c;if(m)result.imports.push(m.text);}}
      else if(n.type==='import_statement'){const s=field(n,'source');if(s)result.imports.push(str(s.text));}
      else if(['require','import'].includes(field(n,'function')?.text??'')){const s=field(n,'arguments')?.namedChildren[0];if(s?.type==='string')result.imports.push(str(s.text));}
    }
    const mainGuard=language==='python'&&root.namedChildren.some(n=>n.type==='if_statement'&&/__name__\s*==\s*['"]__main__['"]/.test(field(n,'condition')?.text??''));
    const rootRender=all(root,n=>n.type==='call_expression'&&/^(createRoot|ReactDOM\.render)$/.test(field(n,'function')?.text??'')).length>0;
    result.entry=mainGuard||rootRender||language==='html';
    const hasJSX=all(root,n=>n.type==='jsx_element'||n.type==='jsx_self_closing_element').length>0;
    result.role=language==='html'||hasJSX?'页面与交互':result.entry?'启动入口':all(root,n=>/function_definition|function_declaration|arrow_function/.test(n.type)).length?'可调用的处理步骤':'准备与连接';
    result.reason=mainGuard?'发现 __main__ 启动判断':rootRender?'发现页面挂载调用':language==='html'?'HTML 页面结构':hasJSX?'发现页面组件结构':'根据文件中的代码结构整理';
    let sections=root.namedChildren.filter(n=>n.type!=='comment');
    if(language==='html'){
      const elements=all(root,n=>['element','script_element','style_element'].includes(n.type));
      const tag=(n:Parser.SyntaxNode)=>all(n,c=>c.type==='tag_name')[0]?.text.toLowerCase()??'';
      const body=elements.find(n=>tag(n)==='body');
      sections=body?body.namedChildren.filter(n=>['element','script_element','style_element'].includes(n.type)):elements.filter(n=>['header','nav','section','form','footer','script','style'].includes(tag(n)));
      const head=elements.find(n=>tag(n)==='head');if(head)sections.push(head);
      if(!sections.length)sections=root.namedChildren;
      for(const a of all(root,n=>n.type==='attribute')){const name=a.namedChildren[0]?.text;const value=a.namedChildren[1]?.text;if(value&&['src','href'].includes(name))result.imports.push(str(value));}
    }
    for(const [index,n] of sections.slice(0,80).entries()){
      const definition=['export_statement','decorated_definition'].includes(n.type)?n.namedChildren.find(c=>/function|class|lexical_declaration/.test(c.type))??n:n;
      const fn=['function_definition','function_declaration','method_definition'].includes(definition.type)?definition:all(definition,c=>c.type==='arrow_function'||c.type==='function_expression')[0];
      const declared=definition.namedChildren.find(c=>c.type==='variable_declarator');
      const title=field(definition,'name')?.text??declared?.childForFieldName('name')?.text;
      const params=fn?(field(fn,'parameters')??field(fn,'parameter'))?.text:undefined;
      const body=fn?field(fn,'body'):undefined;
      const statements=body?.namedChildren??[definition];
      const returns=body?all(body,c=>c.type==='return_statement').filter(ret=>{let p=ret.parent;while(p&&p.id!==body.id){if(/function|lambda/.test(p.type))return false;p=p.parent;}return true;}):[];
      const isImport=n.type.includes('import');const tag=language==='html'?all(n,c=>c.type==='tag_name')[0]?.text:'';
      const comments=body?.namedChildren.find(c=>c.type==='expression_statement'&&c.namedChildren[0]?.type==='string');
      const call=definition.type==='expression_statement'?all(definition,c=>c.type==='call_expression')[0]:undefined;
      const event=call&&/\.addEventListener$/.test(field(call,'function')?.text??'')?field(call,'arguments')?.namedChildren[0]?.text:undefined;
      const author=n.previousNamedSibling?.type==='comment'?short(n.previousNamedSibling.text.replace(/^(\/\/|#)\s*/,''),140):undefined;
      let summary=event?`当 ${field(call!,'function')?.text.replace(/\.addEventListener$/,'')} 触发 ${event} 事件时，执行这里安排的步骤。`:fn?`准备 ${title??'这组'} 步骤${params&&params!=='()'?`，接收 ${short(params)}`:'，没有显式参数'}。${returns[0]?`代码中写明返回 ${returned(returns[0])}。`:'没有直接返回值；留意下方调用带来的变化。'}`:explain(definition);
      let steps=statements.filter(c=>c.type!=='comment').slice(0,10).flatMap(statement=>{const first=explain(statement);if(['for_statement','for_in_statement','while_statement','try_statement','if_statement'].includes(statement.type)){const inner=all(statement,c=>c!==statement&&['expression_statement','return_statement','lexical_declaration'].includes(c.type)).slice(0,3);return [first,...inner.map(c=>'其中一步：'+explain(c))];}return [first];});
      if(author)summary=`作者写道：“${author}”\n${summary}`;
      if(language==='html'){
        const labels=all(n,c=>c.type==='text').map(c=>short(c.text,50)).filter(Boolean).slice(0,4);
        summary=tag==='script'?'这一段引用或定义页面的行为。':tag==='style'?'这一段设置页面外观。':tag==='head'?'准备页面标题、样式和其他信息。':`组织${tag==='form'?'用户填写的表单':'页面内容'}${labels.length?'：'+labels.join(' / '):'。'}`;
        const controls=all(n,c=>c.type==='start_tag'||c.type==='self_closing_tag').map(c=>c.text).filter(t=>/^<(input|button|a|select|textarea)\b/i.test(t));
        steps=controls.slice(0,8).map(t=>{const tag=t.match(/^<(\w+)/)?.[1];const placeholder=t.match(/placeholder=["']([^"']*)["']/)?.[1];return tag==='input'?`提供一个输入框${placeholder?`，提示用户“${placeholder}”`:''}。${/\brequired\b/.test(t)?'这里要求填写内容。':''}`:tag==='button'?`提供一个按钮${/type=["']submit["']/.test(t)?'，点击后提交所属表单':''}；后续处理需要看脚本。`:`提供 ${tag} 页面控件，具体交互还要看脚本。`;});if(!steps.length)steps=[summary];
      }
      if(comments)steps.unshift(`作者留下的说明：${short(comments.text.replace(/^['"]{1,3}|['"]{1,3}$/g,''),180)}`);
      const words=leafWords(n);
      const htmlTitles:Record<string,string>={head:'网页标题与资源',header:'页面开头显示什么',form:'收集用户填写的内容',section:'放置一组页面内容',script:'连接页面与处理代码',style:'设置页面外观',div:'把页面内容组织起来',footer:'页面底部的内容'};
      result.chapters.push({id:String(index),title:event?`${str(event)} · 事件发生后做什么`:title?`${title} · ${fn?'一组处理步骤':'准备一个值'}`:isImport?'先借用需要的工具':language==='html'?htmlTitles[tag??'']??`${tag??'页面'} · 页面的一部分`:short(n.text.split('\n')[0],48),start:n.startPosition.row,end:n.endPosition.row,code:n.text.slice(0,16000),clipped:n.text.length>16000,summary,input:fn?(params&&params!=='()'?`调用时传入 ${short(params,120)}`:'调用时没有显式参数'):isImport?'其他文件或已安装的工具':language==='html'?'页面里声明的文字、元素与资源':'执行到这里时已有的值',output:returns.length?returns.slice(0,3).map(returned).join('；'):fn?'没有明确的 return；也可能通过内部调用产生效果。':language==='html'?'页面结构；实际效果要结合样式和脚本。':'请看下方各句的动作，不推断业务结果。',steps,terms:words.filter(w=>Object.hasOwn(terms,w)).slice(0,6).map(word=>({word,meaning:terms[word]}))});
    }
    return result;
   }finally{tree?.delete();}
 }
}
const ignored=new Set(['node_modules','.git','.venv','venv','__pycache__','dist','build','.next','coverage','vendor','.idea','.vscode']);
export async function scanProject(root:string,reader:ProjectReader,options:{ignore?:string[];cancelled?:()=>boolean}={}):Promise<ReadingProject>{
 const realRoot=await fs.realpath(root);const files:ReadingFile[]=[];let skipped=0,limited=false,total=0,visited=0;let description='',descriptionSource='尚未找到项目说明；先从下方文件职责了解它。';let readme:string|undefined;
 async function visit(dir:string,depth:number){
   if(options.cancelled?.())throw new Error('已取消上一次整理。');
   if(depth>8){skipped++;limited=true;return;}
   const entries=(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
   for(const item of entries){
    if(options.cancelled?.())throw new Error('已取消上一次整理。');
    if(++visited>4000||files.length>=200||total>6*1024*1024){limited=true;return;}
    if(item.name.startsWith('.')||ignored.has(item.name)||options.ignore?.includes(item.name)||/lock\.(json|yaml)$/.test(item.name))continue;
    if(item.isSymbolicLink()){skipped++;continue;}const absolute=path.join(dir,item.name);
    if(item.isDirectory()){try{await visit(absolute,depth+1)}catch(error){if(options.cancelled?.())throw error;skipped++;}continue;}
    if(!item.isFile()||!readingLanguage(item.name))continue;
    try{
      const real=await fs.realpath(absolute);const boundary=path.relative(realRoot,real);if(boundary==='..'||boundary.startsWith('..'+path.sep)||path.isAbsolute(boundary)){skipped++;continue;}
      const stat=await fs.stat(absolute);if(stat.size>256*1024){skipped++;continue;}total+=stat.size;
      const source=await fs.readFile(absolute,'utf8');if(source.includes('\0')){skipped++;continue;}
      const relative=path.relative(root,absolute).split(path.sep).join('/');const file=reader.read(relative,source);files.push(file);
      if(/^readme\.md$/i.test(relative)){readme=relative;const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('![')&&!s.startsWith('```'));description=lines.slice(0,3).join(' ').replace(/^#+\s*/,'').slice(0,260);descriptionSource='摘自项目 README，由代码作者提供，未独立核实。';}
    }catch{skipped++;}
   }
 }
 await visit(root,0);
 const byPath=new Map(files.map(f=>[f.path,f]));const edges:ReadingProject['edges']=[];
 for(const f of files)for(const ref of [...new Set(f.imports)]){
   if(/^(?:https?:|data:|#|\/)/i.test(ref))continue;
   let base:string;let candidates:string[]=[];
   if(f.language==='python'){
     const dots=ref.match(/^\.+/)?.[0].length??0;const name=ref.slice(dots).replace(/\./g,'/');base=path.posix.join(dots?path.posix.dirname(f.path):'',...Array(Math.max(0,dots-1)).fill('..'),name);candidates=[base+'.py',path.posix.join(base,'__init__.py')];
     if(!dots)candidates.push(path.posix.join(path.posix.dirname(f.path),base+'.py'));
   }else{if(f.language!=='html'&&!ref.startsWith('.'))continue;base=path.posix.normalize(path.posix.join(path.posix.dirname(f.path),ref.split(/[?#]/)[0]));candidates=[base,...['.js','.jsx','.ts','.tsx','.py','.css','.html','/index.js','/index.ts','/index.tsx'].map(s=>base+s)];}
   const target=candidates.find(c=>byPath.has(c));if(target&&target!==f.path&&!edges.some(e=>e.from===f.path&&e.to===target))edges.push({from:f.path,to:target,label:'引用'});
 }
 const rank=(f:ReadingFile)=>f.entry?0:f.role==='页面与交互'?1:edges.some(e=>e.from===f.path)?2:f.language==='markdown'?5:4;
 files.sort((a,b)=>rank(a)-rank(b)||a.path.localeCompare(b.path));
 return {name:path.basename(root),description:description||`找到 ${files.filter(f=>!['json','markdown','css'].includes(f.language)).length} 个代码文件。下面按页面、入口和处理步骤整理，帮助你开始阅读。`,descriptionSource,files,edges,skipped,limited,readme};
}
