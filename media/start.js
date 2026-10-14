(() => {
 const api=acquireVsCodeApi();let current=0;
 const steps=[
  ['第一步 · 不需要准备代码','先有一个可以放心试的地方。','我们准备了一个很小的练习。你只需选择放在哪里，知码会帮你复制好。','点下面的按钮，再选择“桌面”或你方便找到的位置。新的练习窗口打开后，继续第二步。','创建我的练习','practice','成功时：会出现一个新的 VS Code 窗口，里面是“知码练习”文件夹。','“函数”是什么意思？','给一组步骤起个名字，需要的时候再叫它做一次。这里的 greet 就负责拼出一句问候。'],
  ['第二步 · 只读，不用运行','先看懂一句问候怎么来的。','不用背代码，也不用把每个词都弄懂。先找到 def，把鼠标停在它上面。','点击打开练习。把鼠标放在 def 上，稍等片刻，会出现中文解释。再试试 return。','打开这几行练习代码','file','成功时：旁边打开 hello.py，鼠标停留后出现“函数定义”的说明。','“参数”是什么意思？','交给函数的信息。greet("小林") 就像说：“请帮小林拼出一句问候。”'],
  ['第三步 · 用自己的话写一句','把刚才的理解留在代码旁。','笔记可以很短。比如：“这段代码会拼出一句问候。”','点击后会打开练习、选好一段代码。输入你自己的理解，按回车保存。','为练习代码写笔记','note','成功时：左侧“我的笔记”出现刚才那句话；原来的代码没有增加注释。','“笔记”会改动代码吗？','不会。知码把笔记单独保存。以后代码的位置找不准了，会请你重新选择对应片段。'],
  ['第四步 · 可以撤销','先看看要改哪里，再决定。','练习里故意少写了一个冒号。你可以先看修改对比，再决定要不要采用。','点击后会打开有错的练习和修改对比。左边是原来，右边是建议。确认后点“应用修复”，再按 Ctrl+S 保存。','打开改错练习与对比','fix','成功时：else 后面增加了 : 。想退回可以按 Ctrl+Z；练习改过了就不会再次提示同一个修复。','“修改对比”是什么意思？','把改前和改后放在一起看。还没点“应用修复”的时候，你的源码不会被修改。']
 ];
 function render(){const s=steps[current];['eyebrow','heading','lead','instruction','mainAction','expected','wordTitle','wordBody'].forEach((id,i)=>{const map=[0,1,2,3,4,6,7,8];document.getElementById(id).textContent=s[map[i]]});document.getElementById('mainAction').dataset.action=s[5];document.getElementById('error').textContent='';document.getElementById('next').textContent=current===3?'再看一遍，从第一步开始':'我完成了，下一步 →';document.querySelectorAll('[data-step]').forEach(b=>{if(Number(b.dataset.step)===current)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});api.setState({step:current});}
 function select(step){current=step;render();api.postMessage({action:'step',step});}
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.step!==undefined)select(Number(b.dataset.step));else if(b.id==='next')select((current+1)%4);else if(b.dataset.action)api.postMessage({action:b.dataset.action});});
 window.addEventListener('message',event=>{const m=event.data;if(m?.kind==='state'&&Number.isInteger(m.step)&&m.step>=0&&m.step<4){current=m.step;render()}if(m?.kind==='error')document.getElementById('error').textContent=m.text;});
 const previous=api.getState();if(Number.isInteger(previous?.step)&&previous.step>=0&&previous.step<4)current=previous.step;render();api.postMessage({action:'ready'});
})();
