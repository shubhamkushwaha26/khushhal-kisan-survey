import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Sprout, Languages, ArrowRight, ArrowLeft, CheckCircle2, ClipboardList, ShieldCheck, Leaf, CircleHelp, LoaderCircle} from 'lucide-react';
import './styles.css';

const sections = [
 {id:'profile', icon:'profile', en:'Farmer profile', hi:'किसान की जानकारी', descEn:'Help us understand your farming background.', descHi:'अपनी खेती के बारे में बताएं।', questions:[
  {id:'name',type:'text',required:true,en:'What is your name?',hi:'आपका नाम क्या है?',placeholder:'Your name'},
  {id:'mobile',type:'text',required:true,en:'What is your mobile number?',hi:'आपका मोबाइल नंबर क्या है?',placeholder:'10-digit mobile number'},
  {id:'email',type:'text',required:false,en:'Email address (optional)',hi:'ईमेल पता (वैकल्पिक)',placeholder:'name@example.com'},
  {id:'whatsappGroup',type:'radio',required:true,en:'To stay connected with us and receive the latest farming information, would you like to join our WhatsApp group?',hi:'हमसे जुड़े रहने और खेती की नई-नई जानकारी पाने के लिए क्या आप हमारे WhatsApp ग्रुप से जुड़ना चाहेंगे?',options:[['Yes','हाँ'],['No','नहीं']]},
  {id:'location',type:'text',en:'Village, block and district where you farm',hi:'आप किस गाँव, ब्लॉक और जिले में खेती करते हैं?',placeholder:'Village, Block, District'},
  {id:'age',type:'radio',en:'What is your age group?',hi:'आपकी उम्र किस समूह में है?',options:[['18–30 years','18–30 वर्ष'],['31–45 years','31–45 वर्ष'],['46–60 years','46–60 वर्ष'],['Above 60 years','60 वर्ष से अधिक']]},
  {id:'experience',type:'radio',en:'How long have you been farming?',hi:'आप कितने समय से खेती कर रहे हैं?',options:[['1–5 years','1–5 वर्ष'],['6–10 years','6–10 वर्ष'],['More than 10 years','10 वर्ष से अधिक']]},
  {id:'land',type:'radio',en:'How much agricultural land do you farm?',hi:'आपके पास कितनी कृषि भूमि है?',options:[['Less than 1 acre','1 एकड़ से कम'],['1–2 acres','1–2 एकड़'],['2–5 acres','2–5 एकड़'],['More than 5 acres','5 एकड़ से अधिक']]},
  {id:'crops',type:'text',en:'Which crops do you grow?',hi:'आप कौन-कौन सी फसलें उगाते हैं?',placeholder:'e.g. wheat, paddy, potato'},
  {id:'landOwnership',type:'radio',en:'Do you farm your own land or leased/rented land?',hi:'आप अपनी जमीन पर खेती करते हैं या पट्टे/किराये पर?',options:[['Own land','अपनी जमीन'],['Leased/rented land','पट्टे/किराये की जमीन'],['Both','दोनों']]}
 ]},
 {id:'challenges',icon:'challenges',en:'Your farming challenges',hi:'खेती की चुनौतियाँ',descEn:'Your real experiences help us focus on the problems that matter most.',descHi:'आपके अनुभव हमें असली समस्याओं को समझने में मदद करेंगे।',questions:[
  {id:'topProblems',type:'textarea',en:'What are the top 3 problems you face in farming?',hi:'खेती में आपको सबसे बड़ी 3 समस्याएँ कौन-सी आती हैं?',placeholder:'Describe your biggest challenges…'},
  {id:'seriousProblems',type:'checks',max:5,en:'Which problems are most serious for you? (Select up to 5)',hi:'आपके लिए कौन-सी समस्याएँ सबसे गंभीर हैं? (अधिकतम 5 चुनें)',options:[['Crop disease or pest attack','फसल में रोग या कीट का हमला'],['Unreliable weather information','मौसम की सही जानकारी न मिलना'],['Irrigation or water shortage','सिंचाई या पानी की कमी'],['Correct fertilizer/pesticide use','खाद/कीटनाशक का सही उपयोग'],['Soil quality and soil health','मिट्टी की गुणवत्ता और स्वास्थ्य'],['Low market price','फसल का कम बाजार भाव'],['High production cost','उत्पादन लागत अधिक होना'],['Labour availability','मजदूरों की उपलब्धता'],['Government scheme information','सरकारी योजनाओं की जानकारी'],['Other','अन्य']]},
  {id:'financialLoss',type:'textarea',en:'Which problem caused you the greatest financial loss last season?',hi:'पिछले सीजन में किस समस्या से आपको सबसे ज्यादा आर्थिक नुकसान हुआ?',placeholder:'Problem and approximate loss (if known)'},
  {id:'diseaseExperience',type:'textarea',en:'Have your crops faced disease or pest attacks? How did you identify and treat them?',hi:'क्या आपकी फसल में रोग या कीट का हमला हुआ? आपने पहचान और उपचार कैसे किया?',placeholder:'Tell us what happened…'},
  {id:'infoSources',type:'checks',en:'Where do you currently get farming advice?',hi:'अभी आपको खेती की सलाह कहाँ से मिलती है?',options:[['Agriculture officer / KVK','कृषि अधिकारी / KVK'],['Local dealer / input shop','स्थानीय डीलर / कृषि दुकान'],['Experienced farmers','अनुभवी किसान'],['YouTube / Google','YouTube / Google'],['WhatsApp groups','WhatsApp ग्रुप'],['Agriculture mobile apps','कृषि मोबाइल ऐप'],['Other','अन्य']]},
  {id:'infoGaps',type:'textarea',en:'What is missing or frustrating about your current information sources?',hi:'मौजूदा जानकारी के साधनों में आपको क्या कमी लगती है?',placeholder:'What could be better?'},
  {id:'seasonCost',type:'text',en:'Approximate farming expense and loss per season (optional)',hi:'एक सीजन में खेती का अनुमानित खर्च और नुकसान (वैकल्पिक)',placeholder:'e.g. expense ₹25,000; loss ₹5,000'}
 ]},
 {id:'digital',icon:'digital',en:'Technology & AI services',hi:'तकनीक और AI सेवाएँ',descEn:'Tell us which digital support would be genuinely useful to you.',descHi:'बताएं कि कौन-सी डिजिटल सहायता आपके काम आएगी।',questions:[
  {id:'smartphone',type:'radio',en:'Do you use a smartphone?',hi:'क्या आप स्मार्टफोन इस्तेमाल करते हैं?',options:[['Daily','रोज़'],['Sometimes','कभी-कभी'],['No','नहीं']]},
  {id:'appsUsed',type:'textarea',en:'Have you used an agriculture app or digital farming service? Which one and how was your experience?',hi:'क्या आपने कृषि ऐप या डिजिटल सेवा इस्तेमाल की है? कौन-सी और अनुभव कैसा रहा?',placeholder:'App/service name and experience'},
  {id:'photoDiagnosis',type:'radio',en:'Would photo-based crop disease/pest identification and treatment guidance be useful?',hi:'क्या फोटो से फसल के रोग/कीट की पहचान और उपचार की सलाह उपयोगी होगी?',options:[['Very useful','बहुत उपयोगी'],['Somewhat useful','थोड़ी उपयोगी'],['Not useful','उपयोगी नहीं'],['Not sure','पता नहीं']]},
  {id:'digitalNeeds',type:'checks',max:3,en:'Which digital services do you need most? (Select up to 3)',hi:'आपको कौन-सी डिजिटल सेवाएँ सबसे ज्यादा चाहिए? (अधिकतम 3)',options:[['Crop disease detection','फसल रोग की पहचान'],['Weather and rain alerts','मौसम और बारिश अलर्ट'],['Irrigation scheduling','सिंचाई का सही समय'],['Soil health and fertilizer advice','मिट्टी की सेहत और खाद की सलाह'],['Pest management guidance','कीट प्रबंधन सलाह'],['Crop planning and sowing guidance','फसल योजना और बुवाई सलाह'],['Mandi prices and market information','मंडी भाव और बाजार जानकारी'],['Government scheme information','सरकारी योजनाओं की जानकारी'],['Local-language agriculture expert support','स्थानीय भाषा में कृषि विशेषज्ञ सहायता']]},
  {id:'language',type:'radio',en:'Which language or format would you prefer?',hi:'आप किस भाषा या तरीके में जानकारी पसंद करेंगे?',options:[['Hindi','हिंदी'],['English','अंग्रेज़ी'],['Assamese','অসমীয়া'],['Local/regional language','स्थानीय/क्षेत्रीय भाषा'],['Voice-based guidance','आवाज़ के जरिए सलाह']]},
  {id:'trustFactors',type:'checks',en:'What would help you trust a recommendation?',hi:'सलाह पर भरोसा करने के लिए आपको क्या चाहिए?',options:[['Agriculture expert confirmation','कृषि विशेषज्ञ की पुष्टि'],['Local agriculture department recommendation','स्थानीय कृषि विभाग की सलाह'],['Explanation with recommendation','सलाह के साथ कारण/समझाइश'],['Other farmers’ reviews','दूसरे किसानों की राय'],['Option to try it first','पहले आजमाने का विकल्प']]},
  {id:'digitalBarriers',type:'checks',en:'What could make a digital agriculture service difficult to use?',hi:'डिजिटल कृषि सेवा इस्तेमाल करने में क्या परेशानी हो सकती है?',options:[['Internet connectivity','इंटरनेट की समस्या'],['Difficulty using a smartphone','स्मार्टफोन चलाने में कठिनाई'],['Lack of trust','भरोसे की कमी'],['Language problem','भाषा की समस्या'],['Cost','खर्च'],['Doubt about accuracy','सही परिणाम मिलने का संदेह'],['No difficulty expected','कोई परेशानी नहीं']]}
 ]},
 {id:'payment',icon:'payment',en:'Service preference & payment',hi:'सेवा की पसंद और भुगतान',descEn:'There are no right or wrong answers. Please share your honest preference.',descHi:'कोई सही या गलत जवाब नहीं है। अपनी वास्तविक पसंद बताएं।',questions:[
  {id:'useIntent',type:'radio',en:'Would you use a service that helps identify crop problems and gives practical guidance?',hi:'क्या आप फसल की समस्या पहचानने और उपयोगी सलाह देने वाली सेवा इस्तेमाल करेंगे?',options:[['Yes','हाँ'],['Maybe','शायद'],['No','नहीं']]},
  {id:'paymentModel',type:'radio',en:'Which payment model would you prefer?',hi:'आप भुगतान का कौन-सा तरीका पसंद करेंगे?',options:[['Completely free','पूरी तरह मुफ्त'],['Pay per consultation','हर सलाह के लिए भुगतान'],['Monthly subscription','मासिक सदस्यता'],['Per crop/season','हर फसल/सीजन के लिए'],['Through FPO/cooperative','FPO/सहकारी संस्था के जरिए'],['Sponsored by an agriculture company/institution','कृषि कंपनी/संस्था द्वारा प्रायोजित']]},
  {id:'willingnessToPay',type:'radio',en:'If paid, what amount seems reasonable?',hi:'अगर सेवा paid हो, तो कितना भुगतान उचित लगेगा?',options:[['₹0 — free only','₹0 — केवल मुफ्त सेवा'],['₹10–₹30 per consultation','₹10–₹30 प्रति सलाह'],['₹31–₹100 per consultation','₹31–₹100 प्रति सलाह'],['₹100–₹300 per month','₹100–₹300 प्रति माह'],['More than ₹300 if value is proven','₹300 से अधिक, यदि फायदा साबित हो'],['Would like a trial first','पहले ट्रायल करना चाहूँगा']]},
  {id:'paymentConditions',type:'textarea',en:'Under what conditions would you be willing to pay?',hi:'किन परिस्थितियों में आप भुगतान करने को तैयार होंगे?',placeholder:'What value or proof would you need?'},
  {id:'pilot',type:'radio',en:'Would you join a free pilot and share feedback during a real farming season?',hi:'क्या आप मुफ्त पायलट में शामिल होकर खेती के सीजन में फीडबैक देंगे?',options:[['Yes, and I can give feedback','हाँ, मैं फीडबैक दे सकता हूँ'],['Maybe, tell me more','शायद, पहले और जानकारी चाहिए'],['No','नहीं']]}
 ]},
 {id:'interview',icon:'interview',en:'Your experience & feedback',hi:'आपका अनुभव और सुझाव',descEn:'A few open questions help us understand the real story behind the numbers.',descHi:'कुछ खुले सवालों से हमें आपकी वास्तविक समस्या समझने में मदद मिलेगी।',questions:[
  {id:'recentProblem',type:'textarea',en:'Tell us about a recent serious farming problem and how you solved it.',hi:'खेती में आई किसी हाल की गंभीर समस्या और उसे हल करने का तरीका बताएं।',placeholder:'Your experience…'},
  {id:'timelyBenefit',type:'textarea',en:'What benefit would you have received if you had found a solution on time?',hi:'अगर समय पर समाधान मिल जाता, तो आपको क्या फायदा होता?',placeholder:'Time, money, crop quality, yield…'},
  {id:'paidServices',type:'textarea',en:'Have you paid for an agriculture service, consultant, app or product? What was the result?',hi:'क्या आपने कृषि सेवा, सलाहकार, ऐप या उत्पाद के लिए पैसे दिए हैं? नतीजा क्या रहा?',placeholder:'Optional details'},
  {id:'trustEvidence',type:'textarea',en:'What evidence would you need to trust an agriculture technology solution?',hi:'कृषि तकनीक के समाधान पर भरोसा करने के लिए आपको क्या प्रमाण चाहिए?',placeholder:'e.g. expert approval, trial results…'},
  {id:'firstProblem',type:'textarea',en:'If Khushhal Kisan could solve one farming problem first, which should it be?',hi:'अगर Khushhal Kisan पहले आपकी एक समस्या हल करे, तो वह कौन-सी हो?',placeholder:'Your top priority…'},
  {id:'recommend',type:'textarea',en:'Would you recommend this service to other farmers? Why or why not?',hi:'क्या आप यह सेवा दूसरे किसानों को सुझाएंगे? क्यों या क्यों नहीं?',placeholder:'Your reason'},
  {id:'referral',type:'text',en:'Can you connect us with another farmer, FPO representative or agriculture expert? (Optional)',hi:'क्या आप किसी अन्य किसान, FPO प्रतिनिधि या कृषि विशेषज्ञ से मिलवा सकते हैं? (वैकल्पिक)',placeholder:'Name/contact only if they agree'}
 ]}
];
const stakeholderQuestions = [
 {id:'name',type:'text',required:true,en:'What is your name?',hi:'आपका नाम क्या है?',placeholder:'Your name'},
 {id:'mobile',type:'text',required:true,en:'What is your mobile number?',hi:'आपका मोबाइल नंबर क्या है?',placeholder:'10-digit mobile number'},
 {id:'email',type:'text',required:false,en:'Email address (optional)',hi:'ईमेल पता (वैकल्पिक)',placeholder:'name@example.com'},
 {id:'whatsappGroup',type:'radio',required:true,en:'To stay connected with us and receive the latest farming information, would you like to join our WhatsApp group?',hi:'हमसे जुड़े रहने और खेती की नई-नई जानकारी पाने के लिए क्या आप हमारे WhatsApp ग्रुप से जुड़ना चाहेंगे?',options:[['Yes','हाँ'],['No','नहीं']]},
 {id:'farmersSupported',type:'text',en:'How many farmers do you work with?',hi:'आप कितने किसानों के साथ काम करते हैं?',placeholder:'Approximate number'},
 {id:'stakeholderProblems',type:'textarea',en:'What are their major farming problems?',hi:'किसानों की प्रमुख कृषि समस्याएँ क्या हैं?',placeholder:'Main problems'},
 {id:'guidanceProcess',type:'textarea',en:'How do you currently provide technical agriculture guidance?',hi:'अभी आप तकनीकी कृषि सलाह कैसे देते हैं?',placeholder:'Current process'},
 {id:'stakeholderLoss',type:'textarea',en:'How do disease, weather or crop-management issues affect farmers?',hi:'रोग, मौसम या फसल प्रबंधन की समस्याओं से किसानों को क्या नुकसान होता है?',placeholder:'Examples or estimates'},
 {id:'digitalTools',type:'textarea',en:'Have you implemented digital agriculture tools? How was adoption?',hi:'क्या आपने डिजिटल कृषि टूल लागू किए हैं? उनका उपयोग कैसा रहा?',placeholder:'Tools and adoption'},
 {id:'valueCreation',type:'textarea',en:'How could Khushhal Kisan create value for your farmers?',hi:'Khushhal Kisan आपके किसानों के लिए कैसे उपयोगी हो सकता है?',placeholder:'Expected value'},
 {id:'pilotReadiness',type:'radio',en:'Would you consider conducting a pilot with your farmers?',hi:'क्या आप अपने किसानों के साथ पायलट करना चाहेंगे?',options:[['Yes','हाँ'],['Maybe','शायद'],['No','नहीं']]},
 {id:'adoptionNeeds',type:'checks',en:'What would be needed for adoption?',hi:'इसे अपनाने के लिए क्या चाहिए?',options:[['Training','प्रशिक्षण'],['Expert support','विशेषज्ञ सहायता'],['Integration','इंटीग्रेशन'],['Funding','फंडिंग'],['Other','अन्य']]},
 {id:'sponsorship',type:'radio',en:'Would your organisation consider paying for or sponsoring the service?',hi:'क्या आपकी संस्था इस सेवा के भुगतान या प्रायोजन पर विचार करेगी?',options:[['Yes','हाँ'],['Maybe','शायद'],['No','नहीं']]}
];
const assameseQuestions = {"name": "আপোনাৰ নাম কি?", "mobile": "আপোনাৰ ম’বাইল নম্বৰ লিখক", "email": "ইমেইল ঠিকনা (ঐচ্ছিক)", "whatsappGroup": "আমাৰ সৈতে সংযুক্ত হৈ থাকিবলৈ আৰু খেতিৰ নতুন নতুন তথ্য লাভ কৰিবলৈ আপুনি আমাৰ WhatsApp গ্ৰুপত যোগদান কৰিব বিচাৰে নে?", "location": "আপুনি কোনখন গাঁও, উন্নয়ন খণ্ড আৰু জিলাত খেতি কৰে?", "age": "আপোনাৰ বয়স কিমান?", "experience": "আপুনি কিমান বছৰ ধৰি খেতি কৰি আহিছে?", "land": "আপুনি কিমান কৃষিভূমিত খেতি কৰে?", "crops": "আপুনি কি কি শস্যৰ খেতি কৰে?", "landOwnership": "আপুনি নিজৰ মাটিত নে ভাড়াত লোৱা মাটিত খেতি কৰে?", "topProblems": "খেতি কৰোঁতে আপুনি সন্মুখীন হোৱা ৩টা ডাঙৰ সমস্যা কি কি?", "seriousProblems": "আপোনাৰ বাবে কোনবোৰ সমস্যা আটাইতকৈ গুৰুতৰ?", "financialLoss": "যোৱা খেতিৰ বতৰত কোনটো সমস্যাৰ বাবে আপোনাৰ আটাইতকৈ বেছি আৰ্থিক ক্ষতি হৈছিল?", "diseaseExperience": "আপোনাৰ শস্যত ৰোগ বা কীট-পতংগৰ আক্ৰমণ হৈছিল নেকি? কেনেকৈ চিনাক্ত আৰু চিকিৎসা কৰিছিল?", "infoSources": "বৰ্তমান আপুনি খেতিৰ পৰামৰ্শ ক’ৰ পৰা লাভ কৰে?", "infoGaps": "বৰ্তমানৰ তথ্যৰ উৎসসমূহত আপোনাৰ কি অভাৱ বা অসুবিধা হয়?", "seasonCost": "প্ৰতি খেতিৰ বতৰত আনুমানিক খৰচ আৰু লোকচান", "smartphone": "আপুনি স্মাৰ্টফোন ব্যৱহাৰ কৰে নেকি?", "appsUsed": "আপুনি কৃষি এপ বা ডিজিটেল কৃষি সেৱা ব্যৱহাৰ কৰিছেনে? কোনটো আৰু অভিজ্ঞতা কেনেকুৱা?", "photoDiagnosis": "ফটোৰ জৰিয়তে শস্যৰ ৰোগ/কীট চিনাক্তকৰণ আৰু চিকিৎসাৰ পৰামৰ্শ আপোনাৰ বাবে উপযোগী হ’বনে?", "digitalNeeds": "আপোনাক কোনবোৰ ডিজিটেল সেৱাৰ আটাইতকৈ বেছি প্ৰয়োজন?", "language": "আপুনি কোনটো ভাষা বা মাধ্যমত তথ্য বিচাৰে?", "trustFactors": "কোনবোৰ কথাই আপোনাক পৰামৰ্শৰ ওপৰত বিশ্বাস কৰিবলৈ সহায় কৰিব?", "digitalBarriers": "ডিজিটেল কৃষি সেৱা ব্যৱহাৰ কৰোঁতে কি অসুবিধা হ’ব পাৰে?", "useIntent": "শস্যৰ সমস্যা চিনাক্ত কৰি ব্যৱহাৰিক পৰামৰ্শ দিয়া সেৱা আপুনি ব্যৱহাৰ কৰিবনে?", "paymentModel": "আপুনি কোনটো মূল্য পৰিশোধৰ পদ্ধতি পছন্দ কৰিব?", "willingnessToPay": "সেৱাৰ বাবে কিমান ধন পৰিশোধ কৰাটো যুক্তিসংগত হ’ব?", "paymentConditions": "কোনবোৰ চৰ্তত আপুনি ধন পৰিশোধ কৰিবলৈ ইচ্ছুক হ’ব?", "pilot": "বাস্তৱ খেতিৰ বতৰত বিনামূলীয়া পৰীক্ষামূলক কাৰ্যসূচীত যোগ দি মতামত দিবনে?", "recentProblem": "শেহতীয়াকৈ হোৱা এটা গুৰুতৰ কৃষি সমস্যা আৰু আপুনি কেনেকৈ সমাধান কৰিলে বৰ্ণনা কৰক।", "timelyBenefit": "সময়মতে সমাধান পালে আপোনাৰ কি লাভ হ’লহেঁতেন?", "paidServices": "আপুনি কৃষি সেৱা, পৰামৰ্শদাতা, এপ বা সামগ্ৰীৰ বাবে ধন দিছেনে? ফলাফল কি আছিল?", "trustEvidence": "কৃষি প্ৰযুক্তিৰ সমাধানৰ ওপৰত বিশ্বাস কৰিবলৈ আপুনি কি প্ৰমাণ বিচাৰিব?", "firstProblem": "Khushhal Kisan-এ প্ৰথমে আপোনাৰ এটা কৃষি সমস্যা সমাধান কৰিলে কোনটো হ’ব লাগে?", "recommend": "আপুনি এই সেৱা আন কৃষকক পৰামৰ্শ দিবনে? কিয়?", "referral": "আপুনি আন কোনো কৃষক, FPO প্ৰতিনিধি বা কৃষি বিশেষজ্ঞৰ সৈতে আমাক চিনাকি কৰাই দিব পাৰিবনে?", "farmersSupported": "আপুনি কিমানজন কৃষকৰ সৈতে কাম কৰে?", "stakeholderProblems": "তেওঁলোকৰ প্ৰধান কৃষি সমস্যাবোৰ কি?", "guidanceProcess": "বৰ্তমান আপুনি কেনেকৈ কৃষি-সম্পৰ্কীয় কাৰিকৰী পৰামৰ্শ দিয়ে?", "stakeholderLoss": "ৰোগ, বতৰ বা শস্য পৰিচালনাৰ সমস্যাই কৃষকক কেনেদৰে প্ৰভাৱিত কৰে?", "digitalTools": "আপুনি ডিজিটেল কৃষি সঁজুলি ৰূপায়ণ কৰিছেনে? ব্যৱহাৰ কেনেকুৱা?", "valueCreation": "Khushhal Kisan-এ আপোনাৰ কৃষকসকলৰ বাবে কেনেদৰে মূল্য সৃষ্টি কৰিব পাৰে?", "pilotReadiness": "আপুনি আপোনাৰ কৃষকসকলৰ সৈতে এটা পৰীক্ষামূলক কাৰ্যসূচী কৰিব বিচাৰিবনে?", "adoptionNeeds": "এই সেৱা গ্ৰহণ কৰিবলৈ কি কি প্ৰয়োজন হ’ব?", "sponsorship": "আপোনাৰ সংস্থাই এই সেৱাৰ বাবে ধন বা পৃষ্ঠপোষকতা কৰাৰ কথা বিবেচনা কৰিবনে?"};
const assameseOptions = {"Yes": "হয়", "No": "নহয়", "Maybe": "হয়তো", "Daily": "প্ৰতিদিনে", "Sometimes": "কেতিয়াবা", "18–30 years": "১৮–৩০ বছৰ", "31–45 years": "৩১–৪৫ বছৰ", "46–60 years": "৪৬–৬০ বছৰ", "Above 60 years": "৬০ বছৰৰ ওপৰত", "1–5 years": "১–৫ বছৰ", "6–10 years": "৬–১০ বছৰ", "More than 10 years": "১০ বছৰতকৈ অধিক", "Less than 1 acre": "১ একৰতকৈ কম", "1–2 acres": "১–২ একৰ", "2–5 acres": "২–৫ একৰ", "More than 5 acres": "৫ একৰতকৈ অধিক", "Own land": "নিজৰ মাটি", "Leased/rented land": "ভাড়াত লোৱা মাটি", "Both": "দুয়োটা", "Crop disease or pest attack": "শস্যৰ ৰোগ বা কীট-পতংগৰ আক্ৰমণ", "Unreliable weather information": "বতৰৰ সঠিক তথ্যৰ অভাৱ", "Irrigation or water shortage": "জলসিঞ্চন বা পানীৰ অভাৱ", "Correct fertilizer/pesticide use": "সাৰ/কীটনাশকৰ সঠিক ব্যৱহাৰ", "Soil quality and soil health": "মাটিৰ গুণাগুণ আৰু স্বাস্থ্য", "Low market price": "বজাৰত কম দাম", "High production cost": "উৎপাদন ব্যয় অধিক", "Labour availability": "শ্ৰমিকৰ উপলব্ধতা", "Government scheme information": "চৰকাৰী আঁচনিৰ তথ্য", "Other": "অন্যান্য", "Agriculture officer / KVK": "কৃষি বিষয়া / KVK", "Local dealer / input shop": "স্থানীয় বিক্ৰেতা / কৃষি সামগ্ৰীৰ দোকান", "Experienced farmers": "অভিজ্ঞ কৃষক", "YouTube / Google": "YouTube / Google", "WhatsApp groups": "WhatsApp গ্ৰুপ", "Agriculture mobile apps": "কৃষি মোবাইল এপ", "Very useful": "অতি উপযোগী", "Somewhat useful": "কিছু পৰিমাণে উপযোগী", "Not useful": "উপযোগী নহয়", "Not sure": "নিশ্চিত নহয়", "Crop disease detection": "শস্যৰ ৰোগ চিনাক্তকৰণ", "Weather and rain alerts": "বতৰ আৰু বৰষুণৰ সতৰ্কবাণী", "Irrigation scheduling": "জলসিঞ্চনৰ সময় নিৰ্ধাৰণ", "Soil health and fertilizer advice": "মাটিৰ স্বাস্থ্য আৰু সাৰৰ পৰামৰ্শ", "Pest management guidance": "কীট-পতংগ নিয়ন্ত্ৰণৰ পৰামৰ্শ", "Crop planning and sowing guidance": "শস্য পৰিকল্পনা আৰু সিঁচাৰ পৰামৰ্শ", "Mandi prices and market information": "মাণ্ডিৰ দাম আৰু বজাৰৰ তথ্য", "Local-language agriculture expert support": "স্থানীয় ভাষাত কৃষি বিশেষজ্ঞৰ সহায়", "Hindi": "হিন্দী", "English": "ইংৰাজী", "Assamese": "অসমীয়া", "Local/regional language": "স্থানীয়/আঞ্চলিক ভাষা", "Voice-based guidance": "কণ্ঠস্বৰৰ জৰিয়তে পৰামৰ্শ", "Agriculture expert confirmation": "কৃষি বিশেষজ্ঞৰ নিশ্চিতকৰণ", "Local agriculture department recommendation": "স্থানীয় কৃষি বিভাগৰ পৰামৰ্শ", "Explanation with recommendation": "পৰামৰ্শৰ সৈতে ব্যাখ্যা", "Other farmers’ reviews": "আন কৃষকৰ মতামত", "Option to try it first": "প্ৰথমে পৰীক্ষা কৰাৰ সুবিধা", "Internet connectivity": "ইণ্টাৰনেট সংযোগৰ সমস্যা", "Difficulty using a smartphone": "স্মাৰ্টফোন ব্যৱহাৰৰ অসুবিধা", "Lack of trust": "বিশ্বাসৰ অভাৱ", "Language problem": "ভাষাৰ সমস্যা", "Cost": "খৰচ", "Doubt about accuracy": "সঠিকতাৰ ওপৰত সন্দেহ", "No difficulty expected": "কোনো অসুবিধা আশা কৰা নাই", "Completely free": "সম্পূৰ্ণ বিনামূলীয়া", "Pay per consultation": "প্ৰতিটো পৰামৰ্শৰ বাবে ধন", "Monthly subscription": "মাহেকীয়া সদস্যতা", "Per crop/season": "প্ৰতিটো শস্য/বতৰৰ বাবে", "Through FPO/cooperative": "FPO/সমবায়ৰ জৰিয়তে", "Sponsored by an agriculture company/institution": "কৃষি কোম্পানী/প্ৰতিষ্ঠানৰ পৃষ্ঠপোষকতাত", "₹0 — free only": "₹০ — কেৱল বিনামূলীয়া", "₹10–₹30 per consultation": "₹১০–₹৩০ প্ৰতিটো পৰামৰ্শ", "₹31–₹100 per consultation": "₹৩১–₹১০০ প্ৰতিটো পৰামৰ্শ", "₹100–₹300 per month": "₹১০০–₹৩০০ প্ৰতি মাহে", "More than ₹300 if value is proven": "লাভ প্ৰমাণিত হ’লে ₹৩০০তকৈ অধিক", "Would like a trial first": "প্ৰথমে পৰীক্ষা কৰিব বিচাৰোঁ", "Yes, and I can give feedback": "হয়, মই মতামত দিব পাৰিম", "Maybe, tell me more": "হয়তো, অধিক তথ্য দিয়ক", "Training": "প্ৰশিক্ষণ", "Expert support": "বিশেষজ্ঞৰ সহায়", "Integration": "সংহতি", "Funding": "পুঁজি"};
const assameseSections = {"profile": ["কৃষকৰ তথ্য", "আপোনাৰ কৃষিৰ পটভূমি বুজিবলৈ আমাক সহায় কৰক।"], "challenges": ["আপোনাৰ কৃষিৰ প্ৰত্যাহ্বান", "আপোনাৰ বাস্তৱ অভিজ্ঞতাই গুৰুত্বপূৰ্ণ সমস্যাবোৰ বুজিবলৈ সহায় কৰে।"], "digital": ["প্ৰযুক্তি আৰু AI সেৱা", "কোনবোৰ ডিজিটেল সহায় আপোনাৰ বাবে উপযোগী হ’ব জনাওক।"], "payment": ["সেৱাৰ পছন্দ আৰু মূল্য", "সঠিক বা ভুল উত্তৰ নাই। আপোনাৰ প্ৰকৃত পছন্দ জনাওক।"], "interview": ["আপোনাৰ অভিজ্ঞতা আৰু মতামত", "কেইটামান প্ৰশ্নই আপোনাৰ বাস্তৱ অভিজ্ঞতা বুজিবলৈ সহায় কৰিব।"], "stakeholder": ["FPO আৰু কৃষি অংশীদাৰৰ সাক্ষাৎকাৰ", "আপোনাৰ সংস্থাই কৃষকসকলক কেনেদৰে সহায় কৰে জনাওক।"]};
const allSections = (type)=> type==='stakeholder' ? [{id:'stakeholder',en:'FPO & stakeholder interview',hi:'FPO और कृषि हितधारक',descEn:'Tell us about the farmers and services your organisation supports.',descHi:'अपने संगठन और किसानों के बारे में जानकारी दें।',questions:stakeholderQuestions}] : sections;
function App(){
 const [lang,setLang]=useState('hi');
 const [showLanguage,setShowLanguage]=useState(true);
 const [type,setType]=useState('farmer');
 const [step,setStep]=useState(0);
 const [answers,setAnswers]=useState({});
 const [consent,setConsent]=useState(false);
 const [status,setStatus]=useState('idle');
 const [receipt,setReceipt]=useState(null);
 const [error,setError]=useState('');
 const [draftKey,setDraftKey]=useState(()=>{
  const storageKey='khushhal-kisan-draft-key';
  let key=localStorage.getItem(storageKey);
  if(!key){key=crypto.randomUUID();localStorage.setItem(storageKey,key);}
  return key;
 });
 const [draftReady,setDraftReady]=useState(false);
 const saveQueue=useRef(Promise.resolve());
 const apiBase=(import.meta.env.VITE_API_URL||'http://localhost:5000').replace(/\/$/,'');
 const activeSections=useMemo(()=>allSections(type),[type]);
 const section=activeSections[Math.min(step,activeSections.length-1)];
 const total=activeSections.length;
 const progress=Math.round(((step+1)/total)*100);
 const tr=(q)=>lang==='as'?(assameseQuestions[q.id]||q.en):(lang==='en'?q.en:q.hi);
 const sectionTitle=(s)=>lang==='as'?(assameseSections[s.id]?.[0]||s.en):(lang==='en'?s.en:s.hi);
 const sectionDesc=(s)=>lang==='as'?(assameseSections[s.id]?.[1]||s.descEn):(lang==='en'?s.descEn:s.descHi);
 const optionLabel=(en,hi)=>lang==='as'?(assameseOptions[en]||en):(lang==='en'?en:hi);
 const ui=(en,hi,as)=>lang==='en'?en:(lang==='as'?(as||en):hi);
 const placeholderFor=(q)=>{
  if(lang==='en') return q.placeholder||'';
  if(q.id==='name') return ui('Your name','अपना नाम लिखें','আপোনাৰ নাম লিখক');
  if(q.id==='mobile') return ui('10-digit mobile number','10 अंकों का मोबाइल नंबर','১০ অংকৰ ম’বাইল নম্বৰ');
  if(q.id==='email') return 'name@example.com';
  if(q.id==='crops') return ui('e.g. wheat, paddy, potato','जैसे गेहूँ, धान, आलू','যেনে ঘেঁহু, ধান, আলু');
  return q.type==='textarea'
   ? ui('Write your answer…','अपना जवाब लिखें…','আপোনাৰ উত্তৰ লিখক…')
   : ui('Enter your answer…','अपना जवाब लिखें…','আপোনাৰ উত্তৰ লিখক…');
 };
 const setAnswer=(id,value)=>setAnswers(a=>({...a,[id]:value}));
 const visibleQuestions=section.questions;

 useEffect(()=>{
  document.documentElement.lang=lang;
 },[lang]);

 // Restore this browser's unfinished survey from the API.
 useEffect(()=>{
  let cancelled=false;
  setDraftReady(false);
  (async()=>{
   try{
    const response=await fetch(`${apiBase}/api/surveys/draft/${encodeURIComponent(draftKey)}`);
    if(!response.ok) throw new Error('Draft could not be loaded');
    const data=await response.json();
    if(cancelled) return;
    if(data.draft){
     const saved=data.draft;
     setType(saved.survey_type==='stakeholder'?'stakeholder':'farmer');
     // Keep the language selected on the opening screen.
     setAnswers(saved.answers&&typeof saved.answers==='object'?saved.answers:{});
     const count=saved.survey_type==='stakeholder'?1:sections.length;
     setStep(Math.max(0,Math.min(Number(saved.current_step)||0,count-1)));
    }
   }catch(err){
    if(!cancelled) console.warn('Draft restore unavailable:',err.message);
   }finally{
    if(!cancelled) setDraftReady(true);
   }
  })();
  return ()=>{cancelled=true;};
 },[draftKey,apiBase]);

 // Debounced autosave. Requests are serialized so older answers cannot overwrite newer ones.
 useEffect(()=>{
  if(!draftReady||status==='success') return;
  const snapshot={draftKey,surveyType:type,language:lang,answers,currentStep:step};
  const timer=setTimeout(()=>{
   saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
    const response=await fetch(`${apiBase}/api/surveys/draft`,{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)
    });
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Draft save failed');}
   }).catch(err=>console.warn('Automatic draft save failed:',err.message));
  },700);
  return ()=>clearTimeout(timer);
 },[draftReady,draftKey,type,lang,answers,step,status,apiBase]);

 function validate(){
  for(const q of visibleQuestions){
   if(q.required && !(Array.isArray(answers[q.id])?answers[q.id].length:answers[q.id]?.toString().trim())){
    setError(ui(`Please answer: ${q.en}`,`कृपया जवाब दें: ${q.hi}`,`অনুগ্ৰহ কৰি উত্তৰ দিয়ক: ${assameseQuestions[q.id]||q.en}`));
    document.getElementById(q.id)?.scrollIntoView({behavior:'smooth',block:'center'});
    return false;
   }
   if(q.id==='email' && answers.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email.trim())){
    setError(ui('Please enter a valid email address or leave it blank.','कृपया सही ईमेल पता दर्ज करें या खाली छोड़ दें।','অনুগ্ৰহ কৰি সঠিক ইমেইল ঠিকনা দিয়ক অথবা খালী ৰাখক।'));
    document.getElementById('email')?.scrollIntoView({behavior:'smooth',block:'center'});
    return false;
   }
   if(q.id==='mobile'){
    const digits=(answers.mobile||'').replace(/[^0-9]/g,'');
    if(!(digits.length===10 || (digits.length===12 && digits.startsWith('91')))){
     setError(ui('Please enter a valid Indian mobile number.','कृपया सही मोबाइल नंबर दर्ज करें।','অনুগ্ৰহ কৰি সঠিক ভাৰতীয় ম’বাইল নম্বৰ দিয়ক।'));
     document.getElementById('mobile')?.scrollIntoView({behavior:'smooth',block:'center'});
     return false;
    }
   }
   if(q.max && (answers[q.id]||[]).length>q.max){
    setError(ui(`Please select no more than ${q.max}.`,`कृपया अधिकतम ${q.max} विकल्प चुनें।`,`অনুগ্ৰহ কৰি সৰ্বাধিক ${q.max}টা বিকল্প বাছনি কৰক।`));
    return false;
   }
  }
  setError('');
  return true;
 }

 async function submit(){
  if(!validate()) return;
  if(!consent){setError(ui('Please confirm your consent to submit.','जमा करने से पहले कृपया सहमति दें।','জমা দিয়াৰ আগতে আপোনাৰ সন্মতি নিশ্চিত কৰক।'));return;}
  setStatus('loading');setError('');
  try{
   // Flush any queued draft save before final submission.
   await saveQueue.current.catch(()=>{});
   const r=await fetch(`${apiBase}/api/surveys`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({draftKey,language:lang,surveyType:type,answers,consent:true})
   });
   const data=await r.json();
   if(!r.ok) throw new Error(data.error||'Could not submit survey');
   localStorage.removeItem('khushhal-kisan-draft-key');
   setReceipt(data);setStatus('success');
  }catch(e){
   setError((lang==='en'?'Submission failed: ':lang==='as'?'জমা দিব পৰা নগ’ল: ':'जमा नहीं हो पाया: ')+e.message+(lang==='en'?' Please check your internet and try again.':lang==='as'?' ইণ্টাৰনেট পৰীক্ষা কৰি পুনৰ চেষ্টা কৰক।':' इंटरनेट जाँचकर दोबारा प्रयास करें।'));
   setStatus('idle');
  }
 }
 if(status==='success'&&receipt)return <div className="success-page"><div className="success-card"><div className="success-icon"><CheckCircle2 size={42}/></div><div className="eyebrow">KHUSHHAL KISAN · SURVEY</div><h1>{ui('Thank you for sharing!','अपना अनुभव साझा करने के लिए धन्यवाद!','আপোনাৰ মতামত জনোৱাৰ বাবে ধন্যবাদ!')}</h1><p>{ui('Your response has been submitted successfully. Your feedback will help us design more useful farming support.','आपका जवाब सफलतापूर्वक जमा हो गया है। आपका फीडबैक बेहतर कृषि सहायता बनाने में मदद करेगा।','আপোনাৰ উত্তৰ সফলতাৰে জমা হৈছে। আপোনাৰ মতামতে অধিক উপযোগী কৃষি সহায় গঢ়াত সহায় কৰিব।')}</p><div className="receipt"><span>{ui('Your unique response ID','आपकी यूनिक रिस्पॉन्स ID','আপোনাৰ একক উত্তৰ ID')}</span><strong>{receipt.responseId}</strong><button className="copy-btn" onClick={()=>navigator.clipboard?.writeText(receipt.responseId)}>{ui('Copy ID','ID कॉपी करें','ID কপি কৰক')}</button></div><div className="privacy-note"><ShieldCheck size={18}/><span>{ui('Keep this ID for your records. Your answers are stored securely for survey analysis.','इस ID को अपने पास रखें। आपके जवाब सर्वे विश्लेषण के लिए सुरक्षित रूप से स्टोर किए जाते हैं।','এই ID আপোনাৰ ওচৰত ৰাখক। সমীক্ষাৰ বিশ্লেষণৰ বাবে আপোনাৰ উত্তৰসমূহ সুৰক্ষিতভাৱে সংৰক্ষণ কৰা হৈছে।')}</span></div><button className="primary full" onClick={()=>{const nextKey=crypto.randomUUID();localStorage.setItem('khushhal-kisan-draft-key',nextKey);setDraftKey(nextKey);setDraftReady(false);setAnswers({});setConsent(false);setStep(0);setReceipt(null);setStatus('idle');setType('farmer');setLang('hi');window.scrollTo(0,0)}}>{ui('Submit another response','एक और जवाब जमा करें','আন এটা উত্তৰ জমা দিয়ক')} <ArrowRight size={18}/></button></div></div>;
 if(showLanguage)return <div className="language-screen"><div className="language-card"><div className="language-logo"><Sprout size={30}/></div><div className="eyebrow">KHUSHHAL KISAN</div><h1>{ui('Choose your language','अपनी भाषा चुनें','আপোনাৰ ভাষা বাছনি কৰক')}</h1><p>{ui('Select a language to start the farmer survey.','सर्वे शुरू करने के लिए अपनी भाषा चुनें।','কৃষক সমীক্ষা আৰম্ভ কৰিবলৈ এটা ভাষা বাছনি কৰক।')}</p><div className="language-options"><button className={lang==='hi'?'active':''} onClick={()=>setLang('hi')}><span>🇮🇳</span><b>हिंदी</b><small>Hindi</small></button><button className={lang==='en'?'active':''} onClick={()=>setLang('en')}><span>🌐</span><b>English</b><small>English</small></button><button className={lang==='as'?'active':''} onClick={()=>setLang('as')}><span>🌾</span><b>অসমীয়া</b><small>Assamese</small></button></div><button className="primary full" onClick={()=>setShowLanguage(false)}>{ui('Continue','आगे बढ़ें','আগবাঢ়ক')} <ArrowRight size={18}/></button><small className="language-foot">{ui('You can change the language later.','आप बाद में भी भाषा बदल सकते हैं।','আপুনি পিছতো ভাষা সলনি কৰিব পাৰিব।')}</small></div></div>;
 return <div className="app-shell"><header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Sprout size={26}/></span><span><b>Khushhal Kisan</b><small>{ui('FARMER-FIRST AGRICULTURE','किसान-केंद्रित कृषि','কৃষক-কেন্দ্ৰিক কৃষি')}</small></span></a><div className="lang-switch" aria-label="Change language"><Languages size={17}/><select value={lang} onChange={e=>setLang(e.target.value)} aria-label="Select language"><option value="hi">हिंदी</option><option value="en">English</option><option value="as">অসমীয়া</option></select></div></header>
 <main id="top"><section className="hero"><div className="hero-copy"><div className="pill"><span className="pulse"/>{ui('FARMER NEEDS & MARKET VALIDATION','किसान की जरूरतें और बाजार सर्वे','কৃষকৰ প্ৰয়োজন আৰু বজাৰ সমীক্ষা')}</div><h1>{lang==='en'?<>Your experience.<br/><em>A better farming future.</em></>:lang==='as'?<>আপোনাৰ অভিজ্ঞতা।<br/><em>কৃষিৰ এক উন্নত ভৱিষ্যৎ।</em></>:<>आपका अनुभव।<br/><em>खेती का बेहतर भविष्य।</em></>}</h1><p>{ui('Help us understand the real challenges farmers face and shape practical, trustworthy services through Khushhal Kisan.','खेती की असली समस्याओं को समझने और Khushhal Kisan के जरिए उपयोगी व भरोसेमंद सेवाएँ बनाने में हमारी मदद करें।','কৃষকসকলে সন্মুখীন হোৱা প্ৰকৃত সমস্যাবোৰ বুজি Khushhal Kisan-ৰ জৰিয়তে ব্যৱহাৰিক আৰু বিশ্বাসযোগ্য সেৱা গঢ়ি তুলিবলৈ আমাক সহায় কৰক।')}</p><div className="hero-points"><span><ShieldCheck size={17}/>{ui('Your answers matter','आपकी राय महत्वपूर्ण है','আপোনাৰ মতামত গুৰুত্বপূৰ্ণ')}</span><span><ClipboardList size={17}/>{ui('About 5–8 minutes','लगभग 5–8 मिनट','প্ৰায় ৫–৮ মিনিট')}</span></div></div><div className="hero-art"><div className="sun"/><div className="hill hill-back"/><div className="hill hill-front"/><div className="field-lines"/><div className="plant plant-a"><Sprout size={80}/></div><div className="plant plant-b"><Sprout size={56}/></div><div className="art-label"><Leaf size={16}/>{ui('Built around farmers','किसानों के लिए','কৃষকৰ বাবে')}</div></div></section>
 <section className="survey-wrap"><aside className="sidebar"><div className="sidebar-title">{ui('YOUR SURVEY','आपका सर्वे','আপোনাৰ সমীক্ষা')}<span>{String(step+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div><div className="steps">{activeSections.map((s,i)=><button key={s.id} className={`step ${step===i?'active':''} ${step>i?'done':''}`} onClick={()=>{if(i<=step){setStep(i);setError('')}}}><span className="step-num">{step>i?<CheckCircle2 size={17}/>:String(i+1).padStart(2,'0')}</span><span><b>{sectionTitle(s)}</b><small>{i===step?(ui('IN PROGRESS','जारी है','চলি আছে')):step>i?(ui('Completed','पूरा हुआ','সম্পূৰ্ণ')):(ui('Section','सेक्शन','অংশ'))}</small></span></button>)}</div><div className="sidebar-help"><CircleHelp size={18}/><span>{ui('There are no right or wrong answers. Share what is true for you.','कोई सही या गलत जवाब नहीं। अपने अनुभव के अनुसार बताएं।','ইয়াত শুদ্ধ বা অশুদ্ধ উত্তৰ নাই। আপোনাৰ প্ৰকৃত অভিজ্ঞতা জনাওক।')}</span></div></aside>
 <section className="form-panel"><div className="form-heading"><div className="section-kicker">{lang==='en'?`SECTION ${String(step+1).padStart(2,'0')} OF ${String(total).padStart(2,'0')}`:lang==='as'?`অংশ ${step+1} / ${total}`:`सेक्शन ${step+1} / ${total}`}</div><h2>{sectionTitle(section)}</h2><p>{sectionDesc(section)}</p></div>{step===0&&<div className="type-select"><span>{ui('I am responding as','मैं जवाब दे रहा/रही हूँ','মই এই হিচাপে উত্তৰ দিছোঁ')}</span><div><button className={type==='farmer'?'selected':''} onClick={()=>{setType('farmer');setStep(0);setAnswers({})}}>{ui('Farmer','किसान','কৃষক')}</button><button className={type==='stakeholder'?'selected':''} onClick={()=>{setType('stakeholder');setStep(0);setAnswers({})}}>{ui('FPO / Agriculture stakeholder','FPO / कृषि हितधारक','FPO / কৃষি অংশীদাৰ')}</button></div></div>}
 <div className="questions">{visibleQuestions.map((q,index)=><div className="question" key={q.id} id={q.id}><label className="question-label" htmlFor={q.id}><span className="q-number">{String(index+1).padStart(2,'0')}</span><span>{tr(q)}{q.required&&<i className="required"> *</i>}</span></label>{q.type==='text'&&<input id={q.id} type={q.id==='mobile'?'tel':q.id==='email'?'email':'text'} inputMode={q.id==='mobile'?'numeric':undefined} maxLength={q.id==='mobile'?15: q.id==='email'?254:undefined} value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={placeholderFor(q)} />}{q.type==='textarea'&&<textarea id={q.id} rows="3" value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={placeholderFor(q)}/>}{q.type==='radio'&&<div className="option-grid">{q.options.map(([en,hi])=><label className={`option ${answers[q.id]===en?'chosen':''}`} key={en}><input type="radio" name={q.id} value={en} checked={answers[q.id]===en} onChange={()=>setAnswer(q.id,en)}/><span className="radio-dot"/><span>{optionLabel(en,hi)}</span></label>)}</div>}{q.type==='checks'&&<><div className="option-grid">{q.options.map(([en,hi])=>{const vals=answers[q.id]||[];return <label className={`option ${vals.includes(en)?'chosen':''}`} key={en}><input type="checkbox" checked={vals.includes(en)} onChange={e=>setAnswer(q.id,e.target.checked?(q.max&&vals.length>=q.max?vals:[...vals,en]):vals.filter(v=>v!==en))}/><span className="check-box">{vals.includes(en)?'✓':''}</span><span>{optionLabel(en,hi)}</span></label>})}</div>{q.max&&<small className="hint">{ui(`Choose up to ${q.max} (${(answers[q.id]||[]).length} selected)`,`अधिकतम ${q.max} चुनें (${(answers[q.id]||[]).length} चुने गए)`,`সৰ্বাধিক ${q.max}টা বাছনি কৰক (${(answers[q.id]||[]).length}টা বাছনি কৰা হৈছে)`)}</small>}</>}</div>)}</div>
 {step===total-1&&<label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{ui('I voluntarily agree to share these answers with the Khushhal Kisan team for product research and survey analysis.','मैं उत्पाद शोध और सर्वे विश्लेषण के लिए ये जवाब Khushhal Kisan टीम के साथ साझा करने की स्वेच्छा से सहमति देता/देती हूँ।','মই এই উত্তৰসমূহ Khushhal Kisan দলৰ সৈতে গৱেষণা আৰু সমীক্ষাৰ বাবে ভাগ-বতৰা কৰিবলৈ স্বেচ্ছাই সন্মতি দিছোঁ।')}</span></label>}
 {error&&<div className="error-msg" role="alert">{error}</div>}<div className="form-footer"><div className="footer-note"><ShieldCheck size={16}/>{ui('Your progress is saved automatically.','आपकी जानकारी अपने आप सेव होती रहती है।','আপোনাৰ অগ্ৰগতি স্বয়ংক্ৰিয়ভাৱে সংৰক্ষিত হয়।')}</div><div className="nav-buttons">{step>0&&<button className="secondary" onClick={()=>{setStep(step-1);setError('')}}><ArrowLeft size={17}/>{ui('Back','वापस','উভতি যাওক')}</button>}{step<total-1?<button className="primary" onClick={()=>{if(validate()){setStep(step+1);setError('');document.querySelector('.form-panel')?.scrollIntoView({behavior:'smooth',block:'start'})}}}>{ui('Continue','आगे बढ़ें','আগবাঢ়ক')}<ArrowRight size={17}/></button>:<button className="primary" onClick={submit} disabled={status==='loading'}>{status==='loading'?<><LoaderCircle className="spin" size={18}/>{ui('Submitting…','जमा हो रहा है…','জমা হৈ আছে…')}</>:<>{ui('Submit survey','सर्वे जमा करें','সমীক্ষা জমা দিয়ক')}<ArrowRight size={17}/></>}</button>}</div></div></section></section>
 <footer><div className="footer-brand"><Sprout size={20}/><b>Khushhal Kisan</b></div><span>{ui('A farmer-first support platform · Uttar Pradesh, India','किसान-केंद्रित सहायता प्लेटफॉर्म · उत्तर प्रदेश, भारत','কৃষক-কেন্দ্ৰিক সহায়ক মঞ্চ · উত্তৰ প্ৰদেশ, ভাৰত')}</span><small>© {new Date().getFullYear()} AiVirinchi Private Limited</small></footer></main></div>
}

createRoot(document.getElementById('root')).render(<App/>);
