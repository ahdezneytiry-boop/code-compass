import Parser from 'web-tree-sitter';
import path from 'node:path';
import { createHash } from 'node:crypto';
export { terms, findTerm } from './terms';
export { NoteStore, NoteConflictError } from './store';
export * from './backup';
export * from './projectReader';
export interface Issue { type: string; start: number; end: number; message: string; suggestion: string }
export interface Region { start: number; end: number; layer: Layer; reason: string }
export type Layer = 'route'|'business'|'data'|'ui'|'utility';
export const layers: Record<Layer,{title:string;color:string;description:string}> = {
  route:{title:'接收请求',color:'#739DCE',description:'像前台，把请求交给对应的处理步骤'},
  business:{title:'处理事情',color:'#7DAE96',description:'完成判断、计算等具体工作'},
  data:{title:'读写数据',color:'#CA9E70',description:'保存资料，或把资料查出来'},
  ui:{title:'显示页面',color:'#A695C6',description:'用户看到的文字、按钮与表单'},
  utility:{title:'准备与辅助',color:'#9A9DA6',description:'引入工具、设置参数，帮助其他代码工作'}
};
export interface Analysis { regions: Region[]; health: Issue[]; syntax: Issue[]; summary: string; functions: number }
export interface Thresholds { functionLines: number; nestingDepth: number; parameterCount: number }
export const defaults: Thresholds = {functionLines:50,nestingDepth:4,parameterCount:5};
function walk(node: Parser.SyntaxNode, fn: (n:Parser.SyntaxNode)=>void): void {
  const stack=[node]; while(stack.length){const n=stack.pop()!;fn(n);for(let i=n.namedChildren.length-1;i>=0;i--)stack.push(n.namedChildren[i]);}
}
function descendants(node: Parser.SyntaxNode, type:string): Parser.SyntaxNode[] { const out:Parser.SyntaxNode[]=[];walk(node,n=>{if(n.type===type)out.push(n)});return out; }
function issue(type:string,n:Parser.SyntaxNode,message:string,suggestion:string): Issue {return {type,start:n.startPosition.row,end:n.endPosition.row,message,suggestion};}
function inferLayer(file:string,language:string): Layer {if(language==='html')return 'ui'; if(/(?:^|[\\/_.-])(routes?|controllers?)(?:[\\/_.-]|$)/i.test(file))return 'route';if(/(?:^|[\\/_.-])(models?|repositories|repository|db|database)(?:[\\/_.-]|$)/i.test(file))return 'data';if(/(?:^|[\\/_.-])(services?)(?:[\\/_.-]|$)/i.test(file))return 'business';return 'utility';}
export class Analyzer {
  private parsers = new Map<string,Parser>();
  async init(directory:string):Promise<void>{
    await Parser.init({locateFile:()=>path.join(directory,'tree-sitter.wasm')});
    for(const language of ['python','html']) {const parser=new Parser();parser.setLanguage(await Parser.Language.load(path.join(directory,`tree-sitter-${language}.wasm`)));this.parsers.set(language,parser);}
  }
  dispose(){for(const p of this.parsers.values())p.delete();this.parsers.clear();}
  analyze(text:string,language:string,file:string,thresholds:Thresholds=defaults):Analysis {
    const parser=this.parsers.get(language);if(!parser)throw new Error('仅支持 Python 和 HTML');
    const tree=parser.parse(text);
    try {
      const root=tree.rootNode, health:Issue[]=[],syntax:Issue[]=[],regions:Region[]=[];
      const base=inferLayer(file,language),functions=descendants(root,'function_definition');
      const lineCount=text.split('\n').length;
      regions.push({start:0,end:lineCount-1,layer:base,reason:language==='html'?'HTML 文档结构':'按文件路径推测'});
      walk(root,n=>{if((n.type==='ERROR'||n.isMissing())&&syntax.length<20)syntax.push(issue('syntax',n,language==='python'?'Python 语法结构不完整或无法识别':'HTML 标签结构不完整或无法识别','检查此处及前一行的括号、引号、冒号或标签配对。此为解析器提示，不代表所有运行错误。'));});
      if(language==='python'){
        for(const n of root.namedChildren){
          let layer=base,reason='按文件路径推测';
          if(['import_statement','import_from_statement'].includes(n.type)){layer='utility';reason='AST：模块导入';}
          else if(n.type==='decorated_definition'&&/@\w+(?:\.\w+)*\.(?:route|get|post|put|delete|patch)\s*\(/.test(n.text)){layer='route';reason='AST 装饰器 + 路由模式匹配';}
          else if(['function_definition','class_definition','decorated_definition'].includes(n.type)&&base==='utility'){layer='business';reason='AST：函数或类；具体职责需人工确认';}
          regions.push({start:n.startPosition.row,end:n.endPosition.row,layer,reason});
        }
        const duplicateBodies=new Map<string,Parser.SyntaxNode>();
        for(const fn of functions){
          const name=fn.childForFieldName('name')?.text??'函数',body=fn.childForFieldName('body');
          const length=fn.endPosition.row-fn.startPosition.row+1;
          if(length>thresholds.functionLines)health.push(issue('long_function',fn,`${name} 有 ${length} 行，超过 ${thresholds.functionLines} 行参考值`,'按输入校验、数据处理和结果组装拆分职责；不要仅为缩短行数拆分。'));
          const params=fn.childForFieldName('parameters')?.namedChildren.filter(n=>!['comment','positional_separator','keyword_separator'].includes(n.type)&&!['self','cls'].includes(n.text))??[];
          if(params.length>thresholds.parameterCount)health.push(issue('long_params',fn,`${name} 有 ${params.length} 个参数`,'考虑用具有明确字段的数据对象组合相关参数，并保留易懂的默认值。'));
          if(!body)continue;
          let maxDepth=0; const localNodes:Parser.SyntaxNode[]=[];
          const pending:{n:Parser.SyntaxNode;depth:number}[]=[{n:body,depth:0}];
          while(pending.length){const {n,depth}=pending.pop()!;if(n!==body&&['function_definition','class_definition','lambda'].includes(n.type))continue;localNodes.push(n);const next=depth+(['if_statement','for_statement','while_statement','try_statement','with_statement','match_statement'].includes(n.type)?1:0);maxDepth=Math.max(maxDepth,next);for(const c of n.namedChildren)pending.push({n:c,depth:next});}
          if(maxDepth>thresholds.nestingDepth)health.push(issue('deep_nesting',fn,`${name} 的控制流嵌套达到 ${maxDepth} 层`,'尝试提前返回，或把独立分支提取为函数，让主要流程更容易阅读。'));
          // Conservative candidate detection: skip dynamic and nested scopes, count identifiers in the whole body.
          const identifiers=descendants(body,'identifier').map(n=>n.text);
          const dynamic=/\b(?:eval|exec|locals|globals)\s*\(/.test(body.text);
          if(!dynamic)for(const n of localNodes.filter(n=>n.type==='assignment')){
            const left=n.childForFieldName('left');if(left?.type!=='identifier'||left.text.startsWith('_'))continue;
            if(identifiers.filter(id=>id===left.text).length===1)health.push(issue('unused_variable',left,`变量 ${left.text} 在此函数内未发现读取（候选）`,'确认是否遗漏使用；删除前检查赋值右侧是否有调用或其他副作用。动态访问不在此检查范围内。'));
          }
          if(body.endPosition.row-body.startPosition.row>=3){
            const tokens:string[]=[];walk(body,n=>{if(n.childCount===0&&n.type!=='comment')tokens.push(`${n.type}:${n.text}`)});
            const fingerprint=tokens.join('|'),previous=duplicateBodies.get(fingerprint);
            if(previous)health.push(issue('duplicate_code',fn,`${name} 的函数体与第 ${previous.startPosition.row+1} 行附近重复`,'这是去掉空白和注释后的精确重复候选；确认业务含义相同后再提取公共函数。'));
            else duplicateBodies.set(fingerprint,fn);
          }
        }
      }else{
        walk(root,n=>{
          if(n.type!=='start_tag'&&n.type!=='self_closing_tag')return;
          const name=n.namedChildren.find(c=>c.type==='tag_name')?.text.toLowerCase();
          const attrs=n.namedChildren.filter(c=>c.type==='attribute').map(c=>c.namedChildren.find(a=>a.type==='attribute_name')?.text.toLowerCase());
          if(name==='img'&&!attrs.includes('alt'))health.push(issue('accessibility',n,'图片缺少 alt 文本','为有意义的图片补充内容描述；纯装饰图片可使用 alt=""。'));
        });
      }
      return {regions,health,syntax,functions:functions.length,summary: language==='html'?'HTML 页面：组织用户看到的内容、表单与页面结构。':`${layers[base].title}文件（路径规则推测），包含 ${functions.length} 个函数。打开分区图例可查看判断依据。`};
    }finally{tree.delete();}
  }
}
export const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
export interface Note {id:string;uri:string;start:number;end:number;selectedText:string;codeHash:string;content:string;createdAt:string;updatedAt:string;status:'active'|'stale';author:string;revision?:number}
export function relocate(note:Note,text:string):Note {
  if(!note.selectedText||hash(note.selectedText)!==note.codeHash)return {...note,status:'stale'};
  const index=text.indexOf(note.selectedText);
  if(index<0||text.indexOf(note.selectedText,index+1)>=0)return {...note,status:'stale'};
  return {...note,start:index,end:index+note.selectedText.length,status:'active'};
}
export function translateError(raw:string):{title:string;explanation:string;suggestion:string}{
  const rules:[RegExp,string,string,string][]=[
    [/is not accessed|unused variable/i,'变量尚未使用','当前作用域中没有发现这个变量被读取。','检查是否遗漏使用，并在删除赋值前确认右侧是否有副作用。'],
    [/NameError|is not defined/i,'名称无法解析','代码使用了尚未定义、未导入或拼写不一致的名称。','检查名称拼写、定义顺序以及 import 语句。'],
    [/TypeError|not assignable|incompatible type|argument.*type/i,'数据类型不匹配','参与操作的值或函数参数与所需类型不一致。','先确认值的实际类型，再选择转换或修改调用；不要直接猜测替换。'],
    [/AttributeError|has no attribute|cannot access attribute/i,'对象没有这个属性或方法','当前对象类型不提供正在访问的成员。','核对对象类型和成员拼写，例如 append 通常用于列表而非字符串。'],
    [/ValueError|invalid literal/i,'值的格式不合要求','类型可能正确，但具体内容无法完成本次转换或操作。','检查输入内容并在转换前验证，必要时捕获 ValueError。'],
    [/IndexError/i,'索引超出范围','访问的位置不在列表或序列的有效范围内。','检查长度、空列表和循环边界。'],
    [/KeyError/i,'字典中不存在这个键','代码用键读取字典，但该键不存在。','确认键名和数据来源；允许缺失时可使用 dict.get。'],
    [/ModuleNotFoundError|ImportError|could not be resolved/i,'模块无法导入','当前 Python 环境无法找到所需模块或导出名称。','确认 VS Code 选择的解释器与依赖安装环境一致。'],
    [/IndentationError|TabError|unexpected indent/i,'缩进结构有问题','Python 使用缩进区分代码块。','检查同级语句缩进是否一致，不要混用 Tab 和空格。'],
    [/SyntaxError|expected|语法结构/i,'语法结构不完整','解析器无法按语言规则理解这段代码。','检查报错位置及前一行的冒号、括号、引号和关键字。'],
    [/ZeroDivisionError/i,'除数为零','计算使用了 0 作为除数。','在除法前验证除数，并明确为零时的业务处理。']
  ];
  const match=rules.find(([r])=>r.test(raw));return match?{title:match[1],explanation:match[2],suggestion:match[3]}:{title:'暂未匹配到中文规则',explanation:'保留原始信息供定位；此处没有足够依据推断原因。',suggestion:'结合报错位置、上下文和错误提供方文档排查。'};
}
export interface SafeFix {start:number;end:number;replacement:string;title:string}
export function safeFixes(text:string,language:string):SafeFix[]{
  // Only semantically narrow edits are offered. Strings/comments and inferred type changes are excluded.
  if(language!=='python')return [];
  const fixes:SafeFix[]=[];let offset=0;let quote='';let triple=false;let escaped=false;
  for(const line of text.split('\n')){
    const plain=line.replace(/\r$/,'');
    if(!quote&&/^\s*(else|try|finally)\s*$/.test(plain)){const end=plain.trimEnd().length;fixes.push({start:offset+end,end:offset+end,replacement:':',title:`为 ${plain.trim()} 补上冒号`});}
    for(let i=0;i<line.length;i++){
      const c=line[i];if(escaped){escaped=false;continue;}
      if(quote){if(c==='\\'){escaped=true;continue;}if(triple&&line.slice(i,i+3)===quote.repeat(3)){quote='';triple=false;i+=2;}else if(!triple&&c===quote)quote='';}
      else {if(c==='#')break;if(c==='"'||c==="'"){quote=c;triple=line.slice(i,i+3)===c.repeat(3);if(triple)i+=2;}}
    }
    // Preserve triple strings and explicit escaped newlines. Invalid unclosed ordinary strings end here.
    if(!triple&&!escaped)quote='';escaped=false;offset+=line.length+1;
  }
  return fixes;
}
