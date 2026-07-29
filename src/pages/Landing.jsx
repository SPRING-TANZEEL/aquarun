import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   TRANSLATIONS
───────────────────────────────────────────── */
const T = {
  en: {
    badge: "Water Delivery Software • Pakistan",
    nav_login: "Login →",
    hero_h1: ["Run Your ", "Water Business", " Smarter"],
    hero_sub:
      "AquaRun handles deliveries, billing, customers, riders, and accounting — so you can focus on what matters: growing your business.",
    cta_start: "Get Started Free",
    cta_how: "See How It Works",
    hero_trust: "Trusted by 200+ water businesses across Pakistan",
    s1: "Active Businesses", s2: "Deliveries Tracked", s3: "Cloud-Based", s4: "Access Anywhere",
    feat_eye: "Features",
    feat_title: "Everything Your Water Business Needs",
    feat_sub: "Built specifically for Pakistani water delivery companies — with local payment methods, Urdu support, and full accounting.",
    features: [
      { icon: "🚚", title: "Delivery Management", desc: "Assign deliveries, track rider status in real time, and manage daily routes with ease." },
      { icon: "👥", title: "Customer Accounts", desc: "Maintain customer balances, payment history, and contact details — all in one place." },
      { icon: "🧾", title: "Invoicing & Billing", desc: "Auto-generate invoices with GST, thermal print format, and A4 layout for professional billing." },
      { icon: "📊", title: "Double-Entry Accounting", desc: "Full chart of accounts, journal entries, trial balance, P&L, and balance sheet — built in." },
      { icon: "💳", title: "JazzCash & EasyPaisa", desc: "Accept all payment methods. Every transaction automatically reconciled in the ledger." },
      { icon: "📱", title: "Rider Mobile App", desc: "Riders update deliveries and collect payments from their phone — even offline." },
      { icon: "🏢", title: "Multi-Tenant Ready", desc: "Run multiple water brands under one system with isolated data and settings per business." },
      { icon: "💰", title: "Rider Salary & Advances", desc: "Track advances, record salary payments, and view full ledger with journal preview per rider." },
    ],
    wf_eye: "How It Works",
    wf_title: "Watch a Delivery Come to Life",
    wf_sub: "From order creation to ledger update — see the full cycle live.",
    steps: [
      { icon: "📋", title: "Admin Creates Order", desc: "Admin selects customer, product, and quantity. Order appears instantly in the system." },
      { icon: "🏍️", title: "Order Assigned to Rider", desc: "Order assigned to the nearest available rider with a single click." },
      { icon: "📍", title: "Rider on the Way", desc: "Rider picks up and heads to the customer location marked on the live map." },
      { icon: "✅", title: "Delivery Completed", desc: "Rider marks done. Payment collected. Balance and ledger update automatically." },
    ],
    l1: "Cash In", l2: "Deliveries", l3: "Pending",
    notif_assigned_en: "✓ Rider Assigned",
    notif_done_en: "✅ Delivered! Ledger Updated",
    pr_eye: "Pricing", pr_title: "Simple, Transparent Pricing", pr_sub: "One plan. Everything included. No surprises.",
    pr_popular: "Most Popular", pr_label: "Professional", pr_mo: "/month",
    pr_setup: "+ Rs. 15,000 one-time setup",
    pf: ["Unlimited Deliveries", "Unlimited Customers & Riders", "Full Double-Entry Accounting",
         "Invoice Generation (A4 + Thermal)", "JazzCash & EasyPaisa Support",
         "Offline Mode for Riders", "WhatsApp & Phone Support", "Free Setup & Onboarding"],
    pr_cta: "Get Started Today",
    ct_eye: "Contact", ct_title: "Let's Get You Started",
    ct_h3: "Ready to streamline your water business?",
    ct_p: "Contact us via WhatsApp, phone, or email. We'll set you up and have you running within 24 hours.",
    ch_wa: "WhatsApp (Fastest)", ch_ph: "Phone Call", ch_em: "Email", ch_loc_l: "Location",
    ch_loc: "Kamoke / Lahore, Pakistan",
    cf_name: "Your Name", cf_phone: "Phone Number", cf_biz: "Business Name",
    cf_msg: "Tell us about your water delivery business...",
    cf_btn: "Send Message via WhatsApp",
    testimonials: [
      { name: "Muhammad Asif", biz: "Al-Madina Water", city: "Lahore", rating: 5, text: "Before AquaRun, I had no idea which rider delivered what. Now I see everything live. My cash recovery improved by 40% in the first month alone." },
      { name: "Haji Tariq Mehmood", biz: "Pure Drops Water", city: "Faisalabad", rating: 5, text: "The accounting feature is a game changer. I used to pay an accountant Rs. 8,000 a month. AquaRun does everything automatically — journal entries, ledger, balance sheet. Worth every rupee." },
      { name: "Imran Shahzad", biz: "Crystal Water Supply", city: "Gujranwala", rating: 5, text: "My riders love the app. Even when internet is off, they can still record deliveries. When they come back online everything syncs automatically. Never missed a delivery record since we started." },
      { name: "Usman Ali", biz: "Hayat Mineral Water", city: "Rawalpindi", rating: 5, text: "JazzCash reconciliation alone saved us hours every week. Every payment is tracked, every customer balance is accurate. I can see who owes me money with one tap." },
      { name: "Abdul Rehman", biz: "Zam Zam Water Plant", city: "Multan", rating: 5, text: "Setup was done in less than 24 hours. The team helped us migrate all our customer data. Within a week my whole team was using it. Customer portal is especially loved by our corporate clients." },
      { name: "Bilal Hussain", biz: "Al-Shifa Water", city: "Sialkot", rating: 5, text: "We were using paper registers before AquaRun. Now everything is digital — customer accounts, rider cash, daily reports. I check my business from my phone even when I am not at the plant." },
    ],
    ft_copy: "© 2026 AquaRun · Built for Pakistan's Water Industry",
    ft_login: "Admin Login", ft_wa: "WhatsApp", ft_email: "Email",
    wa_tooltip: "Chat on WhatsApp",
  },
  ur: {
    badge: "پانی ڈیلیوری سافٹ ویئر • پاکستان",
    nav_login: "لاگ ان →",
    hero_h1: ["اپنے ", "پانی کے کاروبار", " کو ہوشیاری سے چلائیں"],
    hero_sub: "AquaRun ڈیلیوری، بلنگ، کسٹمرز، رائیڈرز اور اکاؤنٹنگ سنبھالتا ہے — آپ صرف کاروبار بڑھائیں۔",
    cta_start: "مفت شروع کریں",
    cta_how: "دیکھیں کیسے کام کرتا ہے",
    hero_trust: "پاکستان میں ۲۰۰ سے زیادہ پانی کے کاروباروں کا اعتماد",
    s1: "فعال کاروبار", s2: "ڈیلیوریاں ٹریک", s3: "کلاؤڈ بیسڈ", s4: "کہیں سے بھی رسائی",
    feat_eye: "خصوصیات",
    feat_title: "آپ کے پانی کے کاروبار کے لیے سب کچھ",
    feat_sub: "خاص طور پر پاکستانی واٹر ڈیلیوری کمپنیوں کے لیے — مقامی ادائیگی، اردو سپورٹ اور مکمل اکاؤنٹنگ۔",
    features: [
      { icon: "🚚", title: "ڈیلیوری مینجمنٹ", desc: "رائیڈرز کو ڈیلیوریاں تفویض کریں، ریئل ٹائم اسٹیٹس دیکھیں۔" },
      { icon: "👥", title: "کسٹمر اکاؤنٹس", desc: "کسٹمر بیلنس، ادائیگی کی تاریخ اور تفصیلات ایک جگہ۔" },
      { icon: "🧾", title: "انوائسنگ و بلنگ", desc: "GST کے ساتھ خودکار انوائس، تھرمل اور A4 فارمیٹ۔" },
      { icon: "📊", title: "ڈبل اینٹری اکاؤنٹنگ", desc: "مکمل COA، جرنل اندراجات، ٹرائل بیلنس، P&L — سب شامل۔" },
      { icon: "💳", title: "جازکیش و ایزی پیسہ", desc: "تمام ادائیگی طریقے قبول کریں۔ خودکار ریکنسائلیشن۔" },
      { icon: "📱", title: "رائیڈر موبائل ایپ", desc: "رائیڈرز فون سے ڈیلیوری اپڈیٹ کریں — آف لائن بھی۔" },
      { icon: "🏢", title: "ملٹی ٹیننٹ سسٹم", desc: "ایک سسٹم میں متعدد برانڈز — ہر کاروبار کا الگ ڈیٹا۔" },
      { icon: "💰", title: "تنخواہ و ایڈوانس", desc: "ایڈوانس ٹریک، تنخواہ ادائیگی اور لیجر رپورٹ۔" },
    ],
    wf_eye: "کیسے کام کرتا ہے",
    wf_title: "ڈیلیوری کا مکمل سفر دیکھیں",
    wf_sub: "آرڈر بننے سے لے کر لیجر اپڈیٹ تک — لائیو دیکھیں۔",
    steps: [
      { icon: "📋", title: "ایڈمن آرڈر بناتا ہے", desc: "کسٹمر، پروڈکٹ اور مقدار منتخب کریں — آرڈر فوری ظاہر ہوتا ہے۔" },
      { icon: "🏍️", title: "آرڈر رائیڈر کو تفویض", desc: "ایک کلک میں قریب ترین رائیڈر کو آرڈر مل جاتا ہے۔" },
      { icon: "📍", title: "رائیڈر راستے میں", desc: "رائیڈر آرڈر اٹھاتا ہے اور نقشے پر کسٹمر کی طرف روانہ ہوتا ہے۔" },
      { icon: "✅", title: "ڈیلیوری مکمل", desc: "رائیڈر مارک کرتا ہے۔ ادائیگی ہوتی ہے۔ بیلنس اور لیجر خودبخود اپڈیٹ۔" },
    ],
    l1: "نقد آمدنی", l2: "ڈیلیوریاں", l3: "باقی",
    notif_assigned_en: "✓ رائیڈر مقرر",
    notif_done_en: "✅ ڈیلیور! لیجر اپڈیٹ",
    pr_eye: "قیمت", pr_title: "سادہ اور شفاف قیمت", pr_sub: "ایک پلان۔ سب کچھ شامل۔ کوئی چھپی فیس نہیں۔",
    pr_popular: "سب سے مقبول", pr_label: "پروفیشنل", pr_mo: "/ماہ",
    pr_setup: "+ Rs. 15,000 ایک بار سیٹ اپ فیس",
    pf: ["لامحدود ڈیلیوریاں", "لامحدود کسٹمرز و رائیڈرز", "مکمل ڈبل اینٹری اکاؤنٹنگ",
         "انوائس (A4 + تھرمل)", "جازکیش و ایزی پیسہ سپورٹ",
         "رائیڈرز کے لیے آف لائن موڈ", "WhatsApp و فون سپورٹ", "مفت سیٹ اپ و آن بورڈنگ"],
    pr_cta: "آج ہی شروع کریں",
    ct_eye: "رابطہ", ct_title: "آئیں شروع کریں",
    ct_h3: "اپنے پانی کے کاروبار کو بہتر بنانے کے لیے تیار ہیں؟",
    ct_p: "WhatsApp، فون یا ای میل سے رابطہ کریں۔ ۲۴ گھنٹوں میں سیٹ اپ ہو جائیں۔",
    ch_wa: "WhatsApp (سب سے تیز)", ch_ph: "فون کال", ch_em: "ای میل", ch_loc_l: "مقام",
    ch_loc: "کموکے / لاہور، پاکستان",
    cf_name: "آپ کا نام", cf_phone: "فون نمبر", cf_biz: "کاروبار کا نام",
    cf_msg: "اپنے واٹر ڈیلیوری کاروبار کے بارے میں بتائیں...",
    cf_btn: "WhatsApp پر پیغام بھیجیں",
    testimonials: [
      { name: "محمد آصف", biz: "المدینہ واٹر", city: "لاہور", rating: 5, text: "AquaRun سے پہلے مجھے نہیں پتہ تھا کون سا رائیڈر کیا ڈیلیور کر رہا ہے۔ اب سب کچھ لائیو نظر آتا ہے۔ پہلے مہینے میں کیش ریکوری ۴۰٪ بہتر ہوئی۔" },
      { name: "حاجی طارق محمود", biz: "پیور ڈراپس واٹر", city: "فیصل آباد", rating: 5, text: "اکاؤنٹنگ فیچر بہت زبردست ہے۔ پہلے ۸ ہزار روپے ماہانہ اکاؤنٹنٹ کو دیتا تھا۔ AquaRun سب خودکار کرتا ہے — جرنل، لیجر، بیلنس شیٹ۔ پیسے وصول ہیں۔" },
      { name: "عمران شہزاد", biz: "کرسٹل واٹر سپلائی", city: "گوجرانوالہ", rating: 5, text: "رائیڈرز کو ایپ بہت پسند ہے۔ انٹرنیٹ بند ہو تب بھی ڈیلیوری ریکارڈ ہوتی ہے۔ واپس آتے ہی خود بخود سنک ہو جاتا ہے۔ ایک ریکارڈ بھی نہیں چھوٹا۔" },
      { name: "عثمان علی", biz: "حیات منرل واٹر", city: "راولپنڈی", rating: 5, text: "جازکیش ریکنسائلیشن نے ہفتے میں گھنٹوں کی بچت کی۔ ہر ادائیگی ٹریک ہے، ہر کسٹمر بیلنس درست ہے۔ ایک ٹچ میں دیکھ سکتا ہوں کون پیسے دینا ہے۔" },
      { name: "عبدالرحمٰن", biz: "زم زم واٹر پلانٹ", city: "ملتان", rating: 5, text: "۲۴ گھنٹے سے کم میں سیٹ اپ ہو گیا۔ ٹیم نے سارا ڈیٹا منتقل کرنے میں مدد کی۔ ایک ہفتے میں پوری ٹیم استعمال کر رہی تھی۔ کارپوریٹ کلائنٹس کو کسٹمر پورٹل بہت پسند ہے۔" },
      { name: "بلال حسین", biz: "الشفاء واٹر", city: "سیالکوٹ", rating: 5, text: "AquaRun سے پہلے کاغذی رجسٹر تھے۔ اب سب ڈیجیٹل ہے — کسٹمر اکاؤنٹ، رائیڈر کیش، روزانہ رپورٹس۔ پلانٹ سے باہر بھی فون پر کاروبار چیک کر لیتا ہوں۔" },
    ],
    ft_copy: "© 2026 AquaRun · پاکستان کی واٹر انڈسٹری کے لیے",
    ft_login: "ایڈمن لاگ ان", ft_wa: "WhatsApp", ft_email: "ای میل",
    wa_tooltip: "WhatsApp پر چیٹ کریں",
  },
};

/* ─────────────────────────────────────────────
   DELIVERY ANIMATION HOOK
───────────────────────────────────────────── */
function useDeliveryAnim(lang, active) {
  const [step, setStep] = useState(0);
  const [cardPos, setCardPos] = useState({ x: 155, y: 20, opacity: 0 });
  const [cardBadge, setCardBadge] = useState("new");
  const [riderPos, setRiderPos] = useState({ x: 25, y: 58, opacity: 0 });
  const [pins, setPins] = useState({ admin: false, c1: false, c2: false, c3: false });
  const [notif, setNotif] = useState({ text: "", visible: false });
  const [ledger, setLedger] = useState({ cash: "Rs. 4,800", del: "24", pend: "3" });
  const [ledgerFlash, setLedgerFlash] = useState(false);
  const [adminRows, setAdminRows] = useState({ newOrder: false, assigned: false });
  const running = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!active) return;
    cancelled.current = false;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const showNotif = async (text, dur = 1800) => {
      if (cancelled.current) return;
      setNotif({ text, visible: true });
      await delay(dur);
      if (cancelled.current) return;
      setNotif({ text, visible: false });
      await delay(400);
    };

    async function loop() {
      if (running.current) return;
      running.current = true;
      while (!cancelled.current) {
        // RESET
        setStep(0); setCardBadge("new");
        setCardPos({ x: 155, y: 20, opacity: 0 });
        setRiderPos({ x: 25, y: 58, opacity: 0 });
        setPins({ admin: false, c1: false, c2: false, c3: false });
        setNotif({ text: "", visible: false });
        setLedger({ cash: "Rs. 4,800", del: "24", pend: "3" });
        setAdminRows({ newOrder: false, assigned: false });
        await delay(700);
        if (cancelled.current) break;

        // Step 0 — order created
        setAdminRows({ newOrder: true, assigned: false });
        setCardPos({ x: 155, y: 20, opacity: 1 });
        await delay(1500);
        if (cancelled.current) break;

        // Step 1 — assign
        setStep(1); setCardBadge("assigned");
        setAdminRows({ newOrder: false, assigned: true });
        setCardPos({ x: 185, y: 85, opacity: 1 });
        await delay(800);
        if (cancelled.current) break;
        await showNotif(lang === "ur" ? "✓ رائیڈر مقرر" : "✓ Rider Assigned", 1400);
        if (cancelled.current) break;

        // Step 2 — rider on way
        setStep(2); setCardBadge("transit");
        setPins({ admin: true, c1: false, c2: false, c3: false });
        await delay(300);
        setPins({ admin: true, c1: true, c2: false, c3: false });
        await delay(200);
        setPins({ admin: true, c1: true, c2: true, c3: false });
        await delay(200);
        setPins({ admin: true, c1: true, c2: true, c3: true });
        await delay(300);
        setRiderPos({ x: 25, y: 58, opacity: 1 });
        await delay(400);
        setRiderPos({ x: 60, y: 27, opacity: 1 });
        await delay(2000);
        if (cancelled.current) break;

        // Step 3 — delivered
        setStep(3); setCardBadge("done");
        await showNotif(lang === "ur" ? "✅ ڈیلیور! لیجر اپڈیٹ" : "✅ Delivered! Ledger Updated", 2000);
        if (cancelled.current) break;
        setLedgerFlash(true);
        setLedger({ cash: "Rs. 5,200", del: "25", pend: "2" });
        await delay(700);
        setLedgerFlash(false);
        await delay(1200);
        setCardPos({ x: 185, y: 85, opacity: 0 });
        setAdminRows({ newOrder: false, assigned: false });
        await delay(1400);
      }
      running.current = false;
    }
    loop();
    return () => { cancelled.current = true; running.current = false; };
  }, [active, lang]);

  return { step, cardPos, cardBadge, riderPos, pins, notif, ledger, ledgerFlash, adminRows };
}

/* ─────────────────────────────────────────────
   STYLES  (injected once as a <style> tag)
───────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap');

.ar-root{--deep:#07203A;--navy:#0A2F52;--brand:#1E88E5;--accent:#00C4E8;--accent2:#0077B6;--green:#00C896;--orange:#FF7B2C;--white:#fff;--g50:#F4F8FD;--g100:#E8F0FE;--g300:#94A3B8;--g700:#334155;--r:14px;--sh:0 8px 32px rgba(7,32,58,.12);}
.ar-root *{box-sizing:border-box;margin:0;padding:0;}
.ar-root{font-family:'Inter',sans-serif;color:var(--deep);background:var(--white);overflow-x:hidden;scroll-behavior:smooth;}
.ar-root.urdu{font-family:'Noto Nastaliq Urdu',serif;direction:rtl;}

/* NAV */
.ar-nav{position:sticky;top:0;z-index:200;background:rgba(255,255,255,.94);backdrop-filter:blur(16px);border-bottom:1px solid rgba(30,136,229,.10);display:flex;align-items:center;justify-content:space-between;padding:0 5vw;height:64px;box-shadow:0 2px 16px rgba(7,32,58,.07);}
.ar-logo{display:flex;align-items:center;gap:10px;text-decoration:none;}
.ar-logo-icon{width:34px;height:34px;background:linear-gradient(135deg,var(--brand),var(--accent));border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 4px 12px rgba(30,136,229,.35);}
.ar-logo-text{font-size:1.3rem;font-weight:900;color:var(--deep);letter-spacing:-.02em;}
.ar-logo-text b{color:var(--brand);}
.ar-nav-right{display:flex;align-items:center;gap:12px;}
.ar-lang{display:flex;background:var(--g50);border-radius:99px;padding:3px;border:1px solid var(--g100);}
.ar-lang button{border:none;background:transparent;padding:5px 14px;border-radius:99px;font-size:.78rem;font-weight:700;cursor:pointer;color:var(--g300);transition:all .2s;line-height:1.4;}
.ar-lang button.on{background:var(--brand);color:#fff;box-shadow:0 2px 8px rgba(30,136,229,.3);}
.ar-btn-nav{padding:8px 20px;border-radius:99px;background:linear-gradient(135deg,var(--brand),var(--accent2));color:#fff;font-weight:700;font-size:.83rem;border:none;cursor:pointer;text-decoration:none;box-shadow:0 4px 12px rgba(30,136,229,.3);transition:transform .2s,box-shadow .2s;white-space:nowrap;}
.ar-btn-nav:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(30,136,229,.4);}

/* HERO */
.ar-hero{position:relative;overflow:hidden;background:linear-gradient(150deg,var(--deep) 0%,#0D3B6E 50%,#0A5C8A 100%);min-height:90vh;display:flex;align-items:center;padding:90px 5vw 70px;}
.ar-grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(0,196,232,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,196,232,.05) 1px,transparent 1px);background-size:60px 60px;animation:arGridMove 20s linear infinite;}
@keyframes arGridMove{0%{background-position:0 0}100%{background-position:60px 60px}}
.ar-orb{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;}
.ar-orb1{width:420px;height:420px;background:rgba(0,196,232,.10);top:-100px;right:-80px;animation:arOrb 10s ease-in-out infinite;}
.ar-orb2{width:300px;height:300px;background:rgba(30,136,229,.13);bottom:0;left:-60px;animation:arOrb 13s ease-in-out infinite reverse;}
@keyframes arOrb{0%,100%{transform:translate(0,0)}50%{transform:translate(24px,-24px)}}
.ar-hero-inner{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;width:100%;max-width:1180px;margin:0 auto;}
.ar-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border-radius:99px;background:rgba(0,196,232,.12);color:var(--accent);font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(0,196,232,.25);margin-bottom:22px;}
.ar-badge::before{content:'●';font-size:.45rem;animation:arPulse 1.5s ease-in-out infinite;}
@keyframes arPulse{0%,100%{opacity:1}50%{opacity:.3}}
.ar-h1{font-size:clamp(2rem,4vw,3.4rem);font-weight:900;color:#fff;line-height:1.12;margin-bottom:20px;letter-spacing:-.03em;}
.ar-h1 em{font-style:normal;color:var(--accent);}
.ar-hero-sub{font-size:clamp(.9rem,1.8vw,1.05rem);color:rgba(255,255,255,.65);line-height:1.75;margin-bottom:32px;max-width:460px;}
.ar-cta{display:flex;gap:12px;flex-wrap:wrap;}
.ar-btn-primary{padding:13px 28px;border-radius:99px;background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;font-weight:800;font-size:.95rem;border:none;cursor:pointer;text-decoration:none;box-shadow:0 8px 28px rgba(30,136,229,.4);transition:transform .2s,box-shadow .2s;display:inline-block;}
.ar-btn-primary:hover{transform:translateY(-3px);box-shadow:0 14px 36px rgba(30,136,229,.5);}
.ar-btn-ghost{padding:13px 28px;border-radius:99px;background:rgba(255,255,255,.08);color:#fff;font-weight:600;font-size:.95rem;border:1.5px solid rgba(255,255,255,.2);cursor:pointer;text-decoration:none;display:inline-block;transition:background .2s;}
.ar-btn-ghost:hover{background:rgba(255,255,255,.15);}
.ar-trust{display:flex;align-items:center;gap:10px;margin-top:24px;color:rgba(255,255,255,.4);font-size:.78rem;}
.ar-waves{position:absolute;bottom:-2px;left:0;right:0;height:90px;overflow:hidden;line-height:0;}
.ar-waves svg{display:block;width:100%;height:100%;}

/* PHONE MOCKUP */
.ar-phone{width:240px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:14px;backdrop-filter:blur(10px);box-shadow:0 28px 70px rgba(0,0,0,.4);}
.ar-phone-notch{width:70px;height:5px;background:rgba(255,255,255,.15);border-radius:99px;margin:0 auto 12px;}
.ar-phone-stat{background:rgba(255,255,255,.07);border-radius:10px;padding:9px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;}
.ar-phone-stat-label{font-size:.65rem;color:rgba(255,255,255,.45);}
.ar-phone-stat-val{font-size:1rem;font-weight:800;color:var(--accent);}
.ar-phone-order{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;margin-bottom:5px;background:rgba(255,255,255,.06);font-size:.65rem;color:rgba(255,255,255,.78);transition:all .3s;}
.ar-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.dot-g{background:var(--green);box-shadow:0 0 5px var(--green);}
.dot-o{background:var(--orange);box-shadow:0 0 5px var(--orange);}
.dot-b{background:var(--accent);box-shadow:0 0 5px var(--accent);}

/* STATS */
.ar-stats{display:flex;justify-content:center;flex-wrap:wrap;background:#fff;border-bottom:1px solid var(--g100);box-shadow:0 4px 20px rgba(7,32,58,.06);}
.ar-stat{padding:26px 44px;text-align:center;border-right:1px solid var(--g100);transition:background .2s;}
.ar-stat:last-child{border-right:none;}
.ar-stat:hover{background:var(--g50);}
.ar-stat-num{font-size:2rem;font-weight:900;background:linear-gradient(135deg,var(--brand),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.ar-stat-label{font-size:.75rem;color:var(--g300);margin-top:4px;font-weight:600;letter-spacing:.03em;}

/* SECTIONS */
.ar-section{padding:88px 5vw;}
.ar-eye{font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand);margin-bottom:10px;}
.ar-title{font-size:clamp(1.7rem,3.5vw,2.5rem);font-weight:900;color:var(--deep);line-height:1.14;letter-spacing:-.02em;margin-bottom:14px;}
.ar-sub{font-size:1rem;color:var(--g300);line-height:1.75;}
.center{text-align:center;}.center .ar-sub{max-width:560px;margin:0 auto;}

/* FEATURES */
.ar-features{background:var(--g50);}
.ar-feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:52px;}
.ar-fc{background:#fff;border-radius:var(--r);padding:28px 24px;border:1px solid var(--g100);transition:all .25s;position:relative;overflow:hidden;cursor:default;}
.ar-fc::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(30,136,229,.04),rgba(0,196,232,.04));opacity:0;transition:opacity .3s;}
.ar-fc:hover{box-shadow:0 14px 36px rgba(7,32,58,.10);transform:translateY(-5px);}
.ar-fc:hover::before{opacity:1;}
.ar-fc-icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,var(--g100),var(--g50));display:flex;align-items:center;justify-content:center;font-size:1.35rem;margin-bottom:16px;border:1px solid var(--g100);transition:all .25s;}
.ar-fc:hover .ar-fc-icon{background:linear-gradient(135deg,var(--brand),var(--accent));border:none;box-shadow:0 6px 14px rgba(30,136,229,.28);}
.ar-fc h3{font-size:.95rem;font-weight:700;color:var(--deep);margin-bottom:7px;}
.ar-fc p{font-size:.84rem;color:var(--g300);line-height:1.65;}

/* WORKFLOW */
.ar-workflow{background:#fff;}
.ar-wf-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:52px;align-items:center;margin-top:52px;}
.ar-wstep{display:flex;gap:16px;padding:18px 0 18px 26px;border-left:2px solid var(--g100);position:relative;cursor:pointer;transition:all .2s;}
.ar-wstep::before{content:'';position:absolute;left:-7px;top:22px;width:12px;height:12px;border-radius:50%;background:var(--g100);border:2px solid #fff;transition:all .3s;}
.ar-wstep.on::before{background:var(--brand);box-shadow:0 0 0 4px rgba(30,136,229,.2);}
.ar-wstep.on{border-left-color:var(--brand);}
.ar-wstep-icon{width:40px;height:40px;border-radius:11px;flex-shrink:0;background:var(--g50);border:1px solid var(--g100);display:flex;align-items:center;justify-content:center;font-size:1rem;transition:all .3s;}
.ar-wstep.on .ar-wstep-icon{background:linear-gradient(135deg,var(--brand),var(--accent));border:none;box-shadow:0 5px 14px rgba(30,136,229,.3);}
.ar-wstep h4{font-size:.9rem;font-weight:700;color:var(--deep);margin-bottom:4px;transition:color .2s;}
.ar-wstep.on h4{color:var(--brand);}
.ar-wstep p{font-size:.8rem;color:var(--g300);line-height:1.6;}
.urdu .ar-wstep{border-left:none;border-right:2px solid var(--g100);padding-left:0;padding-right:26px;}
.urdu .ar-wstep::before{left:auto;right:-7px;}
.urdu .ar-wstep.on{border-right-color:var(--brand);}

/* ANIM CANVAS */
.ar-canvas{background:linear-gradient(145deg,#07203A,#0D3B6E);border-radius:18px;padding:20px;min-height:380px;position:relative;overflow:hidden;box-shadow:0 28px 56px rgba(7,32,58,.25);border:1px solid rgba(255,255,255,.06);}
.ar-canvas-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(0,196,232,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,196,232,.04) 1px,transparent 1px);background-size:28px 28px;}
.ar-stage{position:relative;z-index:2;height:340px;}

/* admin panel */
.ar-admin{position:absolute;left:10px;top:10px;width:130px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:9px;}
.ar-admin-title{font-size:.55rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px;}
.ar-admin-row{background:rgba(255,255,255,.06);border-radius:5px;padding:4px 7px;margin-bottom:3px;font-size:.58rem;color:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:space-between;}
.ar-admin-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
@keyframes arDotPulse{0%,100%{opacity:1}50%{opacity:.3}}
.ar-admin-dot.pulse{animation:arDotPulse 1s infinite;}

/* order card */
.ar-card{position:absolute;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:7px 10px;font-size:.56rem;color:rgba(255,255,255,.85);backdrop-filter:blur(4px);min-width:108px;z-index:20;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:left .9s cubic-bezier(.4,0,.2,1),top .9s cubic-bezier(.4,0,.2,1),opacity .5s;}
.ar-card-title{font-weight:700;font-size:.62rem;margin-bottom:3px;color:#fff;}
.ar-card-row{display:flex;justify-content:space-between;gap:6px;color:rgba(255,255,255,.5);margin-top:2px;}
.ar-badge2{display:inline-block;padding:2px 7px;border-radius:99px;font-size:.52rem;font-weight:700;letter-spacing:.04em;margin-top:4px;}
.b-new{background:rgba(0,196,232,.2);color:var(--accent);border:1px solid rgba(0,196,232,.3);}
.b-assigned{background:rgba(255,123,44,.2);color:var(--orange);border:1px solid rgba(255,123,44,.3);}
.b-transit{background:rgba(255,200,0,.15);color:#FFD700;border:1px solid rgba(255,200,0,.2);}
.b-done{background:rgba(0,200,150,.2);color:var(--green);border:1px solid rgba(0,200,150,.3);}

/* map */
.ar-map{position:absolute;right:10px;top:10px;bottom:10px;width:158px;background:rgba(30,136,229,.06);border:1px solid rgba(30,136,229,.15);border-radius:10px;overflow:hidden;}
.ar-map-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(0,196,232,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,196,232,.06) 1px,transparent 1px);background-size:18px 18px;}
.ar-map-label{position:absolute;top:7px;left:8px;right:8px;font-size:.5rem;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.06em;text-transform:uppercase;}
.ar-road{position:absolute;background:rgba(255,255,255,.06);border-radius:2px;}
.ar-pin{position:absolute;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-size:.65rem;box-shadow:0 3px 8px rgba(0,0,0,.3);transition:opacity .5s,transform .4s;}
.ar-pin span{transform:rotate(45deg);display:block;}
.pin-blue{background:linear-gradient(135deg,var(--brand),var(--accent2));}
.pin-grn{background:linear-gradient(135deg,var(--green),#00A878);}
.ar-rider{position:absolute;width:26px;height:26px;background:linear-gradient(135deg,var(--orange),#E65C00);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;z-index:10;box-shadow:0 0 0 3px rgba(255,123,44,.3),0 4px 10px rgba(255,123,44,.4);transition:left 1.8s cubic-bezier(.4,0,.2,1),top 1.8s cubic-bezier(.4,0,.2,1),opacity .4s;}

/* notif */
.ar-notif{position:absolute;right:14px;top:120px;background:rgba(0,200,150,.15);border:1px solid rgba(0,200,150,.3);border-radius:7px;padding:5px 9px;font-size:.56rem;color:var(--green);font-weight:600;z-index:30;white-space:nowrap;transition:opacity .4s,transform .4s;}

/* ledger */
.ar-ledger{position:absolute;bottom:10px;left:10px;right:175px;background:rgba(0,196,232,.08);border:1px solid rgba(0,196,232,.15);border-radius:8px;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;}
.ar-ledger-item{text-align:center;}
.ar-ledger-label{font-size:.48rem;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.05em;}
.ar-ledger-val{font-size:.72rem;font-weight:800;color:var(--accent);transition:color .3s,transform .3s;}
.ar-ledger-val.flash{color:var(--green);transform:scale(1.2);}

      {/* ── PRICING ── */}
.ar-pricing{background:linear-gradient(145deg,var(--deep),#0D3B6E);}
.ar-pricing .ar-eye{color:var(--accent);}
.ar-pricing .ar-title{color:#fff;}
.ar-pricing .ar-sub{color:rgba(255,255,255,.5);}
.ar-pc-wrap{max-width:440px;margin:52px auto 0;}
.ar-pc{background:rgba(30,136,229,.12);border:1px solid rgba(30,136,229,.35);border-radius:20px;padding:38px 30px;position:relative;transition:transform .25s,box-shadow .25s;}
.ar-pc:hover{transform:translateY(-6px);box-shadow:0 20px 50px rgba(0,0,0,.3);}
.ar-pc-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;font-size:.68rem;font-weight:800;padding:4px 16px;border-radius:99px;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;}
.ar-pc-label{font-size:.7rem;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px;}
.ar-pc-price{margin-bottom:5px;}
.ar-pc-cur{font-size:1rem;font-weight:700;color:var(--accent);vertical-align:super;}
.ar-pc-amt{font-size:2.6rem;font-weight:900;color:#fff;}
.ar-pc-per{font-size:.82rem;color:rgba(255,255,255,.4);}
.ar-pc-setup{font-size:.8rem;color:rgba(255,255,255,.35);margin-bottom:26px;}
.ar-pc-ul{list-style:none;margin-bottom:28px;}
.ar-pc-ul li{padding:8px 0;font-size:.88rem;color:rgba(255,255,255,.75);border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:9px;}
.ar-pc-ul li:last-child{border-bottom:none;}
.ar-chk{color:var(--green);font-size:.85rem;}
.ar-pc-btn{display:block;width:100%;padding:13px;border-radius:99px;text-align:center;background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;font-weight:800;font-size:.92rem;border:none;cursor:pointer;text-decoration:none;box-shadow:0 6px 20px rgba(30,136,229,.35);transition:transform .2s,box-shadow .2s;}
.ar-pc-btn:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(30,136,229,.45);}

/* CONTACT */
.ar-contact{background:var(--g50);}
.ar-ct-grid{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:start;margin-top:52px;}
.ar-ct-info h3{font-size:1.2rem;font-weight:800;color:var(--deep);margin-bottom:7px;}
.ar-ct-info p{font-size:.9rem;color:var(--g300);line-height:1.7;margin-bottom:26px;}
.ar-channels{display:flex;flex-direction:column;gap:11px;}
.ar-ch{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:var(--r);background:#fff;border:1px solid var(--g100);text-decoration:none;color:var(--deep);transition:all .25s;font-size:.88rem;font-weight:500;}
.ar-ch:hover{border-color:var(--brand);box-shadow:0 6px 20px rgba(30,136,229,.12);transform:translateX(4px);}
.urdu .ar-ch:hover{transform:translateX(-4px);}
.ar-ch-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;}
.ci-wa{background:linear-gradient(135deg,#25D366,#128C7E);}
.ci-ph{background:linear-gradient(135deg,var(--brand),var(--accent));}
.ci-em{background:linear-gradient(135deg,#EA4335,#C62828);}
.ci-loc{background:linear-gradient(135deg,var(--orange),#E65C00);}
.ar-ch-det{display:flex;flex-direction:column;}
.ar-ch-det span:first-child{font-size:.66rem;color:var(--g300);font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:1px;}
.ar-ch-det span:last-child{font-weight:600;color:var(--deep);}
.ar-ch-arr{margin-left:auto;color:var(--g300);font-size:.75rem;transition:transform .2s;}
.urdu .ar-ch-arr{margin-left:0;margin-right:auto;}
.ar-ch:hover .ar-ch-arr{transform:translateX(4px);color:var(--brand);}
.urdu .ar-ch:hover .ar-ch-arr{transform:translateX(-4px);}

/* FORM */
.ar-form{display:flex;flex-direction:column;gap:12px;}
.ar-form input,.ar-form textarea{padding:12px 15px;border-radius:var(--r);border:1.5px solid var(--g100);background:#fff;font-size:.88rem;font-family:inherit;color:var(--deep);outline:none;transition:border-color .2s,box-shadow .2s;width:100%;}
.ar-form input:focus,.ar-form textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(30,136,229,.10);}
.ar-form textarea{resize:vertical;min-height:100px;}
.ar-form button{padding:13px;border-radius:99px;background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;font-weight:800;font-size:.92rem;border:none;cursor:pointer;box-shadow:0 6px 20px rgba(30,136,229,.3);transition:transform .2s,box-shadow .2s;width:100%;}
.ar-form button:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(30,136,229,.4);}

/* WA FLOAT */
.ar-wa-float{position:fixed;bottom:24px;right:24px;z-index:999;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#25D366,#128C7E);display:flex;align-items:center;justify-content:center;font-size:1.5rem;text-decoration:none;box-shadow:0 8px 24px rgba(37,211,102,.45);animation:arWaFloat 3s ease-in-out infinite;transition:transform .2s,box-shadow .2s;}
.ar-wa-float:hover{transform:scale(1.1)!important;box-shadow:0 12px 32px rgba(37,211,102,.55);animation:none;}
@keyframes arWaFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.ar-wa-tip{position:absolute;right:64px;top:50%;transform:translateY(-50%);background:var(--deep);color:#fff;font-size:.7rem;font-weight:600;padding:5px 12px;border-radius:99px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s;font-family:'Inter',sans-serif;}
.ar-wa-float:hover .ar-wa-tip{opacity:1;}

/* FOOTER */
.ar-footer{background:var(--deep);padding:28px 5vw;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid rgba(255,255,255,.06);}
.ar-footer-logo{font-size:1rem;font-weight:900;color:rgba(255,255,255,.7);}
.ar-footer-logo b{color:var(--accent);}
.ar-footer p{font-size:.76rem;color:rgba(255,255,255,.35);}
.ar-footer-links{display:flex;gap:18px;}
.ar-footer-links a{font-size:.76rem;color:rgba(255,255,255,.4);text-decoration:none;transition:color .2s;}
.ar-footer-links a:hover{color:var(--accent);}

/* REVEAL */
.ar-reveal{opacity:0;transform:translateY(28px);transition:opacity .6s ease,transform .6s ease;}
.ar-reveal.vis{opacity:1;transform:none;}

/* ── RESPONSIVE ── */
@media(max-width:900px){
  .ar-hero-inner{grid-template-columns:1fr;text-align:center;}
  .ar-phone{display:none;}
  .ar-hero-sub{margin-left:auto;margin-right:auto;}
  .ar-cta{justify-content:center;}
  .ar-trust{justify-content:center;}
  .ar-wf-grid{grid-template-columns:1fr;}
  .ar-ct-grid{grid-template-columns:1fr;}
  .ar-stat{border-right:none;border-bottom:1px solid var(--g100);padding:18px 22px;}
  .ar-canvas{min-height:300px;}
  .ar-stage{height:280px;}
  .ar-admin{width:110px;}
  .ar-map{width:130px;}
  .ar-ledger{right:145px;}
}
@media(max-width:600px){
  .ar-nav{padding:0 4vw;height:58px;}
  .ar-btn-nav{display:none;}
  .ar-section{padding:64px 4vw;}
  .ar-hero{padding:70px 4vw 56px;}
  .ar-h1{font-size:1.85rem;}
  .ar-btn-primary,.ar-btn-ghost{padding:12px 22px;font-size:.88rem;}
  .ar-wa-float{bottom:18px;right:18px;width:50px;height:50px;font-size:1.3rem;}
  .ar-feat-grid{grid-template-columns:1fr;}
  .ar-canvas{padding:14px;}
  .ar-admin{width:100px;padding:7px;}
  .ar-map{width:110px;}
  .ar-ledger{right:124px;padding:6px 8px;}
  .ar-ledger-val{font-size:.62rem;}
  .ar-card{min-width:88px;font-size:.5rem;}
  .ar-footer{flex-direction:column;text-align:center;}
  .ar-footer-links{justify-content:center;}
}
`;

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function Landing({ onLogin }) {
  const [lang, setLang] = useState("en");
  const t = T[lang];
  const isUrdu = lang === "ur";

  // form state
  const [form, setForm] = useState({ name: "", phone: "", biz: "", msg: "" });

  // workflow animation triggers when section in view
  const [wfVisible, setWfVisible] = useState(false);
  const wfRef = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setWfVisible(true); obs.disconnect(); } },
      { threshold: 0.25 }
    );
    if (wfRef.current) obs.observe(wfRef.current);
    return () => obs.disconnect();
  }, []);

  const anim = useDeliveryAnim(lang, wfVisible);

  // scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll(".ar-reveal");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("vis"); obs.unobserve(e.target); } }),
      { threshold: 0.1 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [lang]);

  // hero phone tick
  const heroData = [
    { del: "24", cash: "Rs. 4,800", orders: [["dot-g","Ahmad – 2 Bottles – Done"],["dot-o","Sara – 1 Bottle – On Way"],["dot-b","Bilal – 3 Bottles – Pending"]] },
    { del: "28", cash: "Rs. 5,600", orders: [["dot-g","Fatima – 1 Bottle – Done"],["dot-g","Usman – 3 Bottles – Done"],["dot-o","Zara – 2 Bottles – On Way"]] },
    { del: "31", cash: "Rs. 6,200", orders: [["dot-o","Hassan – 1 Bottle – On Way"],["dot-b","Nadia – 4 Bottles – Pending"],["dot-g","Tariq – 2 Bottles – Done"]] },
  ];
  const [heroIdx, setHeroIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % heroData.length), 3000);
    return () => clearInterval(id);
  }, []);
  const hd = heroData[heroIdx];

  function submitForm(e) {
    e.preventDefault();
    const msg = `Hello AquaRun! I'm interested in your water delivery software.%0AName: ${encodeURIComponent(form.name)}%0APhone: ${encodeURIComponent(form.phone)}%0ABusiness: ${encodeURIComponent(form.biz)}%0AMessage: ${encodeURIComponent(form.msg)}`;
    window.open(`https://wa.me/923237919338?text=${msg}`, "_blank");
  }

  const badgeClass = { new: "b-new", assigned: "b-assigned", transit: "b-transit", done: "b-done" };
  const badgeText = { new: "● NEW", assigned: "● ASSIGNED", transit: "● IN TRANSIT", done: "● DELIVERED" };

  return (
    <div className={`ar-root${isUrdu ? " urdu" : ""}`} dir={isUrdu ? "rtl" : "ltr"}>
      <style>{CSS}</style>

      {/* WA FLOAT */}
      <a href="https://wa.me/923237919338" className="ar-wa-float" target="_blank" rel="noopener" aria-label="WhatsApp">
        💬<span className="ar-wa-tip">{t.wa_tooltip}</span>
      </a>

      {/* NAV */}
      <nav className="ar-nav">
        <a href="#" className="ar-logo">
          <div className="ar-logo-icon">💧</div>
          <span className="ar-logo-text">Aqua<b>Run</b></span>
        </a>
        <div className="ar-nav-right">
          <div className="ar-lang">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "ur" ? "on" : ""} onClick={() => setLang("ur")}>اردو</button>
          </div>
          <a href="/login" className="ar-btn-nav"><span onClick={onLogin} style={{ cursor: 'pointer' }}>{t.nav_login}</span></a>
        </div>
      </nav>

      {/* HERO */}
      <div className="ar-hero">
        <div className="ar-grid-bg" />
        <div className="ar-orb ar-orb1" />
        <div className="ar-orb ar-orb2" />
        <div className="ar-hero-inner">
          <div className="ar-hero-text">
            <div className="ar-badge">{t.badge}</div>
            <h1 className="ar-h1">{t.hero_h1[0]}<em>{t.hero_h1[1]}</em>{t.hero_h1[2]}</h1>
            <p className="ar-hero-sub">{t.hero_sub}</p>
            <div className="ar-cta">
              <a href="#contact" className="ar-btn-primary"><span onClick={onLogin} style={{ cursor: 'pointer' }}>{t.cta_start}</span></a>
              <a href="#workflow" className="ar-btn-ghost">{t.cta_how}</a>
            </div>
            <div className="ar-trust">
              <span>🏢🚚📊</span>
              <span>{t.hero_trust}</span>
            </div>
          </div>
          <div className="ar-hero-visual" style={{ display: "flex", justifyContent: "center" }}>
            <div className="ar-phone">
              <div className="ar-phone-notch" />
              <div className="ar-phone-stat">
                <div className="ar-phone-stat-label">Today's Deliveries</div>
                <div className="ar-phone-stat-val">{hd.del}</div>
              </div>
              <div className="ar-phone-stat">
                <div className="ar-phone-stat-label">Cash Collected</div>
                <div className="ar-phone-stat-val">{hd.cash}</div>
              </div>
              <div>
                {hd.orders.map(([dc, label], i) => (
                  <div key={i} className="ar-phone-order">
                    <div className={`ar-dot ${dc}`} />{label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="ar-waves">
          <svg viewBox="0 0 1440 90" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,45 C360,85 720,5 1080,45 C1260,65 1380,35 1440,45 L1440,90 L0,90 Z" fill="#F4F8FD" opacity=".5" />
            <path d="M0,65 C240,25 600,85 900,55 C1100,35 1300,65 1440,65 L1440,90 L0,90 Z" fill="#F4F8FD" />
          </svg>
        </div>
      </div>

      {/* STATS */}
      <div className="ar-stats">
        {[["200+",t.s1],["100,000+",t.s2],["100%",t.s3],["24/7",t.s4]].map(([n,l],i)=>(
          <div key={i} className="ar-stat ar-reveal">
            <div className="ar-stat-num">{n}</div>
            <div className="ar-stat-label">{l}</div>
          </div>
        ))}
      </div>

      {/* FEATURES */}
      <section className="ar-section ar-features" id="features">
        <div className="center ar-reveal">
          <div className="ar-eye">{t.feat_eye}</div>
          <div className="ar-title">{t.feat_title}</div>
          <div className="ar-sub">{t.feat_sub}</div>
        </div>
        <div className="ar-feat-grid">
          {t.features.map((f, i) => (
            <div key={i} className="ar-fc ar-reveal">
              <div className="ar-fc-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="ar-section ar-workflow" id="workflow" ref={wfRef}>
        <div className="center ar-reveal">
          <div className="ar-eye">{t.wf_eye}</div>
          <div className="ar-title">{t.wf_title}</div>
          <div className="ar-sub">{t.wf_sub}</div>
        </div>
        <div className="ar-wf-grid ar-reveal">
          {/* steps */}
          <div>
            {t.steps.map((s, i) => (
              <div key={i} className={`ar-wstep${anim.step === i ? " on" : ""}`}>
                <div className="ar-wstep-icon">{s.icon}</div>
                <div>
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* animation canvas */}
          <div className="ar-canvas">
            <div className="ar-canvas-grid" />
            <div className="ar-stage">

              {/* Admin panel */}
              <div className="ar-admin">
                <div className="ar-admin-title">Admin Dashboard</div>
                <div className="ar-admin-row">
                  <span>Orders</span>
                  <span style={{ color: "var(--accent)", fontWeight: 800 }}>12</span>
                </div>
                <div className="ar-admin-row">
                  <span>Riders</span>
                  <span style={{ color: "var(--green)", fontWeight: 800 }}>3</span>
                </div>
                {anim.adminRows.newOrder && (
                  <div className="ar-admin-row">
                    <span>New Order</span>
                    <div className="ar-admin-dot dot-b pulse" />
                  </div>
                )}
                {anim.adminRows.assigned && (
                  <div className="ar-admin-row">
                    <span>→ Ali</span>
                    <div className="ar-admin-dot" style={{ background: "var(--orange)" }} />
                  </div>
                )}
              </div>

              {/* Order card */}
              <div className="ar-card" style={{
                left: anim.cardPos.x, top: anim.cardPos.y, opacity: anim.cardPos.opacity
              }}>
                <div className="ar-card-title">Order #SW-2026-0042</div>
                <div className="ar-card-row"><span>Customer:</span><span>Ahmad Raza</span></div>
                <div className="ar-card-row"><span>19L × 2</span><span>Rs. 400</span></div>
                <div className={`ar-badge2 ${badgeClass[anim.cardBadge]}`}>{badgeText[anim.cardBadge]}</div>
              </div>

              {/* Map */}
              <div className="ar-map">
                <div className="ar-map-grid" />
                <div className="ar-map-label">Live Map</div>
                <div className="ar-road" style={{ left:0,right:0,top:"35%",height:2 }} />
                <div className="ar-road" style={{ left:0,right:0,top:"65%",height:2 }} />
                <div className="ar-road" style={{ left:"30%",top:0,bottom:0,width:2 }} />
                <div className="ar-road" style={{ left:"65%",top:0,bottom:0,width:2 }} />
                {/* pins */}
                <div className="ar-pin pin-blue" style={{ left:"20%",top:"53%",opacity:anim.pins.admin?1:0 }}><span>🏢</span></div>
                <div className="ar-pin pin-grn" style={{ left:"57%",top:"22%",opacity:anim.pins.c1?1:0 }}><span>📍</span></div>
                <div className="ar-pin pin-grn" style={{ left:"70%",top:"55%",opacity:anim.pins.c2?1:0 }}><span>📍</span></div>
                <div className="ar-pin pin-grn" style={{ left:"46%",top:"66%",opacity:anim.pins.c3?1:0 }}><span>📍</span></div>
                {/* rider */}
                <div className="ar-rider" style={{
                  left: `${anim.riderPos.x}%`, top: `${anim.riderPos.y}%`, opacity: anim.riderPos.opacity
                }}>🏍️</div>
              </div>

              {/* Notification */}
              <div className="ar-notif" style={{
                opacity: anim.notif.visible ? 1 : 0,
                transform: anim.notif.visible ? "translateY(0)" : "translateY(8px)"
              }}>{anim.notif.text}</div>

              {/* Ledger */}
              <div className="ar-ledger">
                {[[t.l1, anim.ledger.cash],[t.l2, anim.ledger.del],[t.l3, anim.ledger.pend]].map(([label,val],i)=>(
                  <div key={i} className="ar-ledger-item">
                    <div className="ar-ledger-label">{label}</div>
                    <div className={`ar-ledger-val${anim.ledgerFlash?" flash":""}`}>{val}</div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '60px 20px 80px', background: '#f0f7ff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#0077B6', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            {lang === 'ur' ? 'کسٹمر تجربات' : 'Customer Stories'}
          </p>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(22px,4vw,36px)', fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>
            {lang === 'ur' ? 'ہمارے کلائنٹس کیا کہتے ہیں' : 'What Our Clients Say'}
          </h2>
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 15, maxWidth: 500, margin: '0 auto 24px' }}>
            {lang === 'ur' ? 'پاکستان بھر میں ۲۰۰+ واٹر پلانٹس کا بھروسہ' : 'Trusted by 200+ water plants across Pakistan'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'stretch' }}>
            {t.testimonials.map((tm, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 16, padding: '24px 28px', boxShadow: '0 4px 20px rgba(0,119,182,0.08)', border: '1px solid #e0f0ff', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {'★★★★★'.split('').map((s, j) => <span key={j} style={{ color: '#f59e0b', fontSize: 16 }}>{s}</span>)}
                </div>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, flex: 1, direction: lang === 'ur' ? 'rtl' : 'ltr', fontStyle: 'italic' }}>"{tm.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #0077B6, #00B4D8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 16 }}>{tm.name[0]}</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{tm.name}</p>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{tm.biz} · {tm.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="ar-section ar-pricing" id="pricing">
        <div className="center ar-reveal">
          <div className="ar-eye">{t.pr_eye}</div>
          <div className="ar-title">{t.pr_title}</div>
          <div className="ar-sub">{t.pr_sub}</div>
        </div>
        <div className="ar-pc-wrap ar-reveal">
          <div className="ar-pc">
            <div className="ar-pc-badge">{t.pr_popular}</div>
            <div className="ar-pc-label">{t.pr_label}</div>
            <div className="ar-pc-price">
              <span className="ar-pc-cur">Rs.</span>
              <span className="ar-pc-amt">3,000</span>
              <span className="ar-pc-per">{t.pr_mo}</span>
            </div>
            <div className="ar-pc-setup">{t.pr_setup}</div>
            <ul className="ar-pc-ul">
              {t.pf.map((f, i) => <li key={i}><span className="ar-chk">✓</span><span>{f}</span></li>)}
            </ul>
            <a href="#contact" className="ar-pc-btn">{t.pr_cta}</a>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="ar-section ar-contact" id="contact">
        <div className="center ar-reveal">
          <div className="ar-eye">{t.ct_eye}</div>
          <div className="ar-title">{t.ct_title}</div>
        </div>
        <div className="ar-ct-grid ar-reveal">
          <div className="ar-ct-info">
            <h3>{t.ct_h3}</h3>
            <p>{t.ct_p}</p>
            <div className="ar-channels">
              <a href="https://wa.me/923237919338" className="ar-ch" target="_blank" rel="noopener">
                <div className="ar-ch-icon ci-wa">💬</div>
                <div className="ar-ch-det"><span>{t.ch_wa}</span><span>+92 323 7919338</span></div>
                <span className="ar-ch-arr">→</span>
              </a>
              <a href="tel:+923237919338" className="ar-ch">
                <div className="ar-ch-icon ci-ph">📞</div>
                <div className="ar-ch-det"><span>{t.ch_ph}</span><span>+92 323 7919338</span></div>
                <span className="ar-ch-arr">→</span>
              </a>
              <a href="mailto:mian.tanzeel62@gmail.com" className="ar-ch">
                <div className="ar-ch-icon ci-em">✉️</div>
                <div className="ar-ch-det"><span>{t.ch_em}</span><span>mian.tanzeel62@gmail.com</span></div>
                <span className="ar-ch-arr">→</span>
              </a>
              <div className="ar-ch" style={{ cursor: "default" }}>
                <div className="ar-ch-icon ci-loc">📍</div>
                <div className="ar-ch-det"><span>{t.ch_loc_l}</span><span>{t.ch_loc}</span></div>
              </div>
            </div>
          </div>
          <form className="ar-form" onSubmit={submitForm}>
            <input placeholder={t.cf_name} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
            <input placeholder={t.cf_phone} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} type="tel" />
            <input placeholder={t.cf_biz} value={form.biz} onChange={e=>setForm({...form,biz:e.target.value})} />
            <textarea placeholder={t.cf_msg} value={form.msg} onChange={e=>setForm({...form,msg:e.target.value})} />
            <button type="submit">{t.cf_btn}</button>
          </form>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ar-footer">
        <div className="ar-footer-logo">Aqua<b>Run</b></div>
        <p>{t.ft_copy}</p>
        <div className="ar-footer-links">
          <a href="/login">{t.ft_login}</a>
          <a href="https://wa.me/923237919338" target="_blank" rel="noopener">{t.ft_wa}</a>
          <a href="mailto:mian.tanzeel62@gmail.com">{t.ft_email}</a>
        </div>
      </footer>
    </div>
  );
}
