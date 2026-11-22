import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Sprout,Languages,CheckCircle2,ShieldCheck,UploadCloud,Leaf,ArrowRight,LoaderCircle} from 'lucide-react';
import './styles.css';
import {QUESTIONNAIRES,LANGS,TEXT,RATING_GUIDE} from './questionnaire';

const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const emptyDraft=()=>({});
const getName=(type,a)=>type==='farmer'?String(a.name||'').trim():String(a.contact_person||a.fpo_name||'').trim();
const mobileDigits=v=>String(v||'').replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'');
const getFieldLabel=(q,lang)=>q[lang]||q.hi;
const getOptionValue=o=>o.en;
const getOptionLabel=(o,lang)=>o[lang]||o.hi;

function App(){
 const [lang,setLang]=useState('hi');
 const [languageChosen,setLanguageChosen]=useState(false);
 const [type,setType]=useState('farmer');
 const [answers,setAnswers]=useState(emptyDraft);
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [receipt,setReceipt]=useState(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [draftKey,setDraftKey]=useState(()=>crypto.randomUUID());
 const [draftRestored,setDraftRestored]=useState(false);
 const [activeSection,setActiveSection]=useState('profile');
 const [saveState,setSaveState]=useState('waiting');
 const saveTimer=useRef(null);
 const lastLookup=useRef('');
 const isRestoring=useRef(false);
 const t=TEXT[lang];
 const sections=QUESTIONNAIRES[type];
 const allQuestions=useMemo(()=>sections.flatMap(s=>s.questions),[sections]);

 useEffect(()=>{document.documentElement.lang=lang;},[lang]);
 useEffect(()=>{setActiveSection(sections[0]?.id||'');},[type]);
 useEffect(()=>{
   if(typeof IntersectionObserver==='undefined')return;
   const nodes=sections.map(section=>document.getElementById(`section-${section.id}`)).filter(Boolean);
   if(!nodes.length)return;
   const observer=new IntersectionObserver(entries=>{
     const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
     if(visible[0])setActiveSection(visible[0].target.dataset.sectionId||'');
   },{rootMargin:'-105px 0px -62% 0px',threshold:0});
   nodes.forEach(node=>observer.observe(node));
   return()=>observer.disconnect();
 },[type,languageChosen,receipt]);
 const update=(id,value)=>setAnswers(prev=>({...prev,[id]:value}));
 const isVisible=q=>{
   if(!q.showWhen)return true;
   const current=answers[q.showWhen.field];
   if(q.showWhen.equals!==undefined)return current===q.showWhen.equals || current===q.showWhen.equalsEn;
   if(q.showWhen.in)return q.showWhen.in.includes(current);
   return true;
 };
 const setTypeSafe=next=>{
   if(next===type)return;
   setType(next);setAnswers({});setConsent(false);setReceipt(null);setError('');setNotice('');setDraftKey(crypto.randomUUID());setDraftRestored(false);setSaveState('waiting');lastLookup.current='';
 };

 // Restore a pending draft only after matching name + mobile are entered.
 useEffect(()=>{
   const name=getName(type,answers),mobile=mobileDigits(answers.mobile);
   if(!name||!/^([6-9]\d{9})$/.test(mobile)){setSaveState('waiting');return;}
   const identity=`${type}|${name.toLocaleLowerCase()}|${mobile}`;
   if(lastLookup.current===identity)return;
   const timer=setTimeout(async()=>{
     lastLookup.current=identity;
     try{
       // Restore same-browser progress only when both entered identity fields match.
       try{
         const local=JSON.parse(localStorage.getItem(`kk-new-local-${type}`)||'null');
         const localName=getName(type,local?.answers||{}).toLocaleLowerCase();
         const localMobile=mobileDigits(local?.answers?.mobile);
         if(local?.surveyType===type&&localName===name.toLocaleLowerCase()&&localMobile===mobile){
           isRestoring.current=true;
           setDraftKey(local.draftKey||crypto.randomUUID());
           setAnswers(prev=>({...local.answers,...prev,name:prev.name||local.answers?.name,contact_person:prev.contact_person||local.answers?.contact_person,mobile:prev.mobile||local.answers?.mobile}));
           setLang(local.language||lang);setDraftRestored(true);setActiveSection(sections[local.currentStep]?.id||sections[0]?.id||'');setSaveState('saved');
           setNotice(lang==='en'?'Your saved draft has been restored.':lang==='as'?'আপোনাৰ সংৰক্ষিত খচৰা পুনৰুদ্ধাৰ কৰা হৈছে।':'आपका सेव किया हुआ अधूरा सर्वे वापस मिल गया है।');
           setTimeout(()=>{isRestoring.current=false;},0);
         }
       }catch{}
       const r=await fetch(`${API}/api/surveys/draft/lookup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mobile,surveyType:type,surveyVersion:'new'})});
       if(!r.ok)return;
       const data=await r.json();
       if(data.draft?.draft_key){
         isRestoring.current=true;
         setDraftKey(data.draft.draft_key);
         setAnswers(prev=>({...data.draft.answers,...prev,name:prev.name||data.draft.answers?.name,contact_person:prev.contact_person||data.draft.answers?.contact_person,mobile:prev.mobile||data.draft.answers?.mobile}));
         setLang(data.draft.language||lang);setDraftRestored(true);setActiveSection(sections[data.draft.current_step]?.id||sections[0]?.id||'');setSaveState('saved');setNotice(lang==='en'?'Your saved draft has been restored.':lang==='as'?'আপোনাৰ সংৰক্ষিত খচৰা পুনৰুদ্ধাৰ কৰা হৈছে।':'आपका सेव किया हुआ अधूरा सर्वे वापस मिल गया है।');
         setTimeout(()=>{isRestoring.current=false;},0);
       }
     }catch(e){console.warn('Draft lookup unavailable',e);}
   },650);
   return()=>clearTimeout(timer);
 },[type,answers.name,answers.contact_person,answers.mobile]);

 // Browser + server autosave. Server stores pending only when contact name and mobile exist.
 useEffect(()=>{
   if(!languageChosen||receipt||isRestoring.current)return;
   const snapshot={draftKey,surveyType:type,surveyVersion:'new',language:lang,answers,currentStep:Math.max(0,sections.findIndex(section=>section.id===activeSection))};
   try{localStorage.setItem(`kk-new-local-${type}`,JSON.stringify(snapshot));}catch{}
   const name=getName(type,answers),mobile=mobileDigits(answers.mobile);
   if(!name||!/^([6-9]\d{9})$/.test(mobile)){setSaveState('waiting');return;}
   clearTimeout(saveTimer.current);
   saveTimer.current=setTimeout(async()=>{
     try{
       setSaveState('saving');
       const response=await fetch(`${API}/api/surveys/draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
       if(!response.ok)throw new Error(`Draft save failed (${response.status})`);
       const result=await response.json();
       if(result.saved===false){setSaveState('waiting');return;}
       try{localStorage.setItem(`kk-new-local-${type}`,JSON.stringify(snapshot));}catch{}
       setSaveState('saved');
     }catch(e){console.warn('Draft autosave failed',e);setSaveState('error');}
   },900);
   return()=>clearTimeout(saveTimer.current);
 },[answers,lang,type,draftKey,languageChosen,receipt,activeSection]);

 const goToSection=id=>{
   setActiveSection(id);
   document.getElementById(`section-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'});
 };
 const activeSectionIndex=Math.max(0,sections.findIndex(section=>section.id===activeSection));
 const saveMessage=saveState==='saving'?t.saving:saveState==='saved'?t.saved:saveState==='error'?t.saveError:t.draftNeedContact;

 const chooseFile=async(q,file)=>{
   if(!file)return;
   if(!file.type.startsWith('image/')){setError(lang==='en'?'Please choose an image file.':lang==='as'?'অনুগ্ৰহ কৰি এখন ছবি বাছনি কৰক।':'कृपया फोटो वाली इमेज फाइल चुनें।');return;}
   try{
     const dataUrl=await new Promise((resolve,reject)=>{
       const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
     });
     const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=dataUrl;});
     const scale=Math.min(1,1500/Math.max(image.width,image.height));
     const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
     canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
     const compressed=canvas.toDataURL('image/jpeg',0.78);
     if(compressed.length>2_500_000){setError(lang==='en'?'Image is too large. Please choose a smaller photo.':lang==='as'?'ছবিখন বহুত ডাঙৰ। সৰু ফটো বাছনি কৰক।':'फोटो बहुत बड़ा है। कृपया छोटी फोटो चुनें।');return;}
     update(q.id,{fileName:file.name,dataUrl:compressed,mime:'image/jpeg'});setError('');
   }catch(e){setError(lang==='en'?'Could not read this image.':lang==='as'?'ছবিখন পঢ়িব পৰা নগ’ল।':'फोटो पढ़ी नहीं जा सकी।');}
 };

 const validate=()=>{
   for(const q of allQuestions){
     if(!isVisible(q))continue;
     const v=answers[q.id];
     if(q.required && (v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length))){setError(`${getFieldLabel(q,lang)} — ${t.required}`);document.getElementById(q.id)?.scrollIntoView({behavior:'smooth',block:'center'});return false;}
     if(q.id==='mobile'&&v&& !/^[6-9]\d{9}$/.test(mobileDigits(v))){setError(t.phone);document.getElementById(q.id)?.scrollIntoView({behavior:'smooth',block:'center'});return false;}
     if(q.max&&Array.isArray(v)&&v.length>q.max){setError(t.max3);document.getElementById(q.id)?.scrollIntoView({behavior:'smooth',block:'center'});return false;}
     const isOtherChoice=x=>x==='Other'||String(x||'').toLowerCase().startsWith('other ');
     const otherSelected=q.otherText&&(isOtherChoice(v)||(Array.isArray(v)&&v.some(isOtherChoice)));
     if(otherSelected&&!String(answers[`${q.id}_other`]||'').trim()){setError(`${q.otherLabel?.[lang]||t.other} — ${t.required}`);document.getElementById(q.id)?.scrollIntoView({behavior:'smooth',block:'center'});return false;}
     if(q.subFields?.some(sf=>sf.required&&!String(answers[sf.id]||'').trim())){setError(`${getFieldLabel(q,lang)} — ${t.required}`);document.getElementById(q.id)?.scrollIntoView({behavior:'smooth',block:'center'});return false;}
     if(q.type==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){setError(lang==='en'?'Enter a valid email address.':lang==='as'?'সঠিক ইমেইল ঠিকনা দিয়ক।':'सही ईमेल पता दर्ज करें।');return false;}
   }
   if(!consent){setError(t.consentError);return false;}
   return true;
 };
 const submit=async()=>{
   setError('');if(!validate())return;
   setBusy(true);
   try{
     const cleanAnswers={...answers};
     for(const q of allQuestions){
       if(!isVisible(q)){
         delete cleanAnswers[q.id];
         delete cleanAnswers[`${q.id}_other`];
         q.subFields?.forEach(sf=>delete cleanAnswers[sf.id]);
       }
     }
     const payload={draftKey,language:lang,surveyType:type,surveyVersion:'new',answers:cleanAnswers,consent:true};
     const r=await fetch(`${API}/api/surveys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const data=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(data.error||data.message||t.error);
     setReceipt(data);setNotice('');
     localStorage.removeItem(`kk-new-local-${type}`);
   }catch(e){console.warn('Survey submission failed',e);setError(t.error);}finally{setBusy(false);}
 };
 const optionToggle=(q,value)=>{
   const old=Array.isArray(answers[q.id])?answers[q.id]:[];
   if(old.includes(value))update(q.id,old.filter(x=>x!==value));
   else if(!q.max||old.length<q.max)update(q.id,[...old,value]);
   else setError(t.max3);
 };
 const renderQuestion=q=>{
   if(!isVisible(q))return null;
   const value=answers[q.id];
   const inputId=q.id;
   const label=getFieldLabel(q,lang);
   const opts=q.options||[];
   const isOtherChoice=x=>x==='Other'||String(x||'').toLowerCase().startsWith('other ');
   const showOther=q.otherText&&((Array.isArray(value)&&value.some(isOtherChoice))||isOtherChoice(value));
   const otherLabel=q.otherLabel?.[lang]||q.otherLabel?.hi||t.other;
   const field=<>
    {q.type==='text'||q.type==='number'||q.type==='tel'||q.type==='email'?<input id={inputId} type={q.type==='text'?'text':q.type} min={q.id==='age'?1:undefined} max={q.id==='age'?120:undefined} step={q.id==='age'?1:undefined} value={value||''} onChange={e=>{const next=e.target.value;if(q.id==='age'&&next!==''&&(!Number.isInteger(Number(next))||Number(next)<1||Number(next)>120)){setError(lang==='en'?'Age must be a whole number between 1 and 120.':lang==='as'?'???? ?? ??? ???? ????? ????? ?????? ??? ??????':'??? 1 ?? 120 ?? ??? ???? ?????? ???? ??????');return;}if(q.id==='age')setError('');update(q.id,next);}} placeholder={q.placeholder?.[lang]||q.placeholder?.hi||''} inputMode={q.type==='tel'||q.id==='age'?'numeric':undefined}/>:null}
    {q.type==='textarea'?<textarea id={inputId} rows="3" value={value||''} onChange={e=>update(q.id,e.target.value)} placeholder={lang==='en'?'Write your answer…':lang==='as'?'আপোনাৰ উত্তৰ লিখক…':'अपना उत्तर लिखें…'}/>:null}
    {q.type==='radio'?<div className="option-list">{opts.map((o,i)=><label className={`option ${value===getOptionValue(o)?'selected':''}`} key={i}><input type="radio" name={q.id} value={getOptionValue(o)} checked={value===getOptionValue(o)} onChange={()=>update(q.id,getOptionValue(o))}/><span>{getOptionLabel(o,lang)}</span></label>)}</div>:null}
    {q.type==='rating'?<div className="rating-options">{opts.map((o,i)=><label className={`rating-choice ${value===getOptionValue(o)?'selected':''}`} key={i} title={`${i+1}: ${getOptionLabel(o,lang)}`}><input type="radio" name={q.id} value={getOptionValue(o)} checked={value===getOptionValue(o)} onChange={()=>update(q.id,getOptionValue(o))}/><span aria-hidden="true">{'★'.repeat(i+1)}</span><small>{i+1}</small></label>)}</div>:null}
    {q.type==='checks'?<div className="option-list checks">{opts.map((o,i)=><label className={`option ${Array.isArray(value)&&value.includes(getOptionValue(o))?'selected':''}`} key={i}><input type="checkbox" checked={Array.isArray(value)&&value.includes(getOptionValue(o))} onChange={()=>optionToggle(q,getOptionValue(o))}/><span>{getOptionLabel(o,lang)}</span></label>)}</div>:null}
    {q.type==='file'?<div className="upload-box"><label className="upload-button" htmlFor={`${q.id}-file`}><UploadCloud size={18}/>{t.upload}<input id={`${q.id}-file`} type="file" accept="image/*" onChange={e=>chooseFile(q,e.target.files?.[0])}/></label>{value?.dataUrl&&<div className="upload-preview"><img src={value.dataUrl} alt="Uploaded survey attachment"/><span>{value.fileName||t.uploaded}</span><button type="button" className="text-button" onClick={()=>update(q.id,null)}>{lang==='en'?'Remove':lang==='as'?'আঁতৰাওক':'हटाएँ'}</button></div>}</div>:null}
   </>;
   const subFields=q.subFields?.map(sf=><div className="sub-field" key={sf.id}><label htmlFor={sf.id}>{sf.label[lang]||sf.label.hi}{sf.required&&<b className="required-mark"> *</b>}</label><input id={sf.id} type="text" value={answers[sf.id]||''} onChange={e=>update(sf.id,e.target.value)} /></div>);
   const attachment=q.attachedFile&&(!q.attachedFile.showWhen||isVisible({showWhen:q.attachedFile.showWhen}))?q.attachedFile:null;
   const attachmentValue=attachment?answers[attachment.id]:null;
   const attachmentControl=attachment?<div className="attached-upload"><label className="attached-upload-label" htmlFor={`${attachment.id}-file`}>{attachment.label?.[lang]||attachment.label?.hi}<span className="optional-tag">{t.optional}</span></label><label className="upload-button" htmlFor={`${attachment.id}-file`}><UploadCloud size={18}/>{t.upload}<input id={`${attachment.id}-file`} type="file" accept="image/*" onChange={e=>chooseFile({id:attachment.id},e.target.files?.[0])}/></label>{attachmentValue?.dataUrl&&<div className="upload-preview"><img src={attachmentValue.dataUrl} alt="Uploaded survey attachment"/><span>{attachmentValue.fileName||t.uploaded}</span><button type="button" className="text-button" onClick={()=>update(attachment.id,null)}>{lang==='en'?'Remove':lang==='as'?'আঁতৰাওক':'हटाएँ'}</button></div>}</div>:null;
   const groupedChildren=q.groupChildren?.map(childId=>allQuestions.find(item=>item.id===childId)).filter(Boolean).map(child=>renderQuestion(child)).filter(Boolean);
   return <article className={`question-card ${q.type==='group'?'question-group-card':''} ${q.type==='rating'?'rating-question-card':''}`} id={inputId} key={q.id}><div className="question-heading">{q.number&&<span className="question-number">{q.number}</span>}<label>{label}{q.required&&<b className="required-mark"> *</b>}</label>{q.type==='file'&&<span className="optional-tag">{t.optional}</span>}</div>{q.hint&&<p className="question-hint">{q.hint[lang]||q.hint.hi}</p>}{q.subFieldsBefore&&subFields}{field}{!q.subFieldsBefore&&subFields}{showOther&&<div className="sub-field"><label>{otherLabel}</label><input type="text" value={answers[`${q.id}_other`]||''} onChange={e=>update(`${q.id}_other`,e.target.value)}/></div>}{groupedChildren?.length>0&&<div className="question-followups">{groupedChildren}</div>}{attachmentControl}</article>;
 };

 if(receipt)return <div className="success-page"><div className="success-card"><div className="success-icon"><CheckCircle2 size={42}/></div><div className="eyebrow">KHUSHHAL KISAN · SURVEY</div><h1>{t.thank}</h1><p>{t.thankText}</p><div className="receipt-id"><small>{t.id}</small><strong>{receipt.responseId||receipt.response_id||'AKK'}</strong></div><button className="primary-button" onClick={()=>{setReceipt(null);setAnswers({});setConsent(false);setDraftKey(crypto.randomUUID());setActiveSection(sections[0]?.id||'');setSaveState('waiting');}}>{t.home}<ArrowRight size={17}/></button></div></div>;
 if(!languageChosen)return <div className="language-screen"><div className="language-card"><div className="language-logo"><Sprout size={30}/></div><div className="eyebrow">KHUSHHAL KISAN</div><h1>{t.choose}</h1><p>{lang==='en'?'Select your preferred language to continue.':lang==='as'?'আগবাঢ়িবলৈ আপোনাৰ পছন্দৰ ভাষা বাছনি কৰক।':'आगे बढ़ने के लिए अपनी पसंद की भाषा चुनें।'}</p><div className="language-options">{LANGS.map(l=><button key={l.id} className={`language-option ${lang===l.id?'active':''}`} onClick={()=>setLang(l.id)}><span>{l.label}</span><span>{l.native}</span></button>)}</div><button className="primary-button full" onClick={()=>setLanguageChosen(true)}>{lang==='en'?'Continue':lang==='as'?'আগবাঢ়ক':'आगे बढ़ें'}<ArrowRight size={17}/></button></div></div>;

 return <div className="app-shell"><header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Sprout size={25}/></span><span><b>Khushhal Kisan</b><small>{lang==='en'?'FARMER-FIRST AGRICULTURE':lang==='as'?'কৃষক-কেন্দ্ৰিক কৃষি':'किसान-केंद्रित कृषि'}</small></span></a><div className="header-actions"><div className="lang-select"><Languages size={17}/><select aria-label={t.change} value={lang} onChange={e=>setLang(e.target.value)}>{LANGS.map(l=><option value={l.id} key={l.id}>{l.label}</option>)}</select></div><button className="change-language" onClick={()=>setLanguageChosen(false)}>{t.change}</button></div></header>
 <main id="top" className="survey-main"><section className="hero"><div className="hero-copy"><div className="pill"><span className="pulse"/>{lang==='en'?'FARMER NEEDS & MARKET VALIDATION':lang==='as'?'কৃষকৰ প্ৰয়োজন আৰু বজাৰ সমীক্ষা':'किसान की जरूरतें और बाजार सर्वे'}</div><h1>{lang==='en'?<>Your experience.<br/><em>A better farming future.</em></>:lang==='as'?<>আপোনাৰ অভিজ্ঞতা।<br/><em>উন্নত কৃষিৰ ভৱিষ্যৎ।</em></>:<>आपका अनुभव।<br/><em>बेहतर खेती का भविष्य।</em></>}</h1><p>{lang==='en'?'Your answers will help us understand real farming needs and build useful support services.':lang==='as'?'আপোনাৰ উত্তৰে বাস্তৱ কৃষি প্ৰয়োজন বুজিবলৈ আৰু উপযোগী সহায়ক সেৱা গঢ়িবলৈ সহায় কৰিব।':'आपके जवाब हमें किसानों की वास्तविक जरूरतें समझने और उपयोगी सहायता सेवाएँ बनाने में मदद करेंगे।'}</p></div><div className="hero-art"><div className="art-circle"><Leaf size={74}/></div><div className="art-caption">{lang==='en'?'Growing together':lang==='as'?'একেলগে আগবাঢ়োঁ':'मिलकर आगे बढ़ें'}</div></div></section>
 <section className="survey-type-switch"><div><span className="switch-kicker">{lang==='en'?'SELECT SURVEY':lang==='as'?'সমীক্ষা বাছনি কৰক':'सर्वे चुनें'}</span><h2>{lang==='en'?'Who are you responding as?':lang==='as'?'আপুনি কাৰ হৈ উত্তৰ দিছে?':'आप किसकी ओर से जवाब दे रहे हैं?'}</h2></div><div className="type-buttons"><button className={type==='farmer'?'active':''} onClick={()=>setTypeSafe('farmer')}>{t.farmer}</button><button className={type==='stakeholder'?'active':''} onClick={()=>setTypeSafe('stakeholder')}>{t.fpo}</button></div></section>
 {type==='stakeholder'&&<div className="fpo-note">{t.fpoIntro}</div>}
 <p className="form-intro">{t.intro}</p>{notice&&<div className="notice-msg">{notice}</div>}
 <div className="survey-layout">
  <aside className="section-sidebar">
   <div className="sidebar-progress">
    <div className="sidebar-progress-label"><strong>{t.section} {activeSectionIndex+1} / {sections.length}</strong><span>{Math.round(((activeSectionIndex+1)/sections.length)*100)}%</span></div>
    <div className="sidebar-progress-track"><span style={{width:`${((activeSectionIndex+1)/sections.length)*100}%`}}/></div>
   </div>
   <nav className="section-nav" aria-label={t.sectionNavigation}>
    {sections.map((section,si)=><button type="button" key={section.id} className={`section-nav-item ${activeSection===section.id?'active':''}`} aria-current={activeSection===section.id?'step':undefined} onClick={()=>goToSection(section.id)}>
      <span className="section-nav-number">{String(si+1).padStart(2,'0')}</span>
      <span className="section-nav-title">{section.title[lang]||section.title.hi}</span>
    </button>)}
   </nav>
  </aside>
  <div className="survey-content">
   <div className="survey-sections">{sections.map((section,si)=><section className="survey-section" id={`section-${section.id}`} data-section-id={section.id} key={section.id}>
    <div className="section-heading"><div className="section-kicker">{t.section} {si+1}</div><h2>{section.title[lang]||section.title.hi}</h2>
     {section.intro&&<div className={section.mainQuestionNumber?'section-main-question':'section-intro'}>{section.mainQuestionNumber&&<strong>{lang==='en'?'Question':lang==='as'?'প্ৰশ্ন':'प्रश्न'} {section.mainQuestionNumber}.</strong>}<p>{section.intro[lang]||section.intro.hi}</p></div>}
    </div>
    {section.id==='ai'&&<div className="rating-guide"><div className="rating-guide-title">{t.ratingGuide}</div><div className="rating-guide-grid">{RATING_GUIDE.map(item=><div className="rating-guide-item" key={item.value}><span className="rating-guide-stars">{item.stars}</span><b>{item.value}</b><small>{item[lang]||item.hi}</small></div>)}</div></div>}
    <div className="question-grid">{section.questions.filter(item=>!section.questions.some(parent=>parent.groupChildren?.includes(item.id))).map(renderQuestion)}</div>
   </section>)}</div>
   <div className="submit-panel"><label className="consent-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{t.consent}</span></label>{error&&<div className="error-msg" role="alert">{error}</div>}<div className="submit-bottom"><div className="save-note"><ShieldCheck size={17}/><span>{saveMessage}</span></div><button className="primary-button submit-button" disabled={busy} onClick={submit}>{busy?<><LoaderCircle className="spin" size={18}/>{t.submitting}</>:<>{t.submit}<ArrowRight size={17}/></>}</button></div></div>
  </div>
 </div>
 </main><footer className="site-footer"><div><Sprout size={19}/><b>Khushhal Kisan</b></div><span>{lang==='en'?'A farmer-first support platform · Uttar Pradesh, India':lang==='as'?'কৃষক-কেন্দ্ৰিক সহায়ক মঞ্চ · উত্তৰ প্ৰদেশ, ভাৰত':'किसान-केंद्रित सहायता प्लेटफॉर्म · उत्तर प्रदेश, भारत'}</span><small>© {new Date().getFullYear()} AIVIRINCHI</small></footer></div>;
}

createRoot(document.getElementById('root')).render(<App/>);