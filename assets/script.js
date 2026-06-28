(function(){
  var root=document.documentElement;
  try{var saved=localStorage.getItem('ir_theme');if(saved==='dark'){root.setAttribute('data-theme','dark');}}catch(e){}
  var tb=document.getElementById('themebtn');
  if(tb){tb.addEventListener('click',function(){
    var dark=root.getAttribute('data-theme')==='dark';
    if(dark){root.removeAttribute('data-theme');}else{root.setAttribute('data-theme','dark');}
    try{localStorage.setItem('ir_theme',dark?'light':'dark');}catch(e){}
  });}
  var inp=document.getElementById('search');
  var box=document.getElementById('searchresults');
  var idx=window.SEARCH_INDEX||[];
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';});}
  function run(q){
    q=(q||'').trim().toLowerCase();
    if(q.length<2){box.hidden=true;box.innerHTML='';return;}
    var terms=q.split(/\s+/);
    var res=[];
    for(var i=0;i<idx.length;i++){
      var it=idx[i];var hay=(it.t+' '+it.s).toLowerCase();var ok=true;
      for(var j=0;j<terms.length;j++){if(hay.indexOf(terms[j])<0){ok=false;break;}}
      if(ok){res.push(it);if(res.length>=12)break;}
    }
    if(!res.length){box.innerHTML='<div class="sr-empty">Ingen treff</div>';box.hidden=false;return;}
    var html='';
    for(var k=0;k<res.length;k++){html+='<a href="'+res[k].u+'"><span class="sr-t">'+esc(res[k].t)+'</span><span class="sr-x">'+esc(res[k].x)+'</span></a>';}
    box.innerHTML=html;box.hidden=false;
  }
  if(inp&&box){
    inp.addEventListener('input',function(){run(inp.value);});
    inp.addEventListener('focus',function(){if(inp.value)run(inp.value);});
    document.addEventListener('keydown',function(e){
      if(e.key==='/'&&document.activeElement!==inp){e.preventDefault();inp.focus();}
      else if(e.key==='Escape'){box.hidden=true;if(inp)inp.blur();}
    });
    document.addEventListener('click',function(e){if(!box.contains(e.target)&&e.target!==inp){box.hidden=true;}});
  }
  var nt=document.getElementById('navtoggle');
  var side=document.querySelector('.sidebar');
  if(nt&&side){side.addEventListener('click',function(e){if(e.target.tagName==='A'){nt.checked=false;}});}
})();
