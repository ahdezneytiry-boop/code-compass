(()=>{
 const api=acquireVsCodeApi();const $=id=>document.getElementById(id);let project;let current;let chapterIndex=0;let read=new Set();const previous=api.getState();
 const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
 const send=(action,extra={})=>api.postMessage({action,...extra});
 function show(id){for(const section of ['empty','loading','overview','reading'])$(section).hidden=section!==id;}
 function feedback(text){$('feedback').textContent=text;$('feedback').hidden=!text;}
 function persist(){api.setState({project:project?.name,file:current?.path,chapter:chapterIndex});}
 function progress(){const total=project?.files.reduce((n,f)=>n+f.chapters.length,0)||0;$('progressText').textContent=`已看过 ${read.size} / ${total} 段 · 不用赶进度`;$('progressBar').style.width=`${total?read.size/total*100:0}%`;}
 function sidebar(){
   $('fileList').replaceChildren();$('fileCount').textContent=String(project.files.length);$('projectName').textContent=project.name;
   project.files.forEach((file,i)=>{const b=el('button',undefined,'file-button'+(current?.path===file.path?' active':''));b.title=file.path;if(current?.path===file.path)b.setAttribute('aria-current','page');b.append(el('span',String(i+1).padStart(2,'0'),'order'));const t=el('span',undefined,'file-text');t.append(el('strong',file.path),el('small',file.role));b.append(t);if(file.chapters.length&&file.chapters.every(c=>read.has(`${file.path}|${c.id}`)))b.append(el('span','✓','read-dot'));b.onclick=()=>selectFile(file.path);$('fileList').append(b);});
   $('overviewButton').classList.toggle('active',!current);progress();
 }
 function overview(){
   if(!project)return;current=undefined;show('overview');sidebar();persist();$('breadcrumb').textContent=`${project.name} / 阅读导航`;$('projectDescription').textContent=project.description;$('descriptionSource').textContent=project.descriptionSource;
   $('scopeNote').textContent=`${project.files.length} 个可读文件${project.skipped?` · ${project.skipped} 项无法读取或超限`:''}${project.limited?' · 达到整理上限，只展示部分内容':''}`;
   $('roles').replaceChildren();const groups=[{title:'我想看页面和交互',icon:'▧',desc:'文字、按钮、表单，以及页面怎么显示。',filter:f=>f.role==='页面与交互'||f.language==='css'},{title:'我想看它怎样处理事情',icon:'↳',desc:'收到信息后，经过哪些步骤，得到什么结果。',filter:f=>!['页面与交互','项目说明','项目配置','页面样式'].includes(f.role)},{title:'我想先了解项目',icon:'≡',desc:'作者写的说明，以及项目用到的配置。',filter:f=>['项目说明','项目配置'].includes(f.role)}];
   for(const g of groups){const files=project.files.filter(g.filter);const b=el('button',undefined,'role-card');b.disabled=!files.length;b.append(el('span',g.icon,'role-icon'),el('strong',g.title),el('p',g.desc),el('small',files.length?`${files.length} 个文件 · 从 ${files[0].path} 看起`:'暂未识别到这类文件'),el('span','↗','arrow'));b.onclick=()=>selectFile(files[0].path);$('roles').append(b);}
   $('connections').replaceChildren();for(const edge of project.edges.slice(0,12)){const row=el('div',undefined,'connection');for(const [index,name] of [edge.from,edge.to].entries()){if(index)row.append(el('span','引用 →'));const b=el('button',name);b.onclick=()=>selectFile(name);row.append(b);}$('connections').append(row);}
   if(!project.edges.length)$('connections').append(el('p','暂未确认文件之间的本地引用。可以从左侧逐个阅读；没有连线不代表文件之间没有关系。','muted'));
   $('startReading').disabled=!project.files.some(f=>f.chapters.length);$('startReading').onclick=()=>{const f=project.files.find(f=>f.chapters.length);if(f)selectFile(f.path);};
 }
 function selectFile(file,index=0){current=project?.files.find(f=>f.path===file);if(!current)return;chapterIndex=Math.max(0,Math.min(index,current.chapters.length-1));if(!current.chapters.length){feedback('这个文件没有可分段的内容，请选择其他文件。');overview();return;}feedback('');renderChapter();sidebar();persist();}
 function colorLine(line){const frag=document.createDocumentFragment();const tokens=line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:import|from|def|return|if|else|for|while|async|await|function|const|let|export|class|new|throw|try|catch)\b|\/\/.*$|#.*$)/g);for(const t of tokens){const type=/^["']/.test(t)?'token-string':/^(#|\/\/)/.test(t)?'token-comment':/^(import|from|def|return|if|else|for|while|async|await|function|const|let|export|class|new|throw|try|catch)$/.test(t)?'token-key':'';frag.append(el('span',t,type));}return frag;}
 function renderChapter(){
   const c=current.chapters[chapterIndex];show('reading');$('breadcrumb').textContent=`${project.name} / ${current.path}`;$('fileRole').textContent=current.role;$('fileTitle').textContent=current.path;$('fileReason').textContent=current.reason+(current.hasErrors?' · 有结构无法识别，请结合原代码核对':'');
   $('chapters').replaceChildren();current.chapters.forEach((ch,i)=>{const b=el('button',`${read.has(`${current.path}|${ch.id}`)?'✓ ':''}${i+1}. ${ch.title}`,i===chapterIndex?'active':'');if(i===chapterIndex)b.setAttribute('aria-current','step');b.onclick=()=>selectFile(current.path,i);$('chapters').append(b);});
   $('codeName').textContent=current.language.toUpperCase();$('lineRange').textContent=`第 ${c.start+1}–${c.end+1} 行`;$('code').replaceChildren();c.code.split('\n').forEach((line,i)=>{const row=el('div',undefined,'code-line');row.append(el('span',String(c.start+i+1),'line-no'));const source=el('span',undefined,'line-source');source.append(colorLine(line));row.append(source);$('code').append(row);});
   $('codeFoot').textContent=c.clipped?'较长片段已截取 · 完整内容请在编辑器对照':'只读预览 · 保存代码后会重新整理';$('chapterTitle').textContent=c.title;$('summary').textContent=c.summary;$('input').textContent=c.input;$('output').textContent=c.output;
   $('steps').replaceChildren(...c.steps.map(s=>el('li',s)));$('terms').replaceChildren();$('termBox').hidden=!c.terms.length;for(const term of c.terms){const d=el('details');d.append(el('summary',term.word),el('p',term.meaning));$('terms').append(d);}
   $('chapterCount').textContent=`${chapterIndex+1} / ${current.chapters.length} 段`;$('previous').disabled=chapterIndex===0;$('next').textContent=chapterIndex===current.chapters.length-1?'看过了，进入下个文件 →':'这段看过了，继续 →';
   $('openCode').onclick=()=>send('open',{file:current.path,chapter:c.id});$('ask').onclick=()=>send('ask',{file:current.path,chapter:c.id});
 }
 $('overviewButton').onclick=()=>overview();$('previous').onclick=()=>selectFile(current.path,chapterIndex-1);
 $('next').onclick=()=>{const c=current.chapters[chapterIndex];send('read',{file:current.path,hash:current.hash,chapter:c.id});if(chapterIndex<current.chapters.length-1)selectFile(current.path,chapterIndex+1);else{const index=project.files.indexOf(current);const next=project.files.slice(index+1).find(f=>f.chapters.length);if(next)selectFile(next.path);else{overview();feedback('已走到这次阅读路线的末尾。可以返回任何一段再看，不需要一次全部记住。');}}};
 document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action)send(action);});
 window.addEventListener('message',({data:m})=>{
   if(m?.kind==='empty'){project=undefined;current=undefined;$('fileList').replaceChildren();$('projectName').textContent='准备开始';show('empty');}
   else if(m?.kind==='loading'){feedback('');show('loading');}
   else if(m?.kind==='project'){const selected=current?.path??(previous?.project===m.project.name?previous.file:undefined),index=current?chapterIndex:previous?.chapter??0;project=m.project;read=new Set(m.completed||[]);if(selected&&project.files.some(f=>f.path===selected&&f.chapters.length))selectFile(selected,index);else overview();}
   else if(m?.kind==='read'){read.add(`${m.file}|${m.chapter}`);sidebar();if(current)renderChapter();}
   else if(m?.kind==='error'){feedback(m.message);if(!$('loading').hidden){if(project)overview();else show('empty');}}
   else if(m?.kind==='notice')feedback(m.message);
 });
 show('loading');send('ready');
})();
