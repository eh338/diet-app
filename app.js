/* ============ 吃多少 · 饮食记录（本地优先 PWA） ============ */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const LS = 'diet.v3';
const MEALS = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '加餐']];
const MEAL_NAME = Object.fromEntries(MEALS);
const CN = { kcal: '热量', pro: '蛋白质', fat: '脂肪', carb: '碳水', fib: '膳食纤维', na: '钠', k: '钾' };
const round = (n, d = 0) => { const p = Math.pow(10, d); return Math.round((+n || 0) * p) / p; };
const r10 = n => Math.round((+n || 0) / 10) * 10;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad2 = n => (n < 10 ? '0' + n : '' + n);
const iso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const todayISO = () => iso(new Date());
const parseISO = s => { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const fmtDate = s => { const d = parseISO(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[d.getDay()]; };

/* ---------------- 数据来源登记 ---------------- */
const SRC = {
  CT: {
    tag: '成分表', name: '中国食物成分表（第 6 版）', ver: '2018/2019 标准版，公开整理值，手工录入',
    url: 'https://www.chinanutri.cn/', lic: '公开出版物，本项目仅作非商业性参考整理',
    note: '口径：每 100g 可食部；生重/熟重按条目状态标注', grade: 'A'
  },
  USD: {
    tag: 'USDA', name: 'USDA FoodData Central', ver: 'SR Legacy / Foundation，检索于 2026-11-05',
    url: 'https://fdc.nal.usda.gov/', lic: '美国联邦政府作品，公共领域（CC0）',
    note: '口径：每 100g，多为生重；部分条目为熟制', grade: 'A'
  },
  OFF: {
    tag: '开源库', name: 'Open Food Facts', ver: '扫码实时查询（2026-11）',
    url: 'https://world.openfoodfacts.org/', lic: '数据库 ODbL 1.0，图片 CC-BY-SA',
    note: '社区用户众包数据，条目准确度参差，建议与包装标签核对', grade: 'C'
  },
  USR: {
    tag: '自建', name: '用户自建 · 手动录入', ver: '本机保存，未经验证',
    url: '', lic: '仅存于本机', note: '依据包装营养成分表填写，请以实物标签为准', grade: 'B'
  },
  EST: {
    tag: '估算', name: '家常菜估算值', ver: '本项目按常见配比推算',
    url: '', lic: '估算，非实测', note: '按“常见配料 + 食用油”推算，误差可能 20%+，建议拆食材记录', grade: 'D'
  }
};

/* ---------------- 文献库（均已用 PubMed 核对，2026-11-05） ---------------- */
const CITES = {
  mifflin: {
    st: '原始研究', claim: 'Mifflin-St Jeor 公式用于估算静息能量消耗（REE）',
    authors: 'Mifflin MD, St Jeor ST, Hill LA, et al.', year: 1990,
    journal: 'Am J Clin Nutr 51(2):241-247', title: 'A new predictive equation for resting energy expenditure in healthy individuals',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
    pop: '健康成年人（n≈498，以白人为主）', lim: '个体误差常达 ±10–15%；体脂极高/极低、甲状腺疾病等会偏离'
  },
  roza: {
    st: '原始研究', claim: 'Harris-Benedict 修订版（Roza & Shizgal 1984）可作历史对照',
    authors: 'Roza AM, Shizgal HM', year: 1984, journal: 'Am J Clin Nutr 40(1):168-182',
    title: 'The Harris Benedict equation reevaluated: resting energy requirements and the body cell mass',
    url: 'https://pubmed.ncbi.nlm.nih.gov/6741850/',
    pop: '成年人（含住院患者样本）', lim: '老公式，对现代人群常高估约 5–15%，仅作对照'
  },
  cunningham: {
    st: '原始研究', claim: 'Cunningham 公式按去脂体重估算 REE，更适合肌肉量大的人',
    authors: 'Cunningham JJ', year: 1980, journal: 'Am J Clin Nutr 33(11):2372-2374',
    title: 'A reanalysis of the factors influencing basal metabolic rate in normal adults',
    url: 'https://pubmed.ncbi.nlm.nih.gov/7435418/',
    pop: '成年人，含运动人群', lim: '需准确体脂率；体脂测量误差会直接放大到结果'
  },
  katch: {
    st: '降级·教材公式', claim: 'Katch-McArdle 公式（370 + 21.6 × 去脂体重）',
    authors: 'Katch FI, McArdle WD（运动生理学教材）', year: 1996, journal: 'Exercise Physiology（教材公式）',
    title: 'Katch-McArdle 去脂体重公式', url: '',
    pop: '体脂率已知、肌肉量较大者', lim: '教材公式，本项目未找到可核验的原始同行评议文献，仅作参照'
  },
  issn: {
    st: '立场声明', claim: '运动人群蛋白摄入 1.4–2.0 g/kg/天可满足多数需求',
    authors: 'Jäger R, Kerksick CM, Campbell BI, et al.', year: 2017, journal: 'J Int Soc Sports Nutr 14:20',
    title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
    pop: '有运动习惯的健康成年人', lim: '非肾病等人群；总热量不足时提高蛋白也不能阻止掉体重'
  },
  helmsPrep: {
    st: '专家综述', claim: '减脂保肌期蛋白可提高到 2.3–3.1 g/kg 去脂体重',
    authors: 'Helms ER, Aragon AA, Fitschen PJ', year: 2014, journal: 'J Int Soc Sports Nutr 11:20',
    title: 'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation',
    url: 'https://pubmed.ncbi.nlm.nih.gov/24864135/',
    pop: '自然健美备赛者，低体脂、训练量大', lim: '样本与场景特殊，普通减脂者不必照搬上限'
  },
  helmsCR: {
    st: '系统综述', claim: '热量限制期间较高蛋白有助于保留瘦体重',
    authors: 'Helms ER, Zinn C, Rowlands DS, et al.', year: 2014, journal: 'Int J Sport Nutr Exerc Metab 24(2):127-138',
    title: 'A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes',
    url: 'https://pubmed.ncbi.nlm.nih.gov/24092765/',
    pop: '有力量训练的瘦体重运动员', lim: '观察性证据为主，普通人证据强度更低'
  },
  morton: {
    st: 'meta 分析', claim: '抗阻训练人群蛋白收益在约 1.6 g/kg/天趋于平台',
    authors: 'Morton RW, Murphy KT, McKellar SR, et al.', year: 2018, journal: 'Br J Sports Med 52(6):376-384',
    title: 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    pop: '健康成年人抗阻训练者（49 项 RCT）', lim: '终点为瘦体重/力量，长期健康结局未覆盖'
  },
  ainsworth: {
    st: '权威标准', claim: '运动 MET 值取自 2011 版体力活动能量消耗汇编',
    authors: 'Ainsworth BE, Haskell WL, Herrmann SD, et al.', year: 2011, journal: 'Med Sci Sports Exerc 43(8):1575-1581',
    title: '2011 Compendium of Physical Activities: a second update of codes and MET values',
    url: 'https://pubmed.ncbi.nlm.nih.gov/21681120/',
    pop: '成年人群体平均值', lim: 'MET 是人群平均值，个体效率差异可达 ±20%；不含事后过量氧耗'
  },
  wishnofsky: {
    st: '历史估算', claim: '约 7700 kcal 对应 1 kg 体重变化（用于趋势反推）',
    authors: 'Wishnofsky M', year: 1958, journal: 'Am J Clin Nutr 6(5):542-546',
    title: 'Caloric equivalents of gained or lost weight',
    url: 'https://pubmed.ncbi.nlm.nih.gov/13594881/',
    pop: '以脂肪组织为主的体重变化', lim: '早期估算；实际减重含水分与瘦体重，短期波动大，仅用于中长期反推'
  },
  levine: {
    st: '综述', claim: 'NEAT（非运动性活动产热）个体差异大，步数可单独估算',
    authors: 'Levine JA', year: 2004, journal: 'Am J Physiol Endocrinol Metab 286(5):E675-E685',
    title: 'Nonexercise activity thermogenesis (NEAT): environment and biology',
    url: 'https://pubmed.ncbi.nlm.nih.gov/15102614/',
    pop: '久坐与活动人群', lim: '步数折算为 gross 消耗的系数是粗略近似，未考虑步速/地形/体重分布'
  },
  hall: {
    st: '建模研究', claim: '能量缺口与体重变化非线性，TDEE 会随体重下降而下降',
    authors: 'Hall KD', year: 2008, journal: 'Int J Obes 32(4):573-576',
    title: 'What is the required energy deficit per unit weight loss?',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17848938/',
    pop: '成年人能量平衡模型', lim: '模型估算，个体适应性产热差异未被完全刻画'
  },
  pontzer: {
    st: '观察性研究', claim: '总能量消耗受“约束模型”影响，运动增加未必等量增加总消耗',
    authors: 'Pontzer H, Durazo-Arvizu R, Dugas LR, et al.', year: 2016, journal: 'Curr Biol 26(3):410-417',
    title: 'Constrained Total Energy Expenditure and Metabolic Adaptation to Physical Activity in Adult Humans',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26832439/',
    pop: '成年人（含双标水数据）', lim: '解释能量消耗上限，提示不能简单线性叠加运动消耗'
  },
  dlw: {
    st: '方法学·大样本', claim: '双标水法（DLW）是能量消耗测量的金标准，可据此建立预测方程',
    authors: 'Bajunaid R, Niu C, et al.', year: 2025, journal: 'Nat Food',
    title: 'Predictive equation derived from 6,497 doubly labelled water measurements enables ...',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39806218/',
    pop: '6,497 份双标水测量，多人群', lim: '网页应用无法做 DLW；本应用用“公式 + 体重趋势”替代，精度目标是接近而非等同'
  },
  whoSodium: {
    st: '指南', claim: '成人每日钠摄入 <2000 mg（≈ 食盐 5 g）',
    authors: 'World Health Organization', year: 2012, journal: 'WHO Guideline',
    title: 'Guideline: Sodium intake for adults and children',
    url: 'https://www.who.int/publications/i/item/9789241504836',
    pop: '成人及儿童（按能量折算）', lim: '高温作业/大量出汗人群需求更高，不应一味压低'
  },
  whoPotassium: {
    st: '指南', claim: '成人每日钾摄入 ≥3510 mg，有助于降低血压',
    authors: 'World Health Organization', year: 2012, journal: 'WHO Guideline',
    title: 'Guideline: Potassium intake for adults and children',
    url: 'https://www.who.int/publications/i/item/9789241504829',
    pop: '成人', lim: '肾功能不全者需限钾，必须先咨询医生'
  },
  whoSugar: {
    st: '指南', claim: '添加糖应 <10% 总能量，最好 <5%',
    authors: 'World Health Organization', year: 2015, journal: 'WHO Guideline',
    title: 'Guideline: Sugars intake for adults and children',
    url: 'https://www.who.int/publications/i/item/9789241549028',
    pop: '成人与儿童', lim: '针对游离糖，不适用于完整水果中的糖'
  },
  cns: {
    st: '指南', claim: '中国居民膳食指南（2022）：食盐 <5 g/天，食物多样、少油',
    authors: '中国营养学会', year: 2022, journal: '人民卫生出版社',
    title: '中国居民膳食指南（2022）',
    url: 'http://dg.cnsoc.org/',
    pop: '中国健康成年人', lim: '面向大众，未针对个体运动量/疾病状态细分'
  },
  acsm: {
    st: '立场声明', claim: '减重需饮食+运动结合，运动量应逐步增加并长期维持',
    authors: 'Donnelly JE, Blair SN, Jakicic JM, et al.', year: 2009, journal: 'Med Sci Sports Exerc 41(2):459-471',
    title: 'American College of Sports Medicine Position Stand. Appropriate physical activity intervention strategies for weight loss and prevention of weight regain for adults',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19127177/',
    pop: '超重/肥胖成年人', lim: '运动减重幅度通常小于饮食控制；个体依从性差异大'
  },
  consensus: {
    st: '共识·未附文献', claim: '通用营养学共识（本应用未找到合适的可核验文献）',
    authors: '—', year: '', journal: '', title: '通用营养学共识', url: '', pop: '一般健康成年人', lim: '无同行评议出处，仅作常识性提示'
  },
  auneGrain: {
    st: 'meta 分析·观察性', claim: '全谷物摄入越多，心血管病、癌症与全因死亡风险越低',
    authors: 'Aune D, Keum N, Giovannucci E, et al.', year: 2016, journal: 'BMJ 353:i2716',
    title: 'Whole grain consumption and risk of cardiovascular disease, cancer, and all cause and cause specific mortality: systematic review and dose-response meta-analysis of prospective studies',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27301975/',
    pop: '成年人群前瞻队列', lim: '观察性证据，不能证明因果；全谷物定义与加工度在各项研究中不一致'
  },
  auneFV: {
    st: 'meta 分析·观察性', claim: '蔬果摄入量越高，心血管病、癌症与全因死亡风险越低',
    authors: 'Aune D, Giovannucci E, Boffetta P, et al.', year: 2017, journal: 'Int J Epidemiol 46(3):1029-1056',
    title: 'Fruit and vegetable intake and the risk of cardiovascular disease, total cancer and all-cause mortality—a systematic review and dose-response meta-analysis of prospective studies',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28338764/',
    pop: '成年人群前瞻队列', lim: '观察性证据；收益在约 800 g/天附近趋于平台，个体差异大'
  },
  auneNuts: {
    st: 'meta 分析·观察性', claim: '坚果摄入与心血管病、癌症及全因死亡风险下降相关',
    authors: 'Aune D, Keum N, Giovannucci E, et al.', year: 2016, journal: 'BMC Med 14(1):323',
    title: 'Nut consumption and risk of cardiovascular disease, total cancer, all-cause and cause-specific mortality: a systematic review and dose-response meta-analysis of prospective studies',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27916000/',
    pop: '成年人群前瞻队列', lim: '观察性证据；坚果热量密度高，需控制份量（10–20 g/天）'
  },
  zargarzadeh: {
    st: 'meta 分析·观察性', claim: '豆类摄入与全因死亡及部分病因死亡风险下降相关',
    authors: 'Zargarzadeh N, Mousavi SM, Santos HO, et al.', year: 2023, journal: 'Adv Nutr 14(2):238-252',
    title: 'Legume Consumption and Risk of All-Cause and Cause-Specific Mortality: A Systematic Review and Dose-Response Meta-Analysis of Prospective Studies',
    url: 'https://pubmed.ncbi.nlm.nih.gov/36811595/',
    pop: '成年人群前瞻队列', lim: '观察性证据；豆类种类与加工方式差异大'
  },
  schoenfeld2018: {
    st: '综述·基于 RCT', claim: '每餐约 0.4 g/kg 体重的蛋白（约 2.5 g 亮氨酸）较利于肌肉合成，总量仍是首位',
    authors: 'Schoenfeld BJ, Aragon AA', year: 2018, journal: 'J Int Soc Sports Nutr 15:10',
    title: 'How much protein can the body use in a single meal for muscle-building? Implications for daily protein distribution',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29497353/',
    pop: '有抗阻训练的健康成年人', lim: '叙述性综述，不是 RCT 直接验证“每餐上限”；老年人可能需要更高'
  },
  issnTiming: {
    st: '立场声明', claim: '训练前后摄入蛋白与碳水有益，但“30 分钟黄金窗口”被夸大，全天总量更重要',
    authors: 'Kerksick CM, Arent S, Schoenfeld BJ, et al.', year: 2017, journal: 'J Int Soc Sports Nutr 14:33',
    title: 'International society of sports nutrition position stand: nutrient timing',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28919842/',
    pop: '有运动习惯的健康成年人', lim: '立场声明综合多项研究；对普通健身者的额外收益有限'
  },
  leucine: {
    st: 'RCT·小样本', claim: '低蛋白饮品中补充亮氨酸可提高肌原纤维蛋白合成',
    authors: 'Churchward-Venne TA, Breen L, Di Donato DM, et al.', year: 2014, journal: 'Am J Clin Nutr 99(2):276-286',
    title: 'Leucine supplementation of a low-protein mixed macronutrient beverage enhances myofibrillar protein synthesis in young men: a double-blind, randomized trial',
    url: 'https://pubmed.ncbi.nlm.nih.gov/24284442/',
    pop: '年轻男性，小样本', lim: '样本小、终点是合成率而非长期肌肉量；不能据此推导“必须每餐 2.5 g 亮氨酸”'
  },
  whoSatFat: {
    st: '指南', claim: '以不饱和脂肪替代饱和脂肪、反式脂肪供能 <1%',
    authors: 'World Health Organization', year: 2023, journal: 'WHO Guideline',
    title: 'Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline',
    url: 'https://www.who.int/publications/i/item/9789240073630',
    pop: '成人与儿童', lim: '面向人群政策，个体执行需结合总能量与烹饪习惯'
  },
  iarc: {
    st: '权威分类·观察性', claim: '加工肉制品列为 1 类致癌物（结直肠癌），红肉列为 2A',
    authors: 'Bouvard V, Loomis D, Guyton KZ, et al.（IARC Monograph Working Group）', year: 2015, journal: 'Lancet Oncol 16(16):1599-1600',
    title: 'Carcinogenicity of consumption of red and processed meat',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26514947/',
    pop: '一般人群', lim: '危害识别基于观察性研究；风险是相对值，绝对风险增加不大，但方向明确'
  },
  keytel: {
    st: '验证研究', claim: '用心率与年龄/性别/体重估算次最大强度运动能量消耗',
    authors: 'Keytel LR, Goedecke JH, Noakes TD, et al.', year: 2005, journal: 'J Sports Sci 23(3):169-177',
    title: 'Prediction of energy expenditure from heart rate monitoring during submaximal exercise',
    url: 'https://pubmed.ncbi.nlm.nih.gov/15966347/',
    pop: '成年人，次最大强度有氧运动', lim: '样本有限、以实验室稳态运动为主；心率受情绪/咖啡因/温度影响，间歇训练误差更大'
  },
  laForgia: {
    st: '综述', claim: 'EPOC（运动后过量氧耗）通常只占运动本身消耗的很小一部分',
    authors: 'LaForgia J, Withers RT, Gore CJ', year: 2006, journal: 'J Sports Sci 24(12):1247-1264',
    title: 'Effects of exercise intensity and duration on the excess post-exercise oxygen consumption',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17101527/',
    pop: '实验室运动试验', lim: '不同强度/时长差异大；常见量级约为运动消耗的 6–15%，不应据此夸大总消耗'
  },
  shcherbina: {
    st: '验证研究', claim: '腕戴设备与 App 的热量估算误差大，设备之间差异明显',
    authors: 'Shcherbina A, Mattsson CM, Waggott D, et al.', year: 2017, journal: 'J Pers Med 7(2):11',
    title: 'Accuracy in Wrist-Worn, Sensor-Based Measurements of Heart Rate and Energy Expenditure in a Diverse Cohort',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28538708/',
    pop: '多人群样本，与间接测热/运动设备对照', lim: '以有氧运动为主；力量训练与间歇训练的设备误差通常更大'
  }
};

/* ---------------- 状态 ---------------- */
function defaultState() {
  return {
    profile: {
      sex: 'male', age: 28, height: 175, weight: 75, bf: '',
      activity: 'light', steps: 8000, mode: 'cut', deficit: 15, surplus: 10,
      proteinPerKg: 1.8, bp: 'normal', sweat: 'no', goalWeight: '',
      tdeeMode: 'separate', diet: { noPork: false, noBeef: false, noOffal: false, noLactose: false, noSeafood: false, vegetarian: false }
    },
    entries: [], weights: [], ex: [], edema: [], waist: [], lift: [],
    custom: [], fav: [], recents: [],
    settings: { calWin: 14, srcFilter: 'all', naLimit: '' },
    created: new Date().toISOString()
  };
}
let state = load();
let S = { tab: 'today', date: todayISO(), meal: 'lunch', q: '', srcFilter: 'all', cat: '全部', trendWin: 7, histFood: '', detailDate: '', screen: '', evStrong: false, exCalc: null, planMeal: '', planId: '' };

function load() {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    s.profile = Object.assign(d.profile, s.profile || {});
    s.settings = Object.assign(d.settings, s.settings || {});
    s.entries = s.entries || []; s.ex = s.ex || [];
    s.edema = s.edema || []; s.custom = s.custom || [];
    s.fav = s.fav || []; s.recents = s.recents || []; s.waist = s.waist || []; s.lift = s.lift || [];
    s.profile.diet = Object.assign({ noPork: false, noBeef: false, noOffal: false, noLactose: false, noSeafood: false, vegetarian: false }, s.profile.diet || {});
    s.weights = (s.weights || []).map(w => w.t ? w : { id: w.id || uid(), d: w.d, t: 'am', kg: w.kg, ts: w.ts || Date.parse(w.d) || Date.now() });
    return s;
  } catch (e) { return defaultState(); }
}
function save() {
  try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { toast('保存失败：本机存储可能已满，请先导出备份'); }
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------------- 食物库 ---------------- */
const DISH_AS_FOOD = (DISHES || []).map(d => {
  const pg = d.pg || 100, x = d.per;
  const per100 = k => round(x[k] * 100 / pg, 2);
  return {
    n: d.n, a: d.a || [], cat: '家常菜', ed: 100, st: '熟', src: 'EST',
    kcal: per100('kcal'), pro: per100('pro'), fat: per100('fat'), carb: per100('carb'),
    fib: per100('fib'), na: per100('na'), k: per100('k'),
    py: d.py, pf: d.pf, dish: d, pg, pl: d.pl
  };
});
let DB = [];
function rebuildDB() {
  DB = (typeof FOODS !== 'undefined' ? FOODS : []).concat(DISH_AS_FOOD, state.custom.map(c => Object.assign({ cat: '自建', st: '生', src: 'USR' }, c)));
}
rebuildDB();
const foodByName = n => DB.find(f => f.n === n) || { n, pro: 0, kcal: 0 };
const norm = s => String(s || '').toLowerCase().replace(/[()（）\s·・]/g, '');

function searchFoods(q, filter) {
  q = norm(q);
  let list = DB.filter(f => !filter || filter === 'all' || (f.src === filter));
  if (!q) return list;
  const scored = [];
  for (const f of list) {
    const names = [f.n].concat(f.a || []).map(norm);
    const py = norm(f.py || '').split('|').filter(Boolean);
    const pf = norm(f.pf || '').split('|').filter(Boolean);
    let sc = 0;
    if (names.some(x => x === q)) sc = 100;
    else if (names.some(x => x.startsWith(q))) sc = 80;
    else if (names.some(x => x.includes(q))) sc = 60;
    else if (py.some(x => x.startsWith(q))) sc = 55;
    else if (pf.some(x => x.startsWith(q))) sc = 45;
    else if (py.some(x => x.includes(q)) || pf.some(x => x.includes(q))) sc = 30;
    if (sc) scored.push([sc, f]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].n.length - b[1].n.length);
  return scored.map(x => x[1]);
}

/* ---------------- 单日汇总（缓存） ---------------- */
const dayCache = new Map();
function clearDay(date) { dayCache.delete(date); }
function daySummary(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  const es = state.entries.filter(e => e.d === date);
  const s = { entries: es, kcal: 0, pro: 0, fat: 0, carb: 0, fib: 0, na: 0, k: 0 };
  for (const e of es) {
    const r = e.g / 100;
    s.kcal += e.base.kcal * r; s.pro += e.base.pro * r; s.fat += e.base.fat * r;
    s.carb += e.base.carb * r; s.fib += e.base.fib * r; s.na += e.base.na * r; s.k += (e.base.k || 0) * r;
  }
  ['kcal', 'pro', 'fat', 'carb', 'fib', 'na', 'k'].forEach(k => s[k] = round(s[k], 1));
  dayCache.set(date, s);
  return s;
}
function mealSummary(date, meal) {
  const es = state.entries.filter(e => e.d === date && e.m === meal);
  const s = { kcal: 0, pro: 0, n: es.length };
  es.forEach(e => { s.kcal += e.base.kcal * e.g / 100; s.pro += e.base.pro * e.g / 100; });
  s.kcal = Math.round(s.kcal); s.pro = round(s.pro, 1);
  return s;
}

/* ---------------- 体力活动 / 步数 ---------------- */
const ACT = {
  sedentary: { n: '久坐（办公/少走动）', f: 1.2, fs: 1.2, steps: 4000 },
  light: { n: '轻度（每周 1–3 次轻运动）', f: 1.375, fs: 1.25, steps: 7000 },
  moderate: { n: '中度（每周 3–5 次运动）', f: 1.55, fs: 1.3, steps: 10000 },
  high: { n: '高强度（每周 6–7 次）', f: 1.725, fs: 1.4, steps: 13000 },
  vhigh: { n: '极高（体力工作/一天两练）', f: 1.9, fs: 1.5, steps: 16000 }
};
function actFactor() {
  const a = ACT[state.profile.activity] || ACT.light;
  return state.profile.tdeeMode === 'combined' ? a.f : a.fs;
}
const METS = [
  { id: 'strength', n: '力量训练（中等）', met: 5.0, r: '3.5–6.0' },
  { id: 'run', n: '跑步（8 km/h）', met: 8.3, r: '8.3' },
  { id: 'walk', n: '快走（5.6 km/h）', met: 4.3, r: '4.3' },
  { id: 'bike', n: '骑车（16–19 km/h）', met: 6.8, r: '6.8' },
  { id: 'swim', n: '游泳（自由泳中速）', met: 8.0, r: '8.0' },
  { id: 'rope', n: '跳绳（中速）', met: 11.0, r: '8.8–12.3' },
  { id: 'hiit', n: 'HIIT / 循环训练', met: 8.0, r: '6.0–10.0' },
  { id: 'yoga', n: '瑜伽 / 拉伸', met: 2.5, r: '2.3–3.0' },
  { id: 'elliptical', n: '椭圆机', met: 5.0, r: '5.0' },
  { id: 'basketball', n: '篮球', met: 6.5, r: '6.5' },
  { id: 'badminton', n: '羽毛球', met: 5.5, r: '5.5' },
  { id: 'stairs', n: '爬楼梯', met: 8.0, r: '8.0' },
  { id: 'row', n: '划船机（中等）', met: 7.0, r: '7.0' }
];

/* ---------------- 能量模型 ---------------- */
function bmrCalc(p) {
  const w = +p.weight || 0, h = +p.height || 0, a = +p.age || 0;
  const mif = p.sex === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const har = p.sex === 'male'
    ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * a
    : 447.593 + 9.247 * w + 3.098 * h - 4.33 * a;
  const bf = p.bf === '' || p.bf == null ? null : +p.bf;
  const lbm = bf ? w * (1 - bf / 100) : null;
  const cun = lbm ? 500 + 22 * lbm : null;
  const kat = lbm ? 370 + 21.6 * lbm : null;
  return { mif: Math.round(mif), har: Math.round(har), cun: cun && Math.round(cun), kat: kat && Math.round(kat), lbm: lbm && round(lbm, 1), rec: lbm ? 'cun' : 'mif' };
}
function baseTDEE() {
  const p = state.profile, bb = bmrCalc(p);
  return bb[bb.rec] || bb.mif;
}
function avgExercise(days = 14, end = todayISO()) {
  let total = 0;
  for (let i = 0; i < days; i++) total += exKcal(addDays(end, -i));
  return total / days;
}
function exKcal(date) {
  const kg = +state.profile.weight || 0;
  return state.ex.filter(x => x.d === date).reduce((a, x) => {
    if (x.kcal != null) return a + x.kcal;
    const m = METS.find(t => t.id === x.type) || (typeof EXLIB !== 'undefined' && EXLIB.find(t => t.id === x.type));
    return a + (m ? m.met : 5) * kg * (x.min / 60);
  }, 0);
}
function stepsAdj(bb) {
  const p = state.profile, a = ACT[p.activity] || ACT.light;
  const steps = +p.steps || 0;
  const base = a.steps;
  return (steps - base) * (+p.weight || 0) * 0.00045;
}
function energyDetail(date) {
  const p = state.profile, bb = bmrCalc(p), bmr = bb[bb.rec] || bb.mif;
  const a = ACT[p.activity] || ACT.light;
  const separate = p.tdeeMode !== 'combined';
  const neatBase = bmr * (actFactor() - 1);
  const sAdj = stepsAdj();
  const neat = neatBase + sAdj;
  const intake = daySummary(date).kcal;
  const ex = separate ? exKcal(date) : 0;
  const exRaw = exKcal(date);
  const tefLow = intake * 0.09, tef = intake * 0.10, tefHigh = intake * 0.12;
  const total = bmr + neat + ex + tef;
  return { bmr, bb, neatBase, sAdj, neat, ex, exRaw, separate, intake, tef, tefLow, tefHigh, total, factor: actFactor() };
}

/* ---------------- 校准 ---------------- */
function calibration(win) {
  win = win || state.settings.calWin || 14;
  const end = todayISO(), start = addDays(end, -(win - 1));
  let logged = 0, intake = 0;
  for (let i = 0; i < win; i++) {
    const d = addDays(start, i), s = daySummary(d);
    if (s.entries.length) { logged++; intake += s.kcal; }
  }
  const ws = state.weights.filter(w => w.d >= start && w.d <= end).sort((a, b) => a.d < b.d ? -1 : 1);
  const base = { win, logged, need: Math.max(0, win - logged), avgIntake: logged ? Math.round(intake / logged) : 0 };
  if (ws.length < 2) return Object.assign(base, { ok: false, reason: '体重记录不足 2 次' });
  const span = diffDays(ws[0].d, ws[ws.length - 1].d);
  const delta = ws[0].kg - ws[ws.length - 1].kg;
  const coverage = logged / win;
  if (logged < 10 || coverage < 0.6) return Object.assign(base, { ok: false, reason: '记录天数不足（至少 10 天且覆盖率 ≥60%）' });
  if (span < 7) return Object.assign(base, { ok: false, reason: '体重记录跨度不足 7 天' });
  const reverse = base.avgIntake + delta * 7700 / span;
  const pctWeek = base.avgIntake ? (delta / (ws[0].kg || 1)) / span * 7 * 100 : 0;
  const conf = coverage >= 0.85 && span >= win * 0.8 && Math.abs(pctWeek) < 1.5 ? 'high' : (coverage >= 0.7 ? 'mid' : 'low');
  return Object.assign(base, {
    ok: true, span, delta: round(delta, 2), reverse: r10(reverse), coverage: round(coverage * 100, 0),
    conf, pctWeek: round(pctWeek, 2)
  });
}
function maintenanceEstimate() {
  const cal = calibration(state.settings.calWin);
  const formula = baseTDEE() * actFactor() + (state.profile.tdeeMode === 'combined' ? 0 : avgExercise());
  const manual = +state.profile.tdeeBase;
  if (manual > 0) return { value: r10(manual), formula: r10(formula), calibrated: true, manual: true, cal, low: r10(manual * 0.96), high: r10(manual * 1.04), spread: Math.round(manual * 0.04), reverse: cal.ok ? cal.reverse : null };
  if (!cal.ok) return { value: r10(formula), formula: r10(formula), calibrated: false, cal, low: r10(formula * 0.88), high: r10(formula * 1.12) };
  const blended = 0.6 * cal.reverse + 0.4 * formula;
  const spread = Math.max(100, Math.abs(cal.reverse - formula) * 0.3, blended * 0.04);
  return { value: r10(blended), formula: r10(formula), reverse: cal.reverse, calibrated: true, cal, low: r10(blended - spread), high: r10(blended + spread), spread: Math.round(spread) };
}

/* ---------------- 目标 ---------------- */
function targets() {
  const p = state.profile, bb = bmrCalc(p), bmr = bb[bb.rec] || bb.mif, w = +p.weight || 0;
  const m = maintenanceEstimate();
  const mode = p.mode;
  const warnings = [];
  let kcal, deficitPct = 0;
  if (mode === 'cut') {
    deficitPct = clamp(+p.deficit || 15, 0, 30);
    kcal = m.value * (1 - deficitPct / 100);
    if (kcal < bmr) { warnings.push('该缺口会使热量低于基础代谢（' + bmr + ' kcal），已拒绝应用，改为不低于基础代谢的下限'); kcal = bmr; }
    if (deficitPct > 25) warnings.push('缺口超过 25% 难以长期坚持，且更易掉肌肉');
  } else if (mode === 'bulk') {
    kcal = m.value * (1 + clamp(+p.surplus || 10, 0, 20) / 100);
  } else {
    kcal = m.value;
  }
  kcal = r10(kcal);
  let pRange;
  if (mode === 'cut') pRange = [1.6, 2.2];
  else if (mode === 'bulk') pRange = [1.6, 2.0];
  else pRange = [1.2, 1.8];
  let pkg = clamp(+p.proteinPerKg || 1.8, pRange[0], pRange[1]);
  const pro = Math.round(pkg * w);
  const proLow = Math.round(pRange[0] * w), proHigh = Math.round(pRange[1] * w);
  const fatPct = mode === 'bulk' ? [22, 32] : [20, 30];
  const fat = Math.round(kcal * (fatPct[0] + fatPct[1]) / 2 / 100 / 9);
  const fatLow = Math.round(kcal * fatPct[0] / 100 / 9), fatHigh = Math.round(kcal * fatPct[1] / 100 / 9);
  const carb = Math.max(0, Math.round((kcal - pro * 4 - fat * 9) / 4));
  const carbLow = Math.max(0, Math.round((kcal - proHigh * 4 - fatHigh * 9) / 4));
  const carbHigh = Math.max(0, Math.round((kcal - proLow * 4 - fatLow * 9) / 4));
  let rate = null;
  if (mode === 'cut') rate = { low: round(w * 0.005, 1), high: round(w * 0.01, 1), txt: '每周减 ' + round(w * 0.005, 1) + '–' + round(w * 0.01, 1) + ' kg（体重的 0.5%–1%）' };
  if (mode === 'bulk') rate = { low: round(w * 0.0025, 1), high: round(w * 0.005, 1), txt: '每周增 ' + round(w * 0.0025, 2) + '–' + round(w * 0.005, 1) + ' kg（体重的 0.25%–0.5%）' };
  return { bmr, mode, kcal, protein: pro, proLow, proHigh, fat, fatLow, fatHigh, carb, carbLow, carbHigh, proteinPerKg: pkg, pRange, rate, m, warnings, deficitPct };
}

/* ---------------- 钠钾 ---------------- */
function naPlan() {
  const p = state.profile;
  let limit = 2000, note = 'WHO 与中国居民膳食指南：成人钠 <2000 mg（食盐 <5 g/天）', level = 'default';
  if (p.bp === 'high') { limit = 1500; level = 'strict'; note = '自报血压偏高：采用更严格的 1500 mg 上限，并建议就医随访'; }
  if (p.sweat === 'yes' || String(p.activity) === 'vhigh' || String(p.activity) === 'high') {
    if (level !== 'strict') { limit = 2500; level = 'sweat'; }
    note = '大量出汗/高活动量：上限放宽到 ' + limit + ' mg，出汗后只补水不补钠有低钠风险，不要压到最低';
  }
  const custom = state.settings.naLimit ? +state.settings.naLimit : 0;
  let rejected = '';
  if (custom && custom < 1000) { rejected = '低于 1000 mg/天的长期限钠方案被拒绝：有低钠血症风险（尤其大量出汗），除医生指导外不建议'; }
  else if (custom) { limit = custom; note = '使用自定义上限 ' + custom + ' mg'; }
  return { limit, k: 3510, note, level, rejected, ratioOk: 1.0 };
}
function naFoods(date) {
  return daySummary(date).entries.map(e => ({ n: e.n, na: round(e.base.na * e.g / 100, 0), g: e.g }))
    .filter(x => x.na > 0).sort((a, b) => b.na - a.na).slice(0, 4);
}

/* ---------------- 通用推荐换算 ---------------- */
function proteinEquiv(gap) {
  const ch = foodByName('鸡胸肉'), egg = foodByName('鸡蛋'), milk = foodByName('全脂牛奶');
  return {
    chG: Math.max(0, Math.round(gap / (ch.pro / 100) / 10) * 10),
    eggN: Math.max(1, Math.ceil(gap / (egg.pro * 0.88 * 0.5))),
    milkMl: Math.max(50, Math.round(gap / (milk.pro / 100) / 50) * 50)
  };
}

/* 已与 USDA 交叉核对过的条目（kcal/蛋白/脂肪/碳水，每 100g） */
const ALT = {
  '鸡胸肉': { kcal: 120, pro: 22.5, fat: 2.6, carb: 0, id: 171077, note: 'USDA SR Legacy 生鸡胸（去皮）' },
  '鸡蛋': { kcal: 143, pro: 12.6, fat: 9.5, carb: 0.7, id: 171287, note: 'USDA 全蛋（生）' },
  '全脂牛奶': { kcal: 61, pro: 3.2, fat: 3.3, carb: 4.8, id: 746782, note: 'USDA 全脂牛奶 3.25%' },
  '米饭(熟)': { kcal: 130, pro: 2.7, fat: 0.3, carb: 28.2, id: 168878, note: 'USDA 长粒白米（煮熟）' },
  '花生(生)': { kcal: 567, pro: 25.8, fat: 49.2, carb: 16.1, id: 172430, note: 'USDA 生花生仁' },
  '北豆腐': { kcal: 144, pro: 17.3, fat: 8.7, carb: 2.8, id: 172475, note: 'USDA 硬豆腐（硫酸钙）' },
  '燕麦片(干)': { kcal: 379, pro: 13.2, fat: 6.5, carb: 67.7, id: 173904, note: 'USDA 燕麦片（干）' },
  '香蕉': { kcal: 89, pro: 1.1, fat: 0.3, carb: 22.8, id: 173944, note: 'USDA 香蕉（生）' },
  '苹果': { kcal: 52, pro: 0.3, fat: 0.2, carb: 13.8, id: 171688, note: 'USDA 苹果（带皮）' }
};

/* ================= 通用渲染 ================= */
function srcTag(f) {
  const s = SRC[f.src] || SRC.USR;
  return `<span class="tag src-${f.src}">${s.tag}</span>`;
}
function bar(pct, cls) {
  const p = clamp(pct, 0, 100);
  return `<div class="bar"><i class="${cls || ''}" style="width:${p}%"></i></div>`;
}
function macroRow(label, val, target, unit) {
  const pct = target ? val / target * 100 : 0;
  let cls = pct > 105 ? 'over' : (pct < 70 ? 'warn' : '');
  return `<div class="macro"><span class="nm">${label}</span>${bar(pct, cls)}<span class="val"><b>${round(val)}</b>/${target ? Math.round(target) : '—'}${unit}</span></div>`;
}
function naBar(label, val, target, unit) {
  const pct = target ? val / target * 100 : 0;
  return `<div class="macro"><span class="nm">${label}</span>${bar(pct, pct > 100 ? 'over' : '')}<span class="val"><b>${round(val)}</b>/${Math.round(target)}${unit}</span></div>`;
}
function portionPresets(f) {
  const P = {
    '鸡蛋': [['1 个', 50], ['2 个', 100]], '米饭(熟)': [['1 小碗', 100], ['1 碗', 150], ['大碗', 200]],
    '全脂牛奶': [['1 杯', 250]], '香蕉': [['1 根', 120]], '苹果': [['1 个', 200]],
    '白吐司': [['1 片', 35], ['2 片', 70]], '燕麦片(干)': [['1 份 40g', 40], ['1 份 60g', 60]],
    '馒头': [['1 个', 100]], '饺子(猪肉)': [['6 个', 150], ['10 个', 250]],
    '植物油(大豆油)': [['1 勺', 10], ['半勺', 5]], '花生(生)': [['1 小把', 20]],
    '鸡胸肉': [['1 块', 150], ['半块', 75]], '北豆腐': [['半盒', 150]], '士力架': [['1 条', 50]]
  };
  let list = P[f.n] || [];
  if (f.dish) list = [[f.pl || '1 份', f.pg]].concat(list);
  return list;
}
function sourceCard(f) {
  const s = SRC[f.src] || SRC.USR;
  const alt = ALT[f.n];
  let extra = '';
  if (alt) {
    extra = `<div class="src-card" style="background:transparent;padding:9px 0 0;border-top:1px dashed var(--line)">
      <div class="hd"><span class="tag src-USD">交叉参考</span><span class="nm">${alt.note}</span></div>
      <div class="ln">USDA 每 100g：${alt.kcal} kcal / 蛋白 ${alt.pro} / 脂肪 ${alt.fat} / 碳水 ${alt.carb} g · 未采用（采用成分表口径）</div>
      <a href="https://fdc.nal.usda.gov/food-details/${alt.id}/nutrients" target="_blank" rel="noopener">fdc.nal.usda.gov · FDC ${alt.id}</a>
    </div>`;
  }
  return `<div class="src-card">
    <div class="hd"><span class="tag src-${f.src}">${s.tag}</span><span class="nm">${esc(s.name)}</span></div>
    <div class="ln">版本：${esc(s.ver)}</div>
    <div class="ln">许可：${esc(s.lic)}</div>
    <div class="ln">口径：${esc(s.note)}</div>
    <div class="ln">可食部 ${f.ed == null ? 100 : f.ed}% · 状态：${esc(f.st || '生')}</div>
    ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.url}</a>` : ''}
    ${extra}
  </div>`;
}

/* ================= 今天 ================= */
function viewToday() {
  const t = targets(), d = daySummary(S.date), dr = S.date !== todayISO();
  const left = Math.round(t.kcal - d.kcal);
  const mealsHtml = MEALS.map(([m, name]) => {
    const ms = mealSummary(S.date, m);
    const es = d.entries.filter(e => e.m === m);
    return `<div class="card meal">
      <div class="meal-h"><div class="l"><span class="dot"></span><div><h3 class="title-s">${name}</h3>
      <div class="sum">${ms.kcal} kcal · 蛋白 ${round(ms.pro, 1)} g</div></div></div>
      <button class="add-mini" data-act="goAdd" data-meal="${m}" aria-label="加${name}">＋</button></div>
      ${es.length ? es.map(e => entryRow(e)).join('') : `<div class="empty">还没有${name}记录</div>`}
    </div>`;
  }).join('');

  return `
  <div class="top">
    <div><h1>${dr ? '这一天吃了什么' : '今天吃了什么'}</h1>
      <div class="date">${fmtDate(S.date)}${dr ? ' · <button class="link" data-act="today">回到今天</button>' : ''}</div>
    </div>
    <div class="act">
      <button class="icon-btn" data-act="prevDay">‹</button>
      <button class="icon-btn" data-act="nextDay">›</button>
    </div>
  </div>
  <div class="view">
    <div class="card">
      <div class="row"><span class="muted">摄入 / 目标</span><button class="link" data-act="energySheet">消耗明细 ›</button></div>
      <div class="sum-head"><span class="kcal-big">${Math.round(d.kcal)}</span><span class="kcal-of">/ ${t.kcal} kcal</span></div>
      ${bar(d.kcal / t.kcal * 100, d.kcal > t.kcal ? 'over' : '')}
      <div class="row" style="margin-top:6px"><span class="muted">${left > 0 ? '还可吃 ' + left + ' kcal' : '已超出 ' + Math.abs(left) + ' kcal'}</span>
        <span class="muted">${t.mode === 'cut' ? '减脂 -' + t.deficitPct + '%' : t.mode === 'bulk' ? '增肌 +' + state.profile.surplus + '%' : '维持'}</span></div>
      <div style="margin-top:12px">
        ${macroRow('蛋白质', d.pro, t.protein, 'g')}
        ${macroRow('脂肪', d.fat, t.fat, 'g')}
        ${macroRow('碳水', d.carb, t.carb, 'g')}
      </div>
      <div class="mini-bars">
        <div><div class="muted">钠（上限）</div>${naBar('钠', d.na, naPlan().limit, 'mg')}</div>
        <div><div class="muted">钾（目标 ${naPlan().k} mg）</div>${naBar('钾', d.k, naPlan().k, 'mg')}</div>
      </div>
      <div class="row" style="margin-top:8px"><span class="muted">钠钾比 ${d.k ? round(d.na / d.k, 2) : '—'}（越低越好）</span>
        <button class="link" data-act="naSheet">钠钾详情 ›</button></div>
    </div>
    ${t.warnings.length ? `<div class="guard">${t.warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="card" id="todayAdvice">
      <div class="row"><h3 class="title-s">今日提示</h3><span class="muted">按 ${t.kcal} kcal / 蛋白 ${t.protein} g 目标</span></div>
      ${dailyAdvice().slice(0, 3).map(advRow).join('') || '<div class="empty">先记一餐，提示会更具体</div>'}
    </div>
    <div class="card tight">
      <div class="row"><h3 class="title-s">按目标推荐餐单</h3><span class="tag src-CT">证据分级</span></div>
      <div class="muted" style="margin-top:4px">按${t.mode === 'cut' ? '减脂' : t.mode === 'bulk' ? '增肌' : '维持'}目标、今天剩余额度和忌口，给早/午/晚/练前搭配；每套营养由食物库逐项累加。</div>
      <button class="btn sm block" style="margin-top:10px" data-act="plan">生成今天的餐单 ›</button>
    </div>
    ${mealsHtml}
    <div class="card tight">
      <div class="row"><h3 class="title-s">快速添加</h3><button class="link" data-act="goFood">搜索全部 ›</button></div>
      <div class="quick-wrap">${quickChips()}</div>
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn tiny" data-act="addOil">＋ 油 1 勺（10g）</button>
        <button class="btn tiny" data-act="customFood">＋ 自建食物</button>
        <button class="btn tiny" data-act="scan">扫条码</button>
      </div>
    </div>
  </div>`;
}
function entryRow(e) {
  const r = e.g / 100;
  return `<div class="item" data-act="editEntry" data-id="${e.id}">
    <div class="nm"><p>${esc(e.n)} ${e.edited ? '<span class="tag" style="background:var(--warn-soft);color:var(--warn)">已改</span>' : ''}</p>
      <span>${e.g} g · ${SRC[e.src] ? SRC[e.src].tag : ''} · 蛋白 ${round(e.base.pro * r, 1)}g</span></div>
    <div class="kc"><b>${Math.round(e.base.kcal * r)}</b> kcal</div>
  </div>`;
}
function quickChips() {
  const names = (state.fav.length ? state.fav : []).concat(state.recents).slice(0, 8);
  if (!names.length) return '<span class="muted">常吃/最近会出现在这里</span>';
  return names.map(n => `<button class="chip" data-act="quickAdd" data-name="${esc(n)}">${esc(n)}</button>`).join('');
}
function advRow(a) {
  return `<div class="adv ${a.tone ? 'warn' : ''}"><span class="ic">${a.tone ? '!' : '✓'}</span>
    <div class="bd"><p>${a.html || esc(a.text)}</p>
    ${a.cite && a.cite.length ? `<button class="cite" data-act="cite" data-ids="${a.cite.join(',')}">依据：${a.citeLabel || citeLabel(a.cite)} ›</button>` : '<button class="cite" data-act="cite" data-ids="consensus">依据：通用共识 ›</button>'}
    </div></div>`;
}

/* ================= 食物页 ================= */
function viewFood() {
  return `<div class="top"><div><h1>食物库</h1><div class="date">本地 ${DB.length} 条 · 断网可用</div></div>
    <div class="act"><button class="icon-btn" data-act="scan">⌗</button><button class="icon-btn" data-act="customFood">＋</button></div></div>
  <div class="view">
    <div class="search"><div class="search-box">
      <input id="q" type="search" placeholder="搜名称 / 别名 / 拼音首字母（如 jxr）" value="${esc(S.q)}" autocomplete="off">
      <button class="scan" data-act="scan" aria-label="扫码">⌗</button>
    </div></div>
    <div class="chips" id="srcChips">${[['all', '全部来源'], ['CT', '成分表'], ['USD', 'USDA'], ['OFF', '开源库'], ['USR', '自建'], ['EST', '家常菜估算']]
      .map(([k, n]) => `<button class="chip ${S.srcFilter === k ? 'on' : ''}" data-act="setSrc" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="chips" id="catChips">${['全部'].concat(Array.from(new Set(DB.map(f => f.cat))))
      .map(c => `<button class="chip ${S.cat === c ? 'on' : ''}" data-act="setCat" data-v="${c}">${c}</button>`).join('')}</div>
    <div id="resultsWrap">${resultsHtml()}</div>
  </div>`;
}
function resultsHtml() {
  let list = searchFoods(S.q, S.srcFilter);
  if (S.cat !== '全部') list = list.filter(f => f.cat === S.cat);
  if (!list.length) return `<div class="card noresult"><p>没找到「${esc(S.q)}」。别卡住：</p>
    <div class="quick-wrap" style="justify-content:center">
      <button class="btn sm" data-act="customFood">自己建一条</button>
      <button class="btn sm ghost" data-act="scan">扫条码</button>
    </div>
    <p style="margin-top:10px">也可以换拼音首字母试试，例如鸡胸肉 = jxr</p></div>`;
  const show = list.slice(0, 120);
  return `<div class="card tight" style="padding:4px 12px">
    <div class="row" style="padding:6px 0"><span class="muted">共 ${list.length} 条${list.length > 120 ? '，只显示前 120 条' : ''}</span><span class="muted">点击查看来源并添加</span></div>
    <div>${show.map(f => foodRow(f)).join('')}</div>
  </div>
  <div class="muted" style="padding:0 4px 10px">数据均为每 100g 可食部口径；“熟/干/制品”状态会直接影响数值，记录时注意别把熟重当生重。</div>`;
}
function foodRow(f) {
  const p = round(f.pro);
  return `<div class="food-row" data-act="foodDetail" data-name="${esc(f.n)}">
    <div class="nm"><p>${esc(f.n)} ${srcTag(f)} ${f.dish ? '<span class="tag est">估算</span>' : ''}</p>
      <div class="sub">${f.cat} · ${esc(f.st || '生')} · 蛋白 ${p}g</div></div>
    <div class="k"><b>${Math.round(f.kcal)}</b><span>kcal/100g</span></div>
  </div>`;
}

/* ================= 极简 SVG 图表（离线可用） ================= */
function chartSVG(opt) {
  const W = 360, H = opt.height || 150, PL = 34, PR = 8, PT = 10, PB = 20;
  const iw = W - PL - PR, ih = H - PT - PB;
  const all = opt.series.flatMap(s => s.points.map(p => p.y)).filter(v => isFinite(v));
  let lo = opt.min != null ? opt.min : Math.min.apply(null, all);
  let hi = opt.max != null ? opt.max : Math.max.apply(null, all);
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (hi === lo) { hi = lo + 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const x = i => PL + (opt.n <= 1 ? iw / 2 : i / (opt.n - 1) * iw);
  const y = v => PT + ih - (v - lo) / (hi - lo) * ih;
  const paths = opt.series.map(s => {
    const d = s.points.map((p, i) => (i ? 'L' : 'M') + round(x(p.i != null ? p.i : i), 1) + ' ' + round(y(p.y), 1)).join(' ');
    if (s.dots) {
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="4 3"' : ''}/>
      ${s.points.map(p => `<circle cx="${round(x(p.i != null ? p.i : s.points.indexOf(p)), 1)}" cy="${round(y(p.y), 1)}" r="2.2" fill="${s.color}"/>`).join('')}`;
    }
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="4 3"' : ''}/>`;
  }).join('');
  const grid = [0, 0.5, 1].map(t => {
    const v = lo + (hi - lo) * (1 - t), yy = PT + ih * t;
    return `<line x1="${PL}" y1="${round(yy, 1)}" x2="${W - PR}" y2="${round(yy, 1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${PL - 5}" y="${round(yy + 3.5, 1)}" text-anchor="end" font-size="9" fill="var(--sub)">${Math.round(v)}</text>`;
  }).join('');
  const xl = opt.xLabels || [];
  const xlab = xl.map((t, i) => `<text x="${round(x(i), 1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--sub)">${esc(t)}</text>`).join('');
  const target = opt.targetLine != null ? `<line x1="${PL}" y1="${round(y(opt.targetLine), 1)}" x2="${W - PR}" y2="${round(y(opt.targetLine), 1)}" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="5 3"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img">
    ${grid}${target}${paths}${xlab}
  </svg>`;
}
function barSVG(opt) {
  const W = 360, H = opt.height || 150, PL = 34, PR = 8, PT = 10, PB = 20;
  const iw = W - PL - PR, ih = H - PT - PB;
  const hi = Math.max(1, Math.max.apply(null, opt.values.concat(opt.target ? [opt.target] : []))) * 1.1;
  const bw = iw / opt.values.length;
  const bars = opt.values.map((v, i) => {
    const h = Math.max(1, v / hi * ih), x = PL + i * bw + bw * 0.16, w = bw * 0.68;
    return `<rect x="${round(x, 1)}" y="${round(PT + ih - h, 1)}" width="${round(w, 1)}" height="${round(h, 1)}" rx="2.5" fill="var(--brand)" opacity="${v ? 1 : 0.15}"/>`;
  }).join('');
  const tl = opt.target ? `<line x1="${PL}" y1="${round(PT + ih - opt.target / hi * ih, 1)}" x2="${W - PR}" y2="${round(PT + ih - opt.target / hi * ih, 1)}" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="5 3"/>` : '';
  const lab = (opt.xLabels || []).map((t, i) => t ? `<text x="${round(PL + i * bw + bw / 2, 1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--sub)">${esc(t)}</text>` : '').join('');
  const g = [0, 0.5, 1].map(t => {
    const yy = PT + ih * t;
    return `<line x1="${PL}" y1="${round(yy, 1)}" x2="${W - PR}" y2="${round(yy, 1)}" stroke="var(--line)"/>
      <text x="${PL - 5}" y="${round(yy + 3.5, 1)}" text-anchor="end" font-size="9" fill="var(--sub)">${Math.round(hi * (1 - t))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${g}${tl}${bars}${lab}</svg>`;
}

/* ================= 历史 ================= */
function monthGrid(y, m) {
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const lead = first.getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="day blank"></div>');
  for (let dd = 1; dd <= days; dd++) {
    const ds = y + '-' + pad2(m + 1) + '-' + pad2(dd), s = daySummary(ds), t = targets();
    let cls = 'day', v = '';
    if (s.entries.length) {
      const pct = s.kcal / (t.kcal || 1);
      cls += pct > 1.08 ? ' over' : pct >= 0.85 ? ' l3' : pct >= 0.6 ? ' l2' : ' l1';
      v = Math.round(s.kcal);
      if (state.entries.some(e => e.d === ds && e.edited)) cls += ' edit';
    }
    if (ds === S.detailDate) cls += ' on';
    if (ds === todayISO()) cls += ' today';
    cells.push(`<div class="${cls}" data-act="dayDetail" data-d="${ds}"><span class="n">${dd}</span><span class="v">${v}</span></div>`);
  }
  return cells.join('');
}
function viewHistory() {
  const d = S.detailDate || todayISO();
  const base = parseISO(d), y = base.getFullYear(), m = base.getMonth();
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(todayISO(), -i); week.push({ d: ds, s: daySummary(ds) });
  }
  const t = targets();
  const wIn = week.reduce((a, b) => a + b.s.kcal, 0);
  const foodHist = S.histFood ? foodHistory(S.histFood) : null;
  return `<div class="top"><div><h1>历史</h1><div class="date">按天回看 · 最近 7 天平均 ${Math.round(wIn / 7)} kcal</div></div>
    <div class="act"><button class="icon-btn" data-act="pickDate">📅</button></div></div>
  <div class="view">
    <div class="card">
      <div class="cal-h"><h3>${y} 年 ${m + 1} 月</h3>
        <div class="cal-nav"><button class="icon-btn" data-act="calPrev">‹</button><button class="icon-btn" data-act="calNext">›</button></div></div>
      <div class="cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
      <div class="cal">${monthGrid(y, m)}</div>
      <div class="legend"><span><i style="background:var(--card2)"></i>无记录</span><span><i style="background:var(--soft)"></i>偏少</span>
        <span><i style="background:color-mix(in srgb,var(--brand) 22%,var(--card))"></i>接近目标</span>
        <span><i style="background:color-mix(in srgb,var(--brand) 36%,var(--card))"></i>达标</span>
        <span><i style="background:var(--danger-soft)"></i>超目标</span>
        <span><i style="background:var(--warn);width:4px;height:4px;border-radius:50%"></i>改过</span></div>
      <div class="muted" style="margin-top:8px">格子里的数字是当天摄入 kcal。点某天看明细，明细里可改克数或删除。</div>
    </div>
    <div class="card" id="dayDetail">${dayDetailHtml(d)}</div>
    <div class="card">
      <div class="row"><h3 class="title-s">趋势</h3>
        <div class="seg" style="width:120px"><button class="${S.trendWin === 7 ? 'on' : ''}" data-act="setTrendWin" data-v="7">7 天</button><button class="${S.trendWin === 30 ? 'on' : ''}" data-act="setTrendWin" data-v="30">30 天</button></div></div>
      ${trendHtml(S.trendWin)}
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">按食物查历史</h3></div>
      <div class="search-box" style="margin-top:8px"><input id="hq" type="search" placeholder="例如：鸡胸肉 / jxr" value="${esc(S.histFood)}"></div>
      <div id="fdHist">${foodHist ? foodHistHtml(foodHist) : '<div class="muted" style="margin-top:8px">搜一个食物，看过去吃过几次、每次多少克、总共多少。</div>'}</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">备份与容量</h3><button class="link" data-act="settings">设置 ›</button></div>
      <div class="muted" style="margin-top:6px">本机已存 ${state.entries.length} 条饮食记录、${state.weights.length} 条体重。按每天 12–15 条估算，localStorage（约 5 MB）可存 3–5 年；建议每月导出一次 JSON 备份。</div>
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn sm" data-act="exportCSV">导出 CSV</button>
        <button class="btn sm ghost" data-act="exportJSON">导出 JSON 备份</button>
        <button class="btn sm ghost" data-act="importJSON">导入还原</button>
      </div>
    </div>
  </div>`;
}
function dayDetailHtml(d) {
  const s = daySummary(d), t = targets();
  const rows = MEALS.map(([m, nm]) => {
    const es = s.entries.filter(e => e.m === m);
    if (!es.length) return '';
    return `<div style="margin-top:10px"><div class="row"><span class="title-s">${nm}</span><span class="muted">${Math.round(es.reduce((a, e) => a + e.base.kcal * e.g / 100, 0))} kcal</span></div>
      ${es.map(e => entryRow(e)).join('')}</div>`;
  }).join('');
  return `<div class="row"><h3 class="title-s">${fmtDate(d)} 明细</h3><button class="link" data-act="goDate" data-d="${d}">在这天记录 ›</button></div>
    <div class="kv"><div><b>${Math.round(s.kcal)}</b><span>kcal / 目标 ${t.kcal}</span></div>
      <div><b>${round(s.pro)} g</b><span>蛋白 / 目标 ${t.protein}</span></div>
      <div><b>${round(s.fat)} g</b><span>脂肪</span></div>
      <div><b>${round(s.carb)} g</b><span>碳水</span></div></div>
    ${rows || '<div class="empty">这天没有记录</div>'}`;
}
function trendHtml(win) {
  const days = [];
  for (let i = win - 1; i >= 0; i--) days.push(addDays(todayISO(), -i));
  const t = targets();
  const kcal = days.map(d => { const s = daySummary(d); return s.entries.length ? Math.round(s.kcal) : 0; });
  const pro = days.map(d => { const s = daySummary(d); return s.entries.length ? round(s.pro) : 0; });
  const lab = days.map(d => win === 7 ? String(parseISO(d).getDate()) : (parseISO(d).getDate() === 1 ? (parseISO(d).getMonth() + 1) + '月' : String(parseISO(d).getDate())));
  const logged = kcal.filter(v => v > 0).length;
  const avg = logged ? Math.round(kcal.reduce((a, b) => a + b, 0) / logged) : 0;
  return `<div class="chart-wrap">${barSVG({ values: kcal, target: t.kcal, xLabels: lab, height: 150 })}</div>
    <div class="legend-row"><span><i class="kdot" style="background:var(--brand)"></i>热量</span><span><i class="kdot" style="background:var(--warn)"></i>目标线 ${t.kcal}</span><span>有记录 ${logged}/${win} 天 · 平均 ${avg} kcal</span></div>
    <div class="chart-wrap" style="height:120px;margin-top:14px">${barSVG({ values: pro, target: t.protein, xLabels: [], height: 120 })}</div>
    <div class="legend-row"><span><i class="kdot" style="background:var(--brand)"></i>蛋白质 g</span><span><i class="kdot" style="background:var(--warn)"></i>目标 ${t.protein} g</span></div>`;
}
function foodHistory(q) {
  const list = searchFoods(q);
  if (!list.length) return { name: q, none: true };
  const f = list[0];
  const hits = state.entries.filter(e => e.n === f.n);
  const totalG = hits.reduce((a, e) => a + e.g, 0);
  const totalK = hits.reduce((a, e) => a + e.base.kcal * e.g / 100, 0);
  const totalP = hits.reduce((a, e) => a + e.base.pro * e.g / 100, 0);
  const days = Array.from(new Set(hits.map(e => e.d))).sort().reverse();
  return { name: f.n, f, n: hits.length, totalG: Math.round(totalG), totalK: Math.round(totalK), totalP: round(totalP), days };
}
function foodHistHtml(h) {
  if (h.none) return `<div class="muted" style="margin-top:8px">没有找到「${esc(h.name)}」</div>`;
  const last30 = h.days.filter(d => diffDays(d, todayISO()) <= 30).length;
  return `<div class="kv" style="margin-top:10px">
    <div><b>${h.n} 次</b><span>累计记录次数</span></div>
    <div><b>${h.totalG} g</b><span>累计克数</span></div>
    <div><b>${h.totalK} kcal</b><span>累计热量</span></div>
    <div><b>${h.totalP} g</b><span>累计蛋白</span></div></div>
    <div class="muted">近 30 天吃过 ${last30} 天 · 平均每次 ${h.n ? Math.round(h.totalG / h.n) : 0} g</div>
    <div class="quick-wrap" style="margin-top:10px">
      ${h.days.slice(0, 6).map(d => `<button class="chip" data-act="dayDetail" data-d="${d}">${d.slice(5)} · ${Math.round(state.entries.filter(e => e.d === d && e.n === h.name).reduce((a, e) => a + e.g, 0))}g</button>`).join('')}
    </div>`;
}

/* ================= 体重 / 身体构成 ================= */
function weightSeries(win) {
  win = win || 30;
  const out = [];
  for (let i = win - 1; i >= 0; i--) {
    const d = addDays(todayISO(), -i);
    const ws = state.weights.filter(w => w.d === d);
    out.push({
      d, am: ws.filter(w => w.t === 'am').map(w => w.kg).pop(),
      pm: ws.filter(w => w.t === 'pm').map(w => w.kg).pop(),
      wa: (state.waist || []).filter(w => w.d === d).map(w => w.cm).pop()
    });
  }
  return out;
}
function sma(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const seg = arr.slice(Math.max(0, i - n + 1), i + 1).filter(v => isFinite(v));
    out.push(seg.length >= Math.min(3, n) ? seg.reduce((a, b) => a + b, 0) / seg.length : NaN);
  }
  return out;
}
function ema(arr, a) {
  let prev = NaN; const out = [];
  for (const v of arr) {
    if (!isFinite(v)) { out.push(prev); continue; }
    prev = isFinite(prev) ? prev + a * (v - prev) : v; out.push(prev);
  }
  return out;
}
function slopePctPerWeek(series) {
  const pts = series.map((v, i) => [i, v]).filter(p => isFinite(p[1]));
  if (pts.length < 4) return null;
  const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0), sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const mean = sy / n;
  return mean ? round(b * 7 / mean * 100, 2) : null;
}
function weightStats() {
  const ser = weightSeries(30);
  const am = ser.map(x => x.am);
  const pm = ser.map(x => x.pm);
  const validAm = am.filter(isFinite);
  const last7 = am.slice(-7).filter(isFinite);
  const last14 = am.slice(-14).filter(isFinite);
  const w7 = last7.length ? round(last7.reduce((a, b) => a + b, 0) / last7.length, 1) : null;
  const w14 = last14.length ? round(last14.reduce((a, b) => a + b, 0) / last14.length, 1) : null;
  const s7 = sma(am, 7), e7 = ema(am, 0.3);
  const slope = slopePctPerWeek(s7);
  const deltaPM = ser.filter(x => isFinite(x.am) && isFinite(x.pm)).map(x => round(x.pm - x.am, 1));
  const avgDelta = deltaPM.length ? round(deltaPM.reduce((a, b) => a + b, 0) / deltaPM.length, 1) : null;
  const logged = am.filter(isFinite).length;
  return { ser, am, pm, w7, w14, s7, e7, slope, avgDelta, deltaPM, logged };
}
function viewWeight() {
  const ws = weightStats(), t = targets();
  const p = state.profile;
  return `<div class="top"><div><h1>体重</h1><div class="date">晨起空腹 + 晚间，双记录更好判读</div></div>
    <div class="act"><button class="icon-btn" data-act="addWeight" data-t="am">晨</button><button class="icon-btn" data-act="addWeight" data-t="pm">晚</button></div></div>
  <div class="view">
    <div class="card">
      <div class="kv">
        <div><b>${ws.w7 != null ? ws.w7 : '—'} kg</b><span>7 天晨重均值</span></div>
        <div><b>${ws.w14 != null ? ws.w14 : '—'} kg</b><span>14 天均值</span></div>
        <div><b>${ws.slope != null ? (ws.slope > 0 ? '+' : '') + ws.slope + '%' : '—'}</b><span>趋势斜率 / 周</span></div>
        <div><b>${ws.avgDelta != null ? ws.avgDelta : '—'} kg</b><span>日内波动（晚−晨）</span></div>
      </div>
      <div class="muted">晨重是基准：看 7 天均线和斜率，不看单日。日内波动主要来自当天摄入、水分与排汗，不是脂肪。</div>
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn sm" data-act="addWeight" data-t="am">记晨起空腹</button>
        <button class="btn sm ghost" data-act="addWeight" data-t="pm">记晚间</button>
        <button class="btn sm ghost" data-act="addWaist">记腰围</button>
      </div>
      <div class="muted" style="margin-top:8px">同一台秤、同一位置、尽量同一时刻称；晨起为空腹排尿后。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">晨重趋势（30 天）</h3><span class="muted">散点 + 7 日均线</span></div>
      <div class="chart-wrap">${chartSVG({
        n: ws.ser.length, height: 160,
        series: [
          { points: ws.am.map((v, i) => ({ i, y: v })), color: 'var(--sub)', dots: true, w: 0 },
          { points: ws.s7.map((v, i) => ({ i, y: v })), color: 'var(--brand)', w: 2.2 }
        ], xLabels: ws.ser.map((x, i) => i % 5 === 0 ? x.d.slice(5) : '')
      })}</div>
      <div class="legend-row"><span><i class="kdot" style="background:var(--sub)"></i>晨重</span><span><i class="kdot" style="background:var(--brand)"></i>7 日均线</span>
        ${ws.slope != null ? `<span>趋势 ${ws.slope > 0 ? '+' : ''}${ws.slope}% 体重/周</span>` : ''}</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">日内波动（晚 − 晨）</h3><span class="muted">${ws.avgDelta != null ? '均值 ' + ws.avgDelta + ' kg' : '暂无'}</span></div>
      ${ws.deltaPM.length ? `<div class="chart-wrap" style="height:110px">${barSVG({ values: ws.deltaPM.map(v => Math.abs(v)), xLabels: [], height: 110 })}</div>` : '<div class="empty">同一天记晨重和晚重后显示</div>'}
      <div class="muted">多数人晚重比晨重高 0.5–2 kg，属正常；它不代表长胖。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">判定</h3><span class="muted">推断，不是体成分检测</span></div>
      ${judgements().map(j => `<div class="adv ${j.tone === 'warn' ? 'warn' : j.tone === 'bad' ? 'bad' : ''}">
        <span class="ic">${j.tone === 'bad' ? '!' : j.tone === 'warn' ? '!' : '✓'}</span>
        <div class="bd"><p>${j.html}</p>
        <div class="muted" style="margin-top:4px">可信度：${j.conf}${j.why ? ' · ' + j.why : ''}</div>
        <button class="cite" data-act="cite" data-ids="${j.cite.join(',')}">依据：${citeLabel(j.cite)} ›</button></div></div>`).join('')}
      <div class="guard" style="margin-top:10px">只靠体重和摄入无法精确分离脂肪与瘦体重；以上结论基于能量平衡与变化速率的推断。要更准需要 DEXA 或体成分检测。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">辅助数据（可选）</h3><button class="link" data-act="editProfile">修改 ›</button></div>
      <div class="kv" style="margin-top:8px">
        <div><b>${p.bf ? p.bf + '%' : '未填'}</b><span>体脂率（BIA，误差大）</span></div>
        <div><b>${state.waist && state.waist.length ? state.waist[state.waist.length - 1].cm + ' cm' : '未记'}</b><span>腰围（肚脐水平）</span></div>
      </div>
      <div class="muted">家用 BIA 秤只看趋势，不看单次绝对值；腰围每周一次，比体重更能反映脂肪变化。</div>
      ${(state.lift || []).length ? `<div class="kv" style="margin-top:10px">${(state.lift).slice(-2).reverse().map(l => `<div><b>${esc(l.ex)} ${l.kg ? l.kg + ' kg' : ''}${l.reps ? ' × ' + esc(l.reps) : ''}</b><span>${l.d.slice(5)} 训练表现</span></div>`).join('')}</div>` : ''}
      <div class="quick-wrap" style="margin-top:10px"><button class="btn tiny" data-act="addWaist">＋ 记腰围</button><button class="btn tiny" data-act="logLift">＋ 记训练表现</button></div>
    </div>
  </div>`;
}
function judgements() {
  const ws = weightStats(), t = targets(), p = state.profile;
  const cal = calibration(state.settings.calWin);
  const out = [];
  const confBase = ws.logged >= 12 && cal.ok ? '高' : ws.logged >= 7 ? '中' : '低';
  const why = `晨重记录 ${ws.logged} 天${cal.ok ? '，已校准' : '，未校准'}${state.waist && state.waist.length ? '，有腰围' : '，无腰围'}`;
  const mode = p.mode;
  const rate = ws.slope;
  if (rate == null) {
    out.push({ tone: 'warn', conf: '低', why: '晨重记录不足 4 天', cite: ['hall', 'wishnofsky'], html: '晨重记录还太少，先连续记 4 天以上再看趋势；单日体重受水分和盐分影响很大。' });
    return out;
  }
  if (mode === 'cut') {
    if (rate < -1) out.push({ tone: 'bad', conf: confBase, why, cite: ['helmsPrep', 'helmsCR'], html: `体重周变化 ${rate}%，快于 −1%/周。这个速度下瘦体重流失风险上升：把蛋白提到 ${Math.round(p.weight * 2.0)} g 左右、保留每周 2–3 次抗阻训练、把缺口收窄到 −10%~−15%。` });
    else if (rate < -0.5) out.push({ tone: '', conf: confBase, why, cite: ['helmsPrep', 'issn'], html: `体重周变化 ${rate}%，落在 −0.5%~−1% 的合理区间，保持当前缺口。` });
    else if (rate <= 0.2) out.push({ tone: 'warn', conf: confBase, why, cite: ['hall', 'consensus'], html: `体重周变化 ${rate}%，基本没动。先检查记录完整度：油、零食、饮料、外卖最容易漏；连续两周仍不动再考虑把缺口调大 5%。` });
    else out.push({ tone: 'warn', conf: confBase, why, cite: ['hall'], html: `体重周变化 +${rate}%，减脂期出现上涨，多半是水分/记录偏差，先看 7 日均线而不是单日。` });
  } else if (mode === 'bulk') {
    if (rate > 0.5) out.push({ tone: 'warn', conf: confBase, why, cite: ['helmsPrep', 'morton'], html: `体重周变化 +${rate}%，快于 +0.5%/周，脂肪增加可能偏多。把盈余降到 +5%~+10%，蛋白保持 1.6–2.0 g/kg。` });
    else if (rate >= 0.25) out.push({ tone: '', conf: confBase, why, cite: ['morton'], html: `体重周变化 +${rate}%，在 +0.25%~+0.5% 的合理区间。` });
    else out.push({ tone: 'warn', conf: confBase, why, cite: ['morton', 'issn'], html: `体重周变化 ${rate}%，两周不涨说明热量不足。蛋白通常不是瓶颈，先把每日热量加 200–300 kcal（约 1 碗米饭 + 1 杯牛奶）。` });
  } else {
    out.push({ tone: Math.abs(rate) > 0.6 ? 'warn' : '', conf: confBase, why, cite: ['hall'], html: `体重周变化 ${rate}%。维持期目标是 ±0.5%/周内，超出说明摄入与消耗还没平衡。` });
  }
  const waistArr = (state.waist || []).slice(-3);
  if (waistArr.length >= 2 && rate <= 0.2 && rate >= -0.3) {
    const dWaist = round(waistArr[0].cm - waistArr[waistArr.length - 1].cm, 1);
    if (dWaist >= 1.5) out.push({ tone: '', conf: '中', why: '体重平稳、腰围下降', cite: ['helmsCR', 'morton'], html: `体重基本不变但腰围减少 ${dWaist} cm，可能在“重组”（减脂同时增肌）。这种情况在体脂较高者、训练新手、蛋白摄入充足的人群中确有窗口期。` });
    else if (dWaist <= -1) out.push({ tone: 'warn', conf: '中', why: '体重平稳、腰围上升', cite: ['hall'], html: `体重不变但腰围增加 ${Math.abs(dWaist)} cm，提示能量可能仍偏正或记录偏少。` });
  }
  if (rate <= 0.2 && waistArr.length >= 2 && round(waistArr[0].cm - waistArr[waistArr.length - 1].cm, 1) < 0.5 && mode === 'cut') {
    out.push({ tone: 'warn', conf: '低', why, cite: ['consensus'], html: '长期体重不动、腰围也不减：优先怀疑漏记（油和零食最常见），其次才是代谢适应。' });
  }
  const lifts = (state.lift || []).slice().sort((a, b) => a.d < b.d ? -1 : 1);
  const byEx = {};
  lifts.forEach(l => { (byEx[l.ex] = byEx[l.ex] || []).push(l); });
  const rising = Object.keys(byEx).filter(k => {
    const a = byEx[k];
    return a.length >= 2 && a[a.length - 1].kg > a[0].kg * 1.02;
  });
  if (rising.length && Math.abs(rate) <= 0.2) {
    out.push({ tone: '', conf: '中', why: '体重平稳、力量上升', cite: ['morton', 'helmsCR'], html: `体重基本不变，但 ${rising.slice(0, 2).map(esc).join('、')} 的重量在上升，可能在“重组”（减脂同时增肌）。这在体脂较高、训练新手、蛋白充足的人群中更常见。` });
  }
  return out;
}

/* ================= 我的消耗 ================= */
function viewEnergy() {
  const e = energyDetail(todayISO()), m = maintenanceEstimate(), t = targets();
  const cal = m.cal;
  const p = state.profile;
  const modeName = { cut: '减脂', bulk: '增肌', keep: '维持' }[t.mode];
  const confMap = { high: ['高', 'var(--brand)'], mid: ['中', 'var(--warn)'], low: ['低', 'var(--danger)'] };
  const confTxt = cal.ok ? confMap[cal.conf] : null;
  return `<div class="top"><div><h1>我的消耗</h1><div class="date">${fmtDate(todayISO())} · 估算值，用体重趋势校准</div></div>
    <div class="act"><button class="icon-btn" data-act="back">‹</button></div></div>
  <div class="view">
    <div class="card">
      <div class="row"><span class="muted">今日总消耗（TDEE）</span>
        <span class="tag ${cal.ok ? (cal.conf === 'high' ? 'src-CT' : cal.conf === 'mid' ? 'src-OFF' : 'src-EST') : 'src-USR'}">${cal.ok ? '已用 ' + cal.win + ' 天校准·可信度' + confTxt[0] : '公式估算·未校准'}</span></div>
      <div class="sum-head"><span class="kcal-big">${m.value}</span><span class="kcal-of">± ${m.calibrated ? Math.round((m.high - m.low) / 2) : Math.round(m.value * 0.12)} kcal</span></div>
      <div class="muted" style="margin-top:4px">区间 ${m.low}–${m.high} kcal${m.calibrated ? ` · 反推 ${m.reverse} / 公式 ${m.formula}` : ' · 未校准，仅公式 + 活动系数'}</div>
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn sm" data-act="applyCal" ${m.calibrated ? '' : 'disabled style="opacity:.5"'}>用作目标基准</button>
        <button class="btn sm ghost" data-act="calSheet">校准详情</button>
        ${m.manual ? '<button class="btn sm ghost" data-act="clearCal">恢复自动</button>' : ''}
      </div>
      ${cal.ok ? '' : `<div class="banner warn" style="margin-top:10px">${cal.reason || '数据不足'}；还需要约 ${Math.max(0, 10 - cal.logged)} 天有记录的饮食 + 至少 2 次体重（跨度 ≥7 天）才能校准。</div>`}
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">口径：运动算在哪一边</h3></div>
      <div class="seg" style="margin-top:8px">
        <button class="${e.separate ? 'on' : ''}" data-act="setTdeeMode" data-v="separate">运动单独累加</button>
        <button class="${e.separate ? '' : 'on'}" data-act="setTdeeMode" data-v="combined">活动系数已含运动</button>
      </div>
      <div class="muted" style="margin-top:8px">${e.separate
        ? '当前：活动系数只算日常走动（×' + e.factor + '），运动按当天记录单独加。两者不会重复计算。'
        : '当前：活动系数（×' + e.factor + '）已经包含规律运动，因此今天的运动记录<b>不再叠加</b>，只作为记录保留。'}</div>
      <div class="muted" style="margin-top:4px">两种模式只能选一种。默认建议“单独累加”：更直观，也不会把运动算两遍。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">四项明细</h3><button class="link" data-act="editProfile">改资料 ›</button></div>
      ${[
        ['1 基础代谢 BMR', e.bmr, `${bmrLabel()} · ${p.sex === 'male' ? '男' : '女'} ${p.age}岁 ${p.weight}kg ${p.height}cm`, ['mifflin']],
        ['2 日常活动 NEAT', Math.round(e.neat), `活动等级 ×${e.factor} = ${Math.round(e.neatBase)}，步数 ${p.steps} 调整 ${e.sAdj >= 0 ? '+' : ''}${Math.round(e.sAdj)}`, ['levine']],
        ['3 运动消耗', Math.round(e.ex), e.separate ? (state.ex.filter(x => x.d === todayISO()).map(x => (x.n || ((METS.find(m2 => m2.id === x.type) || {}).n || '运动')) + ' ' + x.min + 'min').join('、') || '今天还没记运动') : '已包含在活动系数里，不重复叠加（当天记录 ' + Math.round(e.exRaw) + ' kcal 仅供查看）', ['ainsworth']],
        ['4 食物热效应 TEF', Math.round(e.tef), `按摄入 ${Math.round(e.intake)} kcal 的 10%（高蛋白 9–12%）`, ['consensus']],
      ].map(([n, v, s, c]) => `<div class="adv"><span class="ic">${n[0]}</span><div class="bd">
        <p><b>${n.slice(2)}：${v} kcal</b></p><div class="muted">${esc(s)}</div>
        <button class="cite" data-act="cite" data-ids="${c.join(',')}">依据：${citeLabel(c)} ›</button></div></div>`).join('')}
      <div class="row" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><span class="title-s">合计</span><span class="title-s">${Math.round(e.total)} kcal</span></div>
    </div>
    <div class="card">
      <div class="row"><span class="muted">今日摄入 ${Math.round(e.intake)} kcal</span>
        <span class="tag ${e.intake - e.total > 0 ? 'src-EST' : 'src-CT'}">${e.intake - e.total > 0 ? '盈余 ' : '缺口 '}${Math.abs(Math.round(e.intake - e.total))} kcal</span></div>
      <div class="muted" style="margin-top:6px">目标 ${t.kcal} kcal（${modeName}${t.mode === 'cut' ? ' −' + t.deficitPct + '%' : t.mode === 'bulk' ? ' +' + p.surplus + '%' : ''}），消耗 ${Math.round(e.total)} kcal。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">三种 BMR 口径</h3><span class="muted">默认：${bmrLabel()}</span></div>
      ${bmrRows(e.bb)}
      <div class="muted" style="margin-top:8px">${e.bb.lbm ? `去脂体重 ${e.bb.lbm} kg（按体脂 ${p.bf}% 计）` : '填了体脂率才能用去脂体重公式；当前仅显示 Mifflin / Harris 两种。'}</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">今天的运动</h3><button class="link" data-act="exercise">运动消耗计算器 ›</button></div>
      ${state.ex.filter(x => x.d === todayISO()).map(x => {
        const mt = METS.find(m2 => m2.id === x.type) || { n: x.type, met: 5 };
        return `<div class="item" data-act="delEx" data-id="${x.id}"><div class="nm"><p>${esc(x.n || mt.n)}</p><span>${x.min} 分钟 · MET ${x.met || mt.met}${x.hr ? ' · 心率 ' + x.hr : ''}${x.kcal != null ? ' · ' + Math.round(x.kcal) + ' kcal' : ''}</span></div><div class="kc">×</div></div>`;
      }).join('') || '<div class="empty">还没记录运动，点右上角添加</div>'}
      <div class="muted">MET 取自 Ainsworth 2011 汇编的人群平均值，个体可差 ±20%，且不含运动后过量氧耗。</div>
    </div>
    <div class="guard">双标水法（DLW）是能量消耗测量的金标准，但需要实验室条件，网页应用做不到。所以这里用的是“公式 + 体重趋势校准”的替代方案，精度目标是接近而不是等同。</div>
    <div class="foot">公式误差通常在 ±10–15%，个体差异大。TDEE 是估算，用体重趋势反推才接近真实；体重受水分、排便、盐分影响，看周平均而不是单日。</div>
  </div>`;
}
function bmrLabel() {
  const bb = bmrCalc(state.profile);
  return bb.rec === 'cun' ? 'Cunningham（去脂体重）' : 'Mifflin-St Jeor';
}
function bmrRows(bb) {
  const p = state.profile;
  const rows = [
    ['Mifflin-St Jeor (1990)', bb.mif, '普通人群首选，误差 ±10–15%', 'mifflin'],
    ['Harris-Benedict 修订 (1984)', bb.har, '老公式，常高估 5–15%，仅作对照', 'roza'],
    ['Cunningham (1980)', bb.cun, bb.cun ? '按去脂体重，肌肉量大者更合适' : '需填体脂率', 'cunningham'],
    ['Katch-McArdle', bb.kat, bb.kat ? '教材公式，与 Cunningham 接近' : '需填体脂率', 'katch'],
  ];
  return rows.map(([n, v, s, c]) => `<div class="adv"><span class="ic">${bb.rec === c.replace('katch', 'cun') ? '✓' : '·'}</span><div class="bd">
    <p>${n}：<b>${v || '—'}</b> kcal</p><div class="muted">${s}</div>
    <button class="cite" data-act="cite" data-ids="${c}">依据 ›</button></div></div>`).join('');
}

/* ================= 我的 ================= */
function viewMe() {
  const p = state.profile, t = targets(), n = naPlan(), m = maintenanceEstimate();
  const minor = +p.age > 0 && +p.age < 18;
  const modes = [['cut', '减脂'], ['bulk', '增肌'], ['keep', '维持']];
  return `<div class="top"><div><h1>我的</h1><div class="date">目标 · 资料 · 备份 · 数据来源</div></div></div>
  <div class="view">
    <div class="card">
      <div class="seg">${modes.map(([k, v]) => `<button class="${p.mode === k ? 'on' : ''}" data-act="setMode" data-v="${k}">${v}</button>`).join('')}</div>
      <div class="kv" style="margin-top:12px">
        <div><b>${t.kcal}</b><span>kcal 目标（建议 ${r10(t.kcal * .95)}–${r10(t.kcal * 1.05)}）</span></div>
        <div><b>${t.protein} g</b><span>蛋白（区间 ${t.proLow}–${t.proHigh} g）</span></div>
        <div><b>${t.fat} g</b><span>脂肪（区间 ${t.fatLow}–${t.fatHigh} g）</span></div>
        <div><b>${t.carb} g</b><span>碳水（区间 ${t.carbLow}–${t.carbHigh} g）</span></div>
      </div>
      <div class="muted">消耗估算 ${m.value} kcal${m.calibrated ? '（已校准）' : '（公式估算，未校准）'} · 蛋白 ${t.proteinPerKg} g/kg · ${t.rate ? t.rate.txt : '维持体重，不设速率目标'}</div>
      ${t.warnings.length ? `<div class="guard" style="margin-top:8px">${t.warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn tiny" data-act="cite" data-ids="mifflin,issn,morton">热量/蛋白依据</button>
        <button class="btn tiny" data-act="cite" data-ids="cns">脂肪/碳水依据</button>
        <button class="btn tiny" data-act="energy">我的消耗 ›</button>
      </div>
      ${p.mode === 'cut' ? `<div class="seg" style="margin-top:12px">${[10, 15, 20].map(v => `<button class="${+p.deficit === v ? 'on' : ''}" data-act="setDeficit" data-v="${v}">−${v}%</button>`).join('')}</div>
        <div class="muted" style="margin-top:6px">默认 −15%。不允许热量低于基础代谢 ${t.bmr} kcal，低于会被拒绝。</div>` : ''}
      ${p.mode === 'bulk' ? `<div class="seg" style="margin-top:12px">${[5, 10, 15].map(v => `<button class="${+p.surplus === v ? 'on' : ''}" data-act="setSurplus" data-v="${v}">+${v}%</button>`).join('')}</div>
        <div class="muted" style="margin-top:6px">默认 +10%，盈余越大脂肪增加越多。</div>` : ''}
    </div>
    ${minor ? '<div class="banner bad">未满 18 岁：本应用的能量与蛋白建议不适用于未成年人，请由家长或专业人员指导。</div>' : ''}
    <div class="card">
      <div class="row"><h3 class="title-s">身体资料</h3><span class="muted">用于 BMR / 目标</span></div>
      <div class="grid2" style="margin-top:10px">
        <div class="field"><label>性别</label><select data-p="sex"><option value="male" ${p.sex === 'male' ? 'selected' : ''}>男</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>女</option></select></div>
        <div class="field"><label>年龄</label><input data-p="age" type="number" inputmode="numeric" value="${p.age}"></div>
        <div class="field"><label>身高 cm</label><input data-p="height" type="number" inputmode="decimal" value="${p.height}"></div>
        <div class="field"><label>体重 kg</label><input data-p="weight" type="number" inputmode="decimal" value="${p.weight}"></div>
        <div class="field"><label>体脂率 %（可选）</label><input data-p="bf" type="number" inputmode="decimal" placeholder="如 18" value="${p.bf}"></div>
        <div class="field"><label>日均步数</label><input data-p="steps" type="number" inputmode="numeric" value="${p.steps}"></div>
      </div>
      <div class="field"><label>日常活动等级</label><select data-p="activity">
        ${Object.keys(ACT).map(k => `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${ACT[k].n}</option>`).join('')}</select></div>
      <div class="grid2">
        <div class="field"><label>蛋白目标 g/kg</label><input data-p="proteinPerKg" type="number" step="0.1" inputmode="decimal" value="${p.proteinPerKg}"></div>
        <div class="field"><label>血压情况</label><select data-p="bp">
          <option value="normal" ${p.bp === 'normal' ? 'selected' : ''}>正常</option>
          <option value="high" ${p.bp === 'high' ? 'selected' : ''}>偏高 / 高血压</option></select></div>
      </div>
      <div class="field"><label>是否大量出汗</label><select data-p="sweat">
        <option value="no" ${p.sweat === 'no' ? 'selected' : ''}>一般/不出大汗</option>
        <option value="yes" ${p.sweat === 'yes' ? 'selected' : ''}>经常大汗（力量/有氧/高温作业）</option></select></div>
      <button class="btn block" data-act="saveProfile">保存并重算</button>
      <div class="muted" style="margin-top:8px">体脂率来自家用 BIA 秤时误差大，只看趋势。填了体脂率才启用 Cunningham / Katch-McArdle 参照。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">钠与钾</h3><span class="muted">今天钠 ${Math.round(daySummary(todayISO()).na)} mg</span></div>
      <div class="kv" style="margin-top:8px">
        <div><b>${n.limit} mg</b><span>钠上限（≈ 盐 ${round(n.limit / 2000 * 5, 1)} g）</span></div>
        <div><b>${n.k} mg</b><span>钾目标（WHO ≥3510）</span></div>
      </div>
      <div class="muted">${esc(n.note)}</div>
      <div class="muted" style="margin-top:6px">今天钠钾比 ${daySummary(todayISO()).k ? round(daySummary(todayISO()).na / daySummary(todayISO()).k, 2) : '—'}（越接近 0 越好，<1 更有优势）。</div>
      <div class="field" style="margin-top:10px"><label>自定义钠上限（mg，留空用默认）</label>
        <input id="naLimit" type="number" inputmode="numeric" placeholder="${n.limit}" value="${state.settings.naLimit || ''}">
        <div class="hint">低于 1000 mg 会被拒绝：长期极低钠有低钠血症风险，尤其大量出汗时。</div></div>
      <div class="quick-wrap"><button class="btn sm ghost" data-act="saveNa">应用</button>
        <button class="btn sm" data-act="naSheet">今日钠钾明细</button></div>
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn tiny" data-act="addNamed" data-name="香蕉" data-g="120">香蕉 120g</button>
        <button class="btn tiny" data-act="addNamed" data-name="菠菜" data-g="100">菠菜 100g</button>
        <button class="btn tiny" data-act="addNamed" data-name="土豆" data-g="150">土豆 150g</button>
        <button class="btn tiny" data-act="addNamed" data-name="牛油果" data-g="100">牛油果 100g</button>
      </div>
      <div class="quick-wrap" style="margin-top:8px"><button class="btn tiny" data-act="cite" data-ids="whoSodium,whoPotassium">钠钾依据</button>
        <button class="btn tiny" data-act="cite" data-ids="cns">膳食指南依据</button></div>
      <div class="muted" style="margin-top:8px">影响面部轮廓的主要因素是体脂率与整体水肿状态，钠只是其中一环。控钠能减少水钠潴留带来的“肿”，但不等于减脂。</div>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">本周复盘</h3><span class="muted">过去 7 天</span></div>
      ${weeklyAdvice().map(advRow).join('')}
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">数据与备份</h3><span class="muted">${storageText()}</span></div>
      <div class="quick-wrap" style="margin-top:10px">
        <button class="btn sm" data-act="exportCSV">导出 CSV</button>
        <button class="btn sm ghost" data-act="exportJSON">导出 JSON</button>
        <button class="btn sm ghost" data-act="importJSON">导入还原</button>
      </div>
      <details style="margin-top:10px"><summary>危险操作</summary><div class="bd">
        <button class="btn sm danger" data-act="resetAll">清空全部数据</button></div></details>
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">数据来源与许可</h3></div>
      <div class="muted" style="margin-top:8px">内置食物库 ${FOODS.length} 条 + 家常菜 ${DISHES.length} 条（估算），数值参照《中国食物成分表（第 6 版）》公开整理资料与 USDA FoodData Central，由本项目手工录入。</div>
      ${Object.keys(SRC).map(k => `<div class="src-card"><div class="hd"><span class="tag src-${k}">${SRC[k].tag}</span><span class="nm">${esc(SRC[k].name)}</span></div>
        <div class="ln">版本：${esc(SRC[k].ver)}</div><div class="ln">许可：${esc(SRC[k].lic)}</div>
        ${SRC[k].url ? `<a href="${SRC[k].url}" target="_blank" rel="noopener">${SRC[k].url}</a>` : ''}</div>`).join('')}
      <div class="muted" style="margin-top:10px">不同部位、不同饲养方式、不同烹饪都会让数值浮动；熟重/生重差 2–3 倍。本库是参考值，不是实验室实测。</div>
      <button class="btn sm ghost" style="margin-top:10px" data-act="allCites">全部文献依据（${Object.keys(CITES).length} 条）</button>
    </div>
    <div class="guard">通用营养信息，不替代医生或注册营养师。有基础疾病、孕期、服药中请咨询专业人士。未成年人、肾病（尤其需限钾）人群不适用本应用建议。</div>
    <div class="foot">吃多少 · 数据全部存在本机浏览器，不上传服务器（扫码查询除外）。</div>
  </div>`;
}
function storageText() {
  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(state)]).size; } catch (e) { }
  const years = state.entries.length ? '约可存 3–5 年' : '约可存 3–5 年（按每天 12–15 条）';
  return `${(bytes / 1024).toFixed(1)} KB / 约 5 MB · ${years}`;
}

/* ================= 建议 ================= */
function dailyAdvice() {
  const d = daySummary(S.date), t = targets(), n = naPlan(), out = [];
  if (!d.entries.length) {
    out.push({ html: '还没有记录。先记一餐，我会给出“还差多少蛋白、哪一餐偏少”的具体建议。', cite: ['cns'] });
    return out;
  }
  const gap = Math.round(t.protein - d.pro);
  if (gap > 8) {
    const eq = proteinEquiv(gap);
    out.push({ html: `蛋白 ${round(d.pro)} g，目标 ${t.protein} g，还差 ${gap} g ≈ ${eq.chG} g 鸡胸，或 ${eq.eggN} 个鸡蛋 + ${eq.milkMl} ml 牛奶。`, cite: ['issn', 'morton'] });
  } else if (d.pro >= t.proHigh) {
    out.push({ html: `蛋白 ${round(d.pro)} g 已达区间上限 ${t.proHigh} g，不必再堆；把余下热量给碳水和蔬菜。`, cite: ['morton'] });
  }
  const perMeal = Math.round(t.protein / 3);
  const lowMeal = MEALS.filter(([m]) => d.entries.some(e => e.m === m)).map(([m, nm]) => ({ m, nm, p: round(d.entries.filter(e => e.m === m).reduce((a, e) => a + e.base.pro * e.g / 100, 0)) }))
    .filter(x => x.p < perMeal * 0.6).sort((a, b) => a.p - b.p)[0];
  if (lowMeal && d.pro < t.proHigh) out.push({ html: `${lowMeal.nm}蛋白只有 ${lowMeal.p} g（每餐 ${perMeal} g 左右更利于利用）。补一份 100 g 鸡胸或 2 个鸡蛋即可。`, cite: ['issn'] });
  if (d.kcal > t.kcal + 100) out.push({ tone: true, html: `热量已超目标 ${Math.round(d.kcal - t.kcal)} kcal，剩余餐次优先“高蛋白 + 蔬菜 + 少油”。`, cite: ['cns'] });
  if (d.na > n.limit) {
    const top = naFoods(S.date).slice(0, 3).map(x => x.n + ' ' + x.na + 'mg').join('、');
    out.push({ tone: true, html: `钠 ${Math.round(d.na)} mg 已超上限 ${n.limit} mg。主要来源：${top}。换成低钠盐、酱油少半勺、汤少喝一口，通常能减 500–800 mg。`, cite: ['whoSodium', 'cns'] });
  }
  if (d.k > 0 && d.k < n.k * 0.6) out.push({ html: `钾只有 ${Math.round(d.k)} mg（目标 ${n.k} mg），加一份菠菜/土豆/香蕉能改善钠钾比。`, cite: ['whoPotassium'] });
  return out;
}
function weeklyAdvice() {
  const t = targets(), out = [], p = state.profile;
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(todayISO(), -i));
  const logged = days.filter(d => daySummary(d).entries.length);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + daySummary(d).kcal, 0) / logged.length) : 0;
  const avgP = logged.length ? round(logged.reduce((a, d) => a + daySummary(d).pro, 0) / logged.length, 1) : 0;
  const ws = weightStats();
  if (!logged.length) return [{ html: '这周还没有完整的饮食记录，复盘从明天开始。', cite: ['cns'] }];
  out.push({ html: `平均摄入 ${avg} kcal，目标 ${t.kcal} kcal（差 ${avg - t.kcal >= 0 ? '+' : ''}${avg - t.kcal}）；有记录 ${logged.length}/7 天。`, cite: ['hall'] });
  out.push({ html: `平均蛋白 ${avgP} g（${round(avgP / (+p.weight || 1), 1)} g/kg），目标 ${t.protein} g。${avgP < t.proLow ? '偏低，优先补蛋白。' : '达标。'}`, cite: ['issn'] });
  if (ws.slope != null) {
    out.push({
      html: `体重趋势 ${ws.slope > 0 ? '+' : ''}${ws.slope}%/周，7 天均值 ${ws.w7} kg。${p.mode === 'cut' && ws.slope < -1 ? '偏快，注意瘦体重流失风险。' : p.mode === 'bulk' && ws.slope < 0.25 ? '两周不涨就该加热量 200–300 kcal。' : '在合理区间。'}`,
      cite: ['helmsPrep', 'morton'], tone: (p.mode === 'cut' && ws.slope < -1) || (p.mode === 'bulk' && ws.slope < 0.25)
    });
  }
  const naAvg = Math.round(logged.reduce((a, d) => a + daySummary(d).na, 0) / logged.length);
  out.push({ html: `本周平均钠 ${naAvg} mg（上限 ${naPlan().limit} mg）${naAvg > naPlan().limit ? '，偏高：重点查酱油、加工肉、腌制品和外卖汤底。' : '，控制得不错。'}`, cite: ['whoSodium'], tone: naAvg > naPlan().limit });
  return out;
}
function structureAdvice() {
  const mode = state.profile.mode;
  if (mode === 'cut') {
    return { title: '减脂期结构建议', text: '优先高蛋白低脂：鸡胸/鱼虾/蛋/豆腐 + 大量蔬菜，主食选米饭/燕麦定量，油单独记。', foods: [['鸡胸肉', 150], ['西兰花', 200], ['鸡蛋', 100], ['米饭(熟)', 150]] };
  }
  if (mode === 'bulk') {
    return { title: '增肌期结构建议', text: '热量盈余靠碳水：训练前后各加一份主食，蛋白保持 1.6–2.0 g/kg，不必再堆到 2.5+。', foods: [['米饭(熟)', 200], ['牛里脊', 150], ['全脂牛奶', 250], ['香蕉', 120]] };
  }
  return { title: '维持期结构建议', text: '保持蛋白 1.2–1.8 g/kg，主食与脂肪按周平均稳定，波动不要太大。', foods: [['鸡蛋', 100], ['米饭(熟)', 150], ['北豆腐', 150]] };
}
function citeLabel(ids) {
  const map = {
    mifflin: 'Mifflin 1990', roza: 'Roza 1984', cunningham: 'Cunningham 1980', katch: '教材公式',
    issn: 'ISSN 2017', helmsPrep: 'Helms 2014', helmsCR: 'Helms 2014(综述)', morton: 'Morton 2018',
    ainsworth: 'Ainsworth 2011', wishnofsky: 'Wishnofsky 1958', levine: 'Levine 2004',
    hall: 'Hall 2008', pontzer: 'Pontzer 2016', dlw: 'Bajunaid 2025',
    whoSodium: 'WHO 2012 钠', whoPotassium: 'WHO 2012 钾', whoSugar: 'WHO 2015 糖',
    cns: '中国膳食指南 2022', acsm: 'ACSM 2009', consensus: '通用共识'
  };
  return ids.map(i => map[i] || i).join(' / ');
}

/* ================= 弹层 ================= */
function openSheet(html, cls) {
  $('#sheetBody').innerHTML = html;
  $('#overlay').classList.add('on');
  $('#sheet').classList.add('on');
}
function closeSheet() {
  $('#overlay').classList.remove('on');
  $('#sheet').classList.remove('on');
  stopScan();
}
function citeSheet(ids) {
  const list = String(ids).split(',').map(x => x.trim());
  const cards = list.map(id => {
    const c = CITES[id] || CITES.consensus;
    const st = c.st.indexOf('降级') >= 0 ? 'd' : ['指南', '立场声明', '权威标准', '方法学·大样本'].some(x => c.st.indexOf(x) >= 0) ? 'a' : '';
    return `<div class="cite-card">
      <div class="row"><span class="st ${st}">${esc(c.st)}</span></div>
      <h4>${esc(c.claim)}</h4>
      <div class="meta">${esc(c.authors)}${c.year ? ' · ' + c.year : ''}${c.journal ? ' · ' + esc(c.journal) : ''}</div>
      <div class="meta" style="margin-top:2px">${esc(c.title)}</div>
      ${c.url ? `<a href="${c.url}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px">${esc(c.url)}</a>` : '<div class="meta" style="margin-top:6px;color:var(--warn)">无可核验链接（已降级）</div>'}
      <div class="lim">适用：${esc(c.pop)}<br>局限：${esc(c.lim)}</div>
    </div>`;
  }).join('');
  openSheet(`<div class="sheet-h"><div><h2>依据</h2><div class="muted">文献均已核对，可点开链接</div></div><button class="x" data-act="closeSheet">×</button></div>${cards}
    <div class="muted" style="padding:0 2px">标注“共识·未附文献”的条目，是本应用未找到合适可核验出处时如实降级的结果。</div>`);
}

/* ================= 食物详情 / 添加 ================= */
function foodDetailSheet(name) {
  const f = DB.find(x => x.n === name);
  if (!f) return toast('没找到该食物');
  const p = f.dish ? '' : `<div class="kv">
    <div><b>${Math.round(f.kcal)}</b><span>kcal</span></div>
    <div><b>${round(f.pro)} g</b><span>蛋白质</span></div>
    <div><b>${round(f.fat)} g</b><span>脂肪</span></div>
    <div><b>${round(f.carb)} g</b><span>碳水</span></div>
    <div><b>${round(f.fib)} g</b><span>膳食纤维</span></div>
    <div><b>${Math.round(f.na)} mg</b><span>钠</span></div>
  </div>`;
  const dishInfo = f.dish ? `<div class="banner warn">家常菜为<b>估算值</b>：${esc(f.dish.note)}。想更准就拆成食材（肉 + 菜 + 食用油）分别记录。</div>
    <div class="src-card"><div class="nm">配料（一份 ${f.pg} g）</div>
    ${f.dish.comp.map(([n2, g]) => `<div class="ln">${esc(n2)} ${g} g</div>`).join('')}</div>` : '';
  const presets = portionPresets(f);
  openSheet(`
    <div class="sheet-h"><div><h2>${esc(f.n)}</h2>
      <div class="muted" style="margin-top:4px">${srcTag(f)} ${f.dish ? '<span class="tag est">估算值</span>' : ''} <span class="tag">${f.cat}</span> <span class="tag">${esc(f.st || '生')}</span></div></div>
      <button class="x" data-act="closeSheet">×</button></div>
    <div class="muted">每 100 g 可食部</div>
    ${p}${dishInfo}
    ${f.dish ? '' : `<div class="muted" style="margin-top:6px">钾 ${f.k ? Math.round(f.k) + ' mg' : '未收录'}（部分条目缺钾数据，累计时按 0 处理）</div>`}
    <div style="margin-top:12px">
      ${presets.length ? `<div class="quick-wrap">${presets.map(([l, g]) => `<button class="chip" data-preset="${g}">${l} · ${g}g</button>`).join('')}</div>` : ''}
      <div class="grid2" style="margin-top:10px">
        <div class="field"><label>克数（g）</label><input id="addG" type="number" inputmode="decimal" value="${presets.length ? presets[0][1] : 100}"></div>
        <div class="field"><label>日期</label><input id="addDate" type="date" value="${S.date}"></div>
      </div>
      <div class="field"><label>餐次</label><select id="addMeal">${MEALS.map(([m, n]) => `<option value="${m}" ${m === S.meal ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="card tight" style="background:var(--card2);box-shadow:none" id="addPreview"></div>
      <button class="btn block" style="margin-top:10px" data-act="doAdd" data-name="${esc(f.n)}">加入记录</button>
      <div class="row" style="margin-top:10px"><span class="muted">数据来源</span><button class="link" data-act="toggleFav" data-name="${esc(f.n)}">${state.fav.includes(f.n) ? '★ 已收藏' : '☆ 收藏常吃'}</button></div>
      ${sourceCard(f)}
    </div>`);
  bindAddPreview(f);
}
function bindAddPreview(f) {
  const g = $('#addG'), box = $('#addPreview');
  const upd = () => {
    const grams = +g.value || 0;
    const r = grams / 100;
    box.innerHTML = `<div class="row"><span class="muted">${grams} g</span><b>${Math.round(f.kcal * r)} kcal</b></div>
      <div class="muted">蛋白 ${round(f.pro * r, 1)} g · 脂肪 ${round(f.fat * r, 1)} g · 碳水 ${round(f.carb * r, 1)} g · 钠 ${Math.round(f.na * r)} mg</div>`;
  };
  g.addEventListener('input', upd);
  $$('#sheetBody [data-preset]').forEach(b => b.addEventListener('click', () => { g.value = b.dataset.preset; upd(); }));
  upd();
}
function addEntry(f, grams, meal, date) {
  grams = +grams;
  if (!(grams > 0)) return toast('请输入大于 0 的克数');
  state.entries.push({
    id: uid(), d: date, m: meal, n: f.n, g: round(grams, 1), src: f.src, ts: Date.now(),
    base: { kcal: f.kcal, pro: f.pro, fat: f.fat, carb: f.carb, fib: f.fib, na: f.na, k: f.k || 0 }
  });
  state.recents = [f.n].concat(state.recents.filter(x => x !== f.n)).slice(0, 10);
  clearDay(date); save(); closeSheet(); render(); toast('已加入' + MEAL_NAME[meal] + ' · ' + Math.round(grams) + 'g');
}
function editEntrySheet(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  const f = DB.find(x => x.n === e.n) || { n: e.n, src: e.src, cat: '', st: '' };
  openSheet(`<div class="sheet-h"><div><h2>修改记录</h2><div class="muted">${esc(e.n)} · ${fmtDate(e.d)}</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="grid2"><div class="field"><label>克数 g</label><input id="eg" type="number" inputmode="decimal" value="${e.g}"></div>
      <div class="field"><label>餐次</label><select id="em">${MEALS.map(([m, n]) => `<option value="${m}" ${e.m === m ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="field"><label>日期</label><input id="ed" type="date" value="${e.d}"></div>
    <div class="muted">修改后会标记「已改」，当天汇总自动重算。</div>
    <button class="btn block" style="margin-top:10px" data-act="saveEntry" data-id="${e.id}">保存修改</button>
    <button class="btn block danger" style="margin-top:8px" data-act="delEntry" data-id="${e.id}">删除这条</button>
    ${sourceCard(f)}`);
}
function customFoodSheet() {
  openSheet(`<div class="sheet-h"><div><h2>自建食物</h2><div class="muted">照着包装营养成分表填，kJ 会自动换算</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="field"><label>名称 *</label><input id="cfName" placeholder="如：某品牌蛋白棒"></div>
    <div class="grid2">
      <div class="field"><label>类别</label><select id="cfCat">${['主食', '畜肉', '禽肉', '水产', '蛋奶', '豆制品', '蔬菜', '水果', '坚果', '油脂', '调味', '加工食品', '饮品', '自建'].map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>状态</label><select id="cfSt"><option>生</option><option>熟</option><option>干</option><option>制品</option></select></div>
    </div>
    <div class="field"><label>能量 *</label>
      <div class="grid2"><input id="cfEnergy" type="number" inputmode="decimal" placeholder="包装上的数值">
      <select id="cfUnit"><option value="kcal">kcal / 100g</option><option value="kj">kJ / 100g</option></select></div>
      <div class="hint" id="cfConv">kJ → kcal：除以 4.184</div></div>
    <div class="grid2">
      <div class="field"><label>蛋白质 g</label><input id="cfPro" type="number" inputmode="decimal" value="0"></div>
      <div class="field"><label>脂肪 g</label><input id="cfFat" type="number" inputmode="decimal" value="0"></div>
      <div class="field"><label>碳水 g</label><input id="cfCarb" type="number" inputmode="decimal" value="0"></div>
      <div class="field"><label>膳食纤维 g</label><input id="cfFib" type="number" inputmode="decimal" value="0"></div>
      <div class="field"><label>钠 mg</label><input id="cfNa" type="number" inputmode="decimal" value="0"></div>
      <div class="field"><label>钾 mg（可选）</label><input id="cfK" type="number" inputmode="decimal" value="0"></div>
    </div>
    <div class="field"><label>备注 / 品牌 / 条码（可选）</label><input id="cfBrand" placeholder="便于以后辨认"></div>
    <div class="banner info">自建食物只存本机，标签为「自建 · 手动录入」，不会和成分表/开源库数据混在一起。</div>
    <button class="btn block" data-act="saveCustom">保存并加入记录库</button>`);
  const e = $('#cfEnergy'), u = $('#cfUnit'), hint = $('#cfConv');
  const upd = () => {
    const v = +e.value || 0;
    hint.textContent = u.value === 'kj' && v ? `≈ ${round(v / 4.184, 1)} kcal / 100g` : 'kJ → kcal：除以 4.184';
  };
  e.addEventListener('input', upd); u.addEventListener('change', upd);
}
function naSheet() {
  const d = daySummary(todayISO()), n = naPlan();
  const top = naFoods(todayISO());
  const kFoods = [['香蕉', 120], ['菠菜', 100], ['土豆', 150], ['牛油果', 100], ['北豆腐', 150]];
  openSheet(`<div class="sheet-h"><div><h2>钠与钾</h2><div class="muted">${fmtDate(todayISO())}</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="kv">
      <div><b>${Math.round(d.na)} / ${n.limit} mg</b><span>钠（上限）</span></div>
      <div><b>${Math.round(d.k)} / ${n.k} mg</b><span>钾（目标）</span></div>
      <div><b>${d.k ? round(d.na / d.k, 2) : '—'}</b><span>钠钾比（<1 较好）</span></div>
      <div><b>${round(d.na / 2000 * 5, 2)} g</b><span>折合食盐</span></div>
    </div>
    ${d.na > n.limit ? `<div class="banner bad">已超上限 ${Math.round(d.na - n.limit)} mg。主要来源：${top.map(x => esc(x.n) + ' ' + x.na + 'mg').join('、') || '记录不足'}。</div>` : '<div class="banner info">钠未超上限。</div>'}
    <div class="muted">替换建议：酱油少放半勺（约 −300 mg）、用低钠盐、汤底少喝、加工肉换成鲜肉、榨菜咸蛋换成凉拌黄瓜。</div>
    <div class="row" style="margin-top:12px"><span class="title-s">补钾食物（一键加入）</span></div>
    <div class="quick-wrap" style="margin-top:6px">${kFoods.map(([n2, g]) => `<button class="btn tiny" data-act="addNamed" data-name="${n2}" data-g="${g}">${n2} ${g}g</button>`).join('')}</div>
    <div class="muted" style="margin-top:8px">钾数据仅覆盖部分食物（本库 ${DB.filter(f => f.k).length} 条），没收录的按 0 计，因此钾可能被低估。</div>
    <div class="guard" style="margin-top:10px">钠不是影响面部轮廓的唯一因素：体脂率、碳水与水分、睡眠、酒精都会影响“肿”。控钠能减少水钠潴留，但不等于减脂。</div>
    <button class="btn sm ghost block" style="margin-top:10px" data-act="cite" data-ids="whoSodium,whoPotassium,cns">查看依据</button>`);
}

/* ================= 证据等级 ================= */
const EV = {
  strong: { n: '强', t: '随机对照试验 / meta 分析 / 权威指南明确推荐' },
  mid: { n: '中', t: '多项观察性研究结果一致' },
  weak: { n: '弱', t: '机制研究、小样本或专家推断' },
  neg: { n: '负面证据', t: '有证据显示风险，不作为常规推荐' }
};
const EV_RANK = { neg: 0, weak: 1, mid: 2, strong: 3 };
const EV_OF = {
  strong: ['issn', 'morton', 'whoSodium', 'whoPotassium', 'whoSugar', 'cns', 'acsm', 'ainsworth', 'dlw', 'auneGrain', 'iarc', 'whoSatFat', 'issnTiming'],
  weak: ['katch', 'consensus', 'keytel', 'laForgia'],
  mid: ['mifflin', 'roza', 'cunningham', 'helmsPrep', 'helmsCR', 'hall', 'pontzer', 'wishnofsky', 'levine', 'auneFV', 'auneNuts', 'zargarzadeh', 'schoenfeld2018', 'leucine', 'shcherbina']
};
function evOf(id) {
  if (EV_OF.strong.includes(id)) return 'strong';
  if (EV_OF.weak.includes(id)) return 'weak';
  return 'mid';
}
function evTag(grade) {
  const e = EV[grade] || EV.mid;
  return `<span class="ev ev-${grade}">证据${e.n}</span>`;
}

const EVID = {
  grain: { label: '全谷物 / 高纤维主食', ev: 'strong', ids: ['auneGrain', 'cns'], why: '指南明确推荐全谷物；meta 分析显示全谷物摄入与心血管病、全因死亡率下降相关（观察性，剂量-反应）。' },
  veg: { label: '蔬菜', ev: 'strong', ids: ['auneFV', 'cns'], why: '指南明确推荐每天 300–500 g 蔬菜；meta 分析显示蔬果摄入与全因死亡率负相关（观察性）。' },
  fruit: { label: '水果', ev: 'strong', ids: ['auneFV', 'cns'], why: '指南明确推荐每天 200–350 g 水果；meta 分析显示蔬果摄入与全因死亡率负相关；完整水果优于果汁。' },
  leanProt: { label: '优质蛋白（禽/蛋/瘦畜肉/鱼）', ev: 'strong', ids: ['issn', 'morton', 'schoenfeld2018'], why: '立场声明与 meta 分析支持抗阻训练人群蛋白约 1.6 g/kg，每餐约 0.4 g/kg 分配。' },
  dairy: { label: '乳制品', ev: 'strong', ids: ['cns', 'issn'], why: '指南明确推荐每天相当于 300–500 g 液态奶的乳制品；提供优质蛋白与钙。' },
  fish: { label: '鱼类', ev: 'strong', ids: ['cns', 'auneFV'], why: '指南明确建议每周吃鱼 2 次；ω-3 补充剂的硬终点证据有限，不作夸大。' },
  nut: { label: '坚果（无盐）', ev: 'strong', ids: ['auneNuts', 'cns'], why: '指南推荐每天约 10 g 坚果；meta 分析显示坚果摄入与心血管病、全因死亡风险下降相关。' },
  legume: { label: '豆类 / 豆制品', ev: 'strong', ids: ['zargarzadeh', 'cns'], why: '指南推荐每天相当于 15–25 g 大豆的豆制品；豆类摄入与全因死亡率下降相关。' },
  oil: { label: '植物油（不饱和脂肪）', ev: 'strong', ids: ['whoSatFat', 'cns'], why: 'WHO 2023 建议以不饱和脂肪替代饱和脂肪；每天烹调油约 25–30 g。' },
  sugar: { label: '含糖饮料 / 添加糖', ev: 'strong', neg: true, ids: ['whoSugar', 'cns'], why: '游离糖应 <10% 能量，最好 <5%；含糖饮料是液体热量，饱腹感差。' },
  procMeat: { label: '加工肉制品', ev: 'strong', neg: true, ids: ['iarc', 'cns'], why: 'IARC 2015 将加工肉列为 1 类致癌物（结直肠癌）；红肉为 2A 类。' },
  redMeat: { label: '红肉（猪 / 牛 / 羊）', ev: 'mid', neg: false, caution: '每周 ≤500 g 熟重', ids: ['iarc', 'cns'], why: 'IARC 2A 类；指南建议每周红肉 ≤500 g，优先瘦肉、避免加工。' },
  fried: { label: '油炸食品', ev: 'weak', neg: true, ids: ['cns', 'whoSatFat'], why: '油炸显著提高能量密度；长期摄入与代谢风险相关，证据以观察性为主。' },
  alcohol: { label: '酒精', ev: 'strong', neg: true, ids: ['cns'], why: '指南建议尽量不饮酒；不存在“对健康有益”的安全阈值。' },
  satfat: { label: '饱和脂肪（猪油等）', ev: 'mid', neg: true, ids: ['whoSatFat'], why: 'WHO 2023 建议限制饱和脂肪供能 <10%，用植物油替代。' },
  refined: { label: '精制主食', ev: 'mid', ids: ['cns'], why: '并非有害，但纤维与微量营养素低于全谷物；指南建议与全谷物搭配，而非全部替换。' }
};

const FOOD_EV = {
  '培根': ['procMeat'], '火腿': ['procMeat'], '香肠(广式)': ['procMeat'], '午餐肉': ['procMeat'],
  '火腿肠': ['procMeat'], '鱼丸': ['procMeat'], '鱼豆腐': ['procMeat'], '牛肉丸': ['procMeat'], '辣条': ['procMeat'],
  '薯片': ['fried'], '薯条': ['fried'], '炸鸡排': ['fried'], '油条': ['fried'], '方便面(干)': ['fried'],
  '可乐': ['sugar'], '奶茶(全糖)': ['sugar'], '运动饮料': ['sugar'], '橙汁': ['sugar'], '椰汁': ['sugar'],
  '冰淇淋': ['sugar'], '牛奶巧克力': ['sugar'], '奶油蛋糕': ['sugar'], '饼干(苏打)': ['sugar'], '蛋挞': ['sugar'],
  '月饼': ['sugar'], '炼乳': ['sugar'], '蜂蜜': ['sugar'], '白糖': ['sugar'], '代餐奶昔(冲调)': ['sugar'],
  '啤酒': ['alcohol'], '白酒(52度)': ['alcohol'], '红酒': ['alcohol'],
  '猪油': ['satfat'], '黄油': ['satfat'],
  '燕麦片(干)': ['grain'], '全麦面包': ['grain'], '全麦面粉': ['grain'], '糙米饭(熟)': ['grain'],
  '藜麦(生)': ['grain'], '荞麦(生)': ['grain'], '玉米(鲜)': ['grain'], '红薯': ['grain'], '紫薯': ['grain'],
  '希腊酸奶(原味)': ['dairy', 'leanProt'], '无糖酸奶': ['dairy'], '全脂牛奶': ['dairy'], '脱脂牛奶': ['dairy'],
  '低脂牛奶': ['dairy'], '奶酪(切达)': ['dairy'], '马苏里拉奶酪': ['dairy'], '全脂奶粉': ['dairy'],
  '北豆腐': ['legume'], '南豆腐': ['legume'], '内酯豆腐': ['legume'], '豆腐干': ['legume'], '豆腐皮': ['legume'],
  '腐竹': ['legume'], '素鸡': ['legume'], '豆浆(无糖)': ['legume'], '黄豆': ['legume'], '黑豆': ['legume'],
  '鹰嘴豆(干)': ['legume'], '毛豆': ['legume'], '鸡蛋': ['leanProt'], '蛋清': ['leanProt'], '鸡胸肉': ['leanProt'],
  '鸡腿肉': ['leanProt'], '三文鱼': ['fish', 'leanProt'], '鳕鱼': ['fish', 'leanProt'], '鲈鱼': ['fish', 'leanProt'],
  '基围虾': ['fish', 'leanProt'], '虾仁': ['fish', 'leanProt'], '金枪鱼罐头(水浸)': ['fish', 'leanProt'],
  '猪里脊': ['redMeat', 'leanProt'], '猪后腿瘦肉': ['redMeat', 'leanProt'], '牛里脊': ['redMeat', 'leanProt'],
  '牛腱子': ['redMeat', 'leanProt'], '牛肉(瘦)': ['redMeat', 'leanProt'], '羊腿肉': ['redMeat', 'leanProt'],
  '橄榄油': ['oil'], '植物油(大豆油)': ['oil'], '花生油': ['oil'], '菜籽油': ['oil'], '玉米油': ['oil'],
  '核桃': ['nut'], '巴旦木': ['nut'], '腰果': ['nut'], '开心果': ['nut'], '花生(生)': ['nut'], '榛子': ['nut'], '南瓜子(炒)': ['nut']
};
function foodEvTags(f) {
  if (!f) return [];
  if (FOOD_EV[f.n]) return FOOD_EV[f.n];
  const cat = f.cat, n = f.n;
  if (cat === '蔬菜') return ['veg'];
  if (cat === '水果') return ['fruit'];
  if (cat === '坚果') return ['nut'];
  if (cat === '水产') return ['fish', 'leanProt'];
  if (cat === '豆制品') return ['legume'];
  if (cat === '蛋奶') return /酸奶|牛奶|奶|奶酪|奶粉/.test(n) ? ['dairy'] : ['leanProt'];
  if (cat === '禽肉') return ['leanProt'];
  if (cat === '畜肉') return /猪肝|猪腰|猪肚|猪血|牛肚|牛舌|鸡肝|鸡胗/.test(n) ? ['leanProt'] : ['redMeat', 'leanProt'];
  if (cat === '油脂') return ['oil'];
  if (cat === '主食') return /燕麦|全麦|糙米|藜麦|荞麦|玉米|红薯|紫薯/.test(n) ? ['grain'] : ['refined'];
  return [];
}
function tagGrade(tag) { return (EVID[tag] && EVID[tag].ev) || 'mid'; }
function planGrade(items) {
  let g = 'strong', hasNeg = false, tags = [];
  items.forEach(it => {
    const f = DB.find(x => x.n === it[0]);
    const ts = foodEvTags(f);
    if (!ts.length) g = 'weak';
    ts.forEach(t => {
      tags.push(t);
      if (EVID[t] && EVID[t].neg) hasNeg = true;
      const r = EV_RANK[tagGrade(t)];
      if (r < EV_RANK[g]) g = tagGrade(t);
    });
  });
  if (hasNeg) return { g: 'neg', tags, caution: '' };
  return { g, tags, caution: tags.includes('redMeat') ? EVID.redMeat.caution : '' };
}
function allowedByDiet(name) {
  const d = state.profile.diet || {};
  const f = DB.find(x => x.n === name);
  const cat = f ? f.cat : '';
  if (d.vegetarian && (/畜肉|禽肉|水产/.test(cat) || /肉|鱼|虾|蟹|贝|蛤|鱿|肝|血|培根|火腿|香肠|蚝油|鱼丸/.test(name))) return false;
  if (d.noSeafood && cat === '水产') return false;
  if (d.noPork && (/猪/.test(name) || /培根|火腿|香肠|午餐肉|火腿肠/.test(name))) return false;
  if (d.noBeef && /牛/.test(name)) return false;
  if (d.noOffal && /肝|腰|肚|血|胗|舌/.test(name)) return false;
  if (d.noLactose && (/奶|奶酪|黄油|炼乳|奶粉|冰淇淋|拿铁/.test(name) || cat === '蛋奶' && /奶/.test(name))) return false;
  return true;
}

/* ================= 按目标推荐餐单 ================= */
const PLAN_TPL = {
  breakfast: [
    { id: 'b1', n: '燕麦牛奶 + 鸡蛋 + 蓝莓', mode: 'cut', tags: ['高蛋白', '快手'], items: [['燕麦片(干)', 40], ['脱脂牛奶', 200], ['鸡蛋', 100], ['蓝莓', 50]], note: '燕麦提供 β-葡聚糖与缓释碳水；鸡蛋补蛋白；蓝莓补水果。' },
    { id: 'b2', n: '全麦三明治（蛋 + 生菜番茄）', mode: 'cut', tags: ['快手', '便宜'], items: [['全麦面包', 70], ['鸡蛋', 100], ['生菜', 40], ['番茄', 100]], note: '全麦面包 + 蛋 + 蔬菜，10 分钟能做完。' },
    { id: 'b3', n: '希腊酸奶燕麦碗', mode: 'any', tags: ['高蛋白', '快手'], items: [['希腊酸奶(原味)', 180], ['燕麦片(干)', 35], ['香蕉', 100], ['核桃', 10]], note: '蛋白密度高；坚果只放 10 g，避免热量超标。' },
    { id: 'b4', n: '增肌燕麦碗（全脂奶 + 香蕉 + 花生）', mode: 'bulk', tags: ['高碳水', '快手'], items: [['燕麦片(干)', 70], ['全脂牛奶', 250], ['香蕉', 120], ['花生(生)', 15]], note: '提高碳水与热量密度；花生按 15 g 计，别整把吃。' },
    { id: 'b5', n: '饭团式早餐（米饭 + 蛋 + 奶酪）', mode: 'bulk', tags: ['高碳水', '便宜'], items: [['米饭(熟)', 200], ['鸡蛋', 150], ['奶酪(切达)', 20], ['橄榄油', 5]], note: '适合吃不下冷食的人；奶酪少量提味。' }
  ],
  lunch: [
    { id: 'l1', n: '鸡胸 + 糙米 + 西兰花', mode: 'cut', tags: ['高蛋白', '低脂'], items: [['鸡胸肉', 150], ['糙米饭(熟)', 150], ['西兰花', 200], ['橄榄油', 8]], note: '经典减脂组合；油按 8 g 计，别用“不粘锅不用油”骗自己。' },
    { id: 'l2', n: '三文鱼 + 意面 + 菠菜', mode: 'cut', tags: ['高蛋白', '快手'], items: [['三文鱼', 120], ['意面(熟)', 150], ['菠菜', 150], ['橄榄油', 5]], note: '三文鱼提供 ω-3；意面选全麦更好。' },
    { id: 'l3', n: '豆腐 + 藜麦 + 菠菜', mode: 'any', tags: ['素食友好', '便宜'], items: [['北豆腐', 200], ['藜麦(生)', 60], ['菠菜', 150], ['橄榄油', 8]], note: '植物蛋白组合；藜麦按干重计。' },
    { id: 'l4', n: '牛里脊 + 米饭 + 胡萝卜', mode: 'bulk', tags: ['高碳水', '高蛋白'], items: [['牛里脊', 150], ['米饭(熟)', 250], ['胡萝卜', 100], ['植物油(大豆油)', 10]], note: '红肉每周控制在 500 g 熟重以内，这顿已占一部分。' },
    { id: 'l5', n: '鸡腿 + 米饭 + 西兰花', mode: 'bulk', tags: ['便宜', '高碳水'], items: [['鸡腿肉', 180], ['米饭(熟)', 250], ['西兰花', 150], ['橄榄油', 8]], note: '鸡腿比鸡胸便宜，去皮可减约 1/3 脂肪。' },
    { id: 'l6', n: '虾仁 + 糙米 + 彩椒', mode: 'any', tags: ['高蛋白', '低脂'], items: [['虾仁', 150], ['糙米饭(熟)', 150], ['彩椒', 150], ['橄榄油', 8]], note: '虾的蛋白密度高、脂肪低；对海鲜过敏者换鸡胸。' }
  ],
  dinner: [
    { id: 'd1', n: '清蒸鳕鱼 + 红薯 + 菠菜', mode: 'cut', tags: ['低脂', '快手'], items: [['鳕鱼', 150], ['红薯', 200], ['菠菜', 150], ['橄榄油', 8]], note: '红薯替代米饭，纤维更高；鳕鱼蒸 8 分钟即可。' },
    { id: 'd2', n: '虾仁豆腐 + 小白菜', mode: 'cut', tags: ['低脂', '快手'], items: [['虾仁', 150], ['南豆腐', 200], ['小白菜', 200], ['橄榄油', 8]], note: '高蛋白低脂，适合晚上；豆腐选南豆腐口感更嫩。' },
    { id: 'd3', n: '鸡胸 + 糙米 + 西兰花', mode: 'any', tags: ['高蛋白', '便宜'], items: [['鸡胸肉', 150], ['糙米饭(熟)', 150], ['西兰花', 200], ['橄榄油', 8]], note: '和午餐同款也可以，重复搭配更容易坚持。' },
    { id: 'd4', n: '三文鱼 + 米饭 + 牛油果', mode: 'bulk', tags: ['高碳水', '高蛋白'], items: [['三文鱼', 150], ['米饭(熟)', 250], ['菠菜', 150], ['牛油果', 50]], note: '热量密度高；牛油果 50 g 约半个小果。' },
    { id: 'd5', n: '牛肉炖土豆 + 胡萝卜', mode: 'bulk', tags: ['高碳水', '便宜'], items: [['牛肉(瘦)', 180], ['土豆', 250], ['胡萝卜', 100], ['植物油(大豆油)', 8]], note: '炖菜注意汤底盐分，汤别全喝。' },
    { id: 'd6', n: '鹰嘴豆 + 糙米 + 西兰花', mode: 'any', tags: ['素食友好', '便宜'], items: [['鹰嘴豆(干)', 60], ['糙米饭(熟)', 150], ['西兰花', 150], ['橄榄油', 8]], note: '鹰嘴豆按干重；提前泡发能减少胀气。' }
  ],
  pre: [
    { id: 'p1', n: '香蕉 + 无糖酸奶', mode: 'any', tags: ['快手', '低脂'], items: [['香蕉', 120], ['无糖酸奶', 150]], note: '练前 1–2 小时；低脂、少纤维，胃里不沉。' },
    { id: 'p2', n: '全麦面包 + 鸡蛋', mode: 'any', tags: ['快手', '便宜'], items: [['全麦面包', 60], ['鸡蛋', 50]], note: '中碳水 + 适量蛋白；鸡蛋半个到一个即可。' },
    { id: 'p3', n: '小份米饭 + 鸡胸', mode: 'cut', tags: ['低脂', '高蛋白'], items: [['米饭(熟)', 120], ['鸡胸肉', 70]], note: '适合下班后直接去练；别吃太饱。' },
    { id: 'p4', n: '燕麦 + 牛奶 + 香蕉（增肌版）', mode: 'bulk', tags: ['高碳水'], items: [['燕麦片(干)', 40], ['全脂牛奶', 200], ['香蕉', 100]], note: '练前 1–2 小时，碳水为主、蛋白适量。' }
  ]
};
const MEAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, pre: 0.10 };

function planCalc(items) {
  const rows = [], ex = { kcal: 0, pro: 0, fat: 0, carb: 0, fib: 0, na: 0 };
  for (const [n, g] of items) {
    const f = foodByName(n);
    if (!f) continue;
    const k = g / 100;
    ex.kcal += f.kcal * k; ex.pro += f.pro * k; ex.fat += f.fat * k;
    ex.carb += f.carb * k; ex.fib += f.fib * k; ex.na += (f.na || 0) * k;
    rows.push({
      n, g,
      kcal: Math.round(f.kcal * k),
      pro: Math.round(f.pro * k * 10) / 10,
      fat: Math.round(f.fat * k * 10) / 10,
      carb: Math.round(f.carb * k * 10) / 10,
      fib: Math.round(f.fib * k * 10) / 10,
      na: Math.round((f.na || 0) * k)
    });
  }
  const t = {
    kcal: Math.round(ex.kcal), pro: Math.round(ex.pro * 10) / 10,
    fat: Math.round(ex.fat * 10) / 10, carb: Math.round(ex.carb * 10) / 10,
    fib: Math.round(ex.fib * 10) / 10, na: Math.round(ex.na)
  };
  return { rows, t };
}
function planBudget() {
  const t = targets(), s = daySummary(todayISO());
  const remK = Math.max(0, t.kcal - s.kcal), remP = Math.max(0, t.protein - s.pro);
  return { t, s, remK, remP, low: remK < 300 };
}
function mealTarget(meal) {
  const b = planBudget();
  const share = MEAL_SHARE[meal] || 0.3;
  const k = Math.max(120, Math.round(Math.min(b.remK, b.t.kcal * share) / 10) * 10);
  const proEach = Math.round(0.4 * (+state.profile.weight || 70));
  const p = Math.max(12, Math.round(Math.min(b.remP, proEach * 1.2)));
  return { kcal: k, lo: Math.round(k * 0.85), hi: Math.round(k * 1.15), pro: Math.max(proEach, p), low: b.low };
}
function planPool(meal) {
  const mode = state.profile.mode;
  return PLAN_TPL[meal].filter(p => p.mode === 'any' || p.mode === mode || (mode === 'keep' && p.mode !== 'bulk'))
    .filter(p => p.items.every(([n]) => allowedByDiet(n)))
    .map(p => {
      const c = planCalc(p.items), gr = planGrade(p.items);
      return { ...p, ...c, grade: gr.g, tagsEv: gr.tags, caution: gr.caution };
    })
    .filter(p => p.grade !== 'neg')
    .filter(p => !S.evStrong || p.grade === 'strong')
    .sort((a, b) => EV_RANK[b.grade] - EV_RANK[a.grade] || Math.abs(a.t.kcal - mealTarget(meal).kcal) - Math.abs(b.t.kcal - mealTarget(meal).kcal));
}
function planRowsHtml(p) {
  return p.rows.map(r => `<div class="prow"><span>${esc(r.n)}</span><span class="muted">${r.g} g</span><span>${r.kcal}</span></div>`).join('');
}
function planCardHtml(p, meal, idx) {
  const mt = mealTarget(meal);
  const okK = p.t.kcal >= mt.lo && p.t.kcal <= mt.hi;
  const okP = p.t.pro >= mt.pro * 0.85;
  return `<div class="plan">
    <div class="row"><b>${esc(p.n)}</b>${evTag(p.grade)}</div>
    <div class="plan-tags">${p.tags.map(x => `<span class="tag src-USR">${x}</span>`).join('')}${p.caution ? `<span class="tag src-EST">红肉限量：${p.caution}</span>` : ''}</div>
    <div class="ptable">${planRowsHtml(p)}
      <div class="prow total"><span>合计</span><span>${p.t.kcal} kcal</span><span>蛋白 ${p.t.pro} g</span></div>
    </div>
    <div class="muted">目标 ${mt.lo}–${mt.hi} kcal / 蛋白 ≥${mt.pro} g；本套${okK && okP ? '在范围内' : (p.t.kcal > mt.hi ? '热量偏高' : p.t.kcal < mt.lo ? '热量偏低' : '') + (okP ? '' : '、蛋白偏低')}。脂肪 ${p.t.fat} g、碳水 ${p.t.carb} g、纤维 ${p.t.fib} g。</div>
    <div class="muted" style="margin-top:4px">${esc(p.note)}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm" data-act="planConfirm" data-meal="${meal}" data-plan="${p.id}">加入${planMealLabel(meal)}（可改克数）</button>
      <button class="link" data-act="planEvid" data-meal="${meal}" data-plan="${p.id}">依据 ›</button>
    </div>
  </div>`;
}
function viewPlan() {
  const p = state.profile, b = planBudget();
  const diet = p.diet || {};
  const mealOrder = ['breakfast', 'lunch', 'dinner', 'pre'];
  return `<div class="top"><div><h1>今日餐单</h1><div class="date">按${p.mode === 'cut' ? '减脂' : p.mode === 'bulk' ? '增肌' : '维持'}目标 · 剩余 ${b.remK} kcal / 蛋白 ${b.remP} g</div></div>
    <div class="act"><button class="icon-btn" data-act="back">‹</button></div></div>
  <div class="view">
    <div class="card">
      <div class="row"><h3 class="title-s">目标模式</h3><span class="muted">改模式会重算额度</span></div>
      <div class="seg" style="margin-top:8px">${['cut', 'keep', 'bulk'].map(m => `<button class="${p.mode === m ? 'on' : ''}" data-act="setMode" data-v="${m}">${m === 'cut' ? '减脂' : m === 'bulk' ? '增肌' : '维持'}</button>`).join('')}</div>
      ${b.low ? `<div class="banner warn" style="margin-top:10px">今天剩余额度只有 ${b.remK} kcal，餐单会按剩余额度缩小；如果已经吃过，请到“今天”页核对。</div>` : ''}
    </div>
    <div class="card">
      <div class="row"><h3 class="title-s">忌口与证据筛选</h3><span class="muted">立即生效</span></div>
      <div class="chip-wrap" style="margin-top:8px">
        ${[['noPork', '不吃猪肉'], ['noBeef', '不吃牛肉'], ['noOffal', '不吃内脏'], ['noLactose', '乳糖不耐'], ['noSeafood', '不吃水产'], ['vegetarian', '素食']].map(([k, n]) => `<button class="chip ${diet[k] ? 'on' : ''}" data-act="toggleDiet" data-k="${k}">${n}</button>`).join('')}
      </div>
      <div class="row" style="margin-top:12px">
        <div><b>只看强证据</b><div class="muted">只显示食物全部有强证据（RCT/meta/指南）的组合</div></div>
        <button class="switch ${S.evStrong ? 'on' : ''}" data-act="toggleEv"><i></i></button>
      </div>
      <div class="guard" style="margin-top:10px">食品层面很难有“确定有效”：长期随机对照试验很少，多数证据是观察性研究。所以我们给的是<b>证据等级</b>，不是保证。</div>
      <button class="link" data-act="allCites" style="margin-top:8px">全部依据与证据分级说明 ›</button>
    </div>
    ${mealOrder.map(meal => {
      const pool = planPool(meal).slice(0, 3);
      const mt = mealTarget(meal);
      return `<div class="card">
        <div class="row"><h3 class="title-s">${MEAL_NAME[meal]}</h3><span class="muted">目标 ${mt.lo}–${mt.hi} kcal · 蛋白 ≥${mt.pro} g</span></div>
        ${meal === 'pre' ? '<div class="muted" style="margin-top:2px">练前 1–2 小时：低脂、中碳水、适量蛋白、少纤维。练后正常吃下一餐即可，不必卡“30 分钟窗口”。</div>' : ''}
        ${pool.length ? pool.map((x, i) => planCardHtml(x, meal, i)).join('') : '<div class="empty">这个筛选条件下没有符合的搭配，试着放宽忌口或关掉“只看强证据”</div>'}
      </div>`;
    }).join('')}
    <div class="foot">这些是模板化搭配，不是定制食谱；营养值由食物库按克数逐项累加，实际以你称重的食材和烹饪用油为准。热量相同的食物，饱腹感和微量营养素并不相同。</div>
  </div>`;
}
function findPlan(meal, id) { return PLAN_TPL[meal].find(p => p.id === id); }
function planConfirmSheet(meal, id) {
  const p = findPlan(meal, id);
  if (!p) return;
  const rows = p.items.map(([n, g]) => `<div class="item"><div class="nm"><p>${esc(n)}</p><span>每 100g ${foodByName(n) ? foodByName(n).kcal : 0} kcal</span></div><input class="num" type="number" min="0" step="5" value="${g}" data-pg="${esc(n)}" style="width:76px"></div>`).join('');
  openSheet(`<h2>${esc(p.n)}</h2>
    <div class="muted">加入${planMealLabel(meal)}；克数可改，保存前会按你改后的克数重算。</div>
    <div style="margin-top:10px">${rows}</div>
    <div id="planPrev" class="plan-prev"></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">取消</button><button class="btn" data-act="savePlan" data-meal="${meal}" data-plan="${id}">确认加入</button></div>`, () => {
    const upd = () => {
      const items = $$('#sheetBody [data-pg]').map(inp => [inp.getAttribute('data-pg'), +inp.value || 0]);
      const c = planCalc(items);
      $('#planPrev').innerHTML = `<div class="ptable">${planRowsHtml({ rows: c.rows })}<div class="prow total"><span>合计</span><span>${c.t.kcal} kcal</span><span>蛋白 ${c.t.pro} g</span></div></div>`;
    };
    $$('#sheetBody [data-pg]').forEach(inp => inp.addEventListener('input', upd));
    upd();
  });
}

/* ================= 运动消耗计算器 ================= */
const EXLIB = [
  { id: 'strength', n: '力量训练', strength: true, cite: 'ainsworth', note: '汇编中抗阻训练条目本身已包含组间休息；不同动作、负荷与节奏差异很大，所以让你填组数与休息。',
    tiers: [{ n: '轻（器械/单组/休息长', met: 3.5, lo: 3.0, hi: 4.5 }, { n: '中（多组复合动作）', met: 5.0, lo: 4.0, hi: 6.0 }, { n: '高（大重量/循环少休息）', met: 6.0, lo: 5.5, hi: 8.0 }] },
  { id: 'run', n: '跑步', cite: 'ainsworth', note: '配速越快 MET 越高；跑步机与户外、坡度都会改变实际消耗。',
    tiers: [{ n: '6.4 km/h（慢跑）', met: 6.0, lo: 5.5, hi: 6.5 }, { n: '8 km/h', met: 8.3, lo: 8.0, hi: 8.6 }, { n: '9.6 km/h', met: 9.8, lo: 9.5, hi: 10.2 }, { n: '10 km/h（插值）', met: 10.0, lo: 9.8, hi: 11.0 }, { n: '11.2 km/h', met: 11.0, lo: 10.5, hi: 11.5 }, { n: '12.9 km/h', met: 11.8, lo: 11.5, hi: 12.3 }] },
  { id: 'walk', n: '快走', cite: 'ainsworth', note: '走路的速度与地形影响很大；上坡按坡度另加。',
    tiers: [{ n: '4.8 km/h', met: 3.5, lo: 3.0, hi: 4.0 }, { n: '5.6 km/h', met: 4.3, lo: 4.0, hi: 4.6 }, { n: '6.4 km/h', met: 5.0, lo: 4.5, hi: 5.5 }] },
  { id: 'bike', n: '骑车', cite: 'ainsworth', note: '通勤与训练差异大；功率计比 MET 准得多。',
    tiers: [{ n: '休闲 <16 km/h', met: 4.0, lo: 3.5, hi: 4.5 }, { n: '16–19 km/h', met: 6.8, lo: 6.0, hi: 7.5 }, { n: '20–22 km/h', met: 8.0, lo: 7.5, hi: 8.5 }, { n: '竞速 >25 km/h', met: 10.0, lo: 9.0, hi: 11.0 }] },
  { id: 'swim', n: '游泳', cite: 'ainsworth', note: '泳姿与技术水平影响大；水温也会改变消耗。',
    tiers: [{ n: '自由泳 慢/中', met: 5.8, lo: 5.0, hi: 6.5 }, { n: '自由泳 快', met: 9.8, lo: 9.0, hi: 10.5 }, { n: '蛙泳 休闲', met: 5.3, lo: 4.5, hi: 6.0 }] },
  { id: 'rope', n: '跳绳', cite: 'ainsworth', note: '节奏与是否双摇影响很大；新手常因停顿实际更低。',
    tiers: [{ n: '慢（<100 次/分）', met: 8.8, lo: 8.0, hi: 9.5 }, { n: '中（100–120 次/分）', met: 11.0, lo: 10.0, hi: 12.0 }, { n: '快（>120 次/分）', met: 12.3, lo: 11.5, hi: 13.0 }] },
  { id: 'hiit', n: 'HIIT / 间歇训练', cite: 'ainsworth', note: '汇编没有 HIIT 专项条目，取循环训练与自重高强度区间；间歇比不同差异很大。',
    tiers: [{ n: '低强度间歇', met: 6.0, lo: 5.0, hi: 7.0 }, { n: '中等（30s 冲/30s 歇）', met: 8.0, lo: 7.0, hi: 9.0 }, { n: '高强度（20s 冲/10s 歇）', met: 10.0, lo: 9.0, hi: 12.0 }] },
  { id: 'elliptical', n: '椭圆机', cite: 'ainsworth', note: '阻力与踏频决定强度；机器显示的热量通常偏高。',
    tiers: [{ n: '中等阻力', met: 5.0, lo: 4.5, hi: 5.5 }, { n: '高阻力', met: 8.0, lo: 7.0, hi: 9.0 }] },
  { id: 'badminton', n: '羽毛球', cite: 'ainsworth', note: '休闲对打与比赛差距很大。',
    tiers: [{ n: '休闲对打', met: 4.5, lo: 4.0, hi: 5.0 }, { n: '比赛', met: 7.0, lo: 6.0, hi: 8.0 }] },
  { id: 'basketball', n: '篮球', cite: 'ainsworth', note: '半场与全场、比赛与训练差异大。',
    tiers: [{ n: '一般练习', met: 6.5, lo: 5.5, hi: 7.5 }, { n: '比赛', met: 8.0, lo: 7.0, hi: 9.0 }] },
  { id: 'yoga', n: '瑜伽', cite: 'ainsworth', note: '哈他与流瑜伽差异很大；热瑜伽另计。',
    tiers: [{ n: '哈他/阴瑜伽', met: 2.5, lo: 2.0, hi: 3.0 }, { n: '流瑜伽/力量瑜伽', met: 4.0, lo: 3.5, hi: 5.0 }] },
  { id: 'stairs', n: '爬楼 / 爬坡', cite: 'ainsworth', note: '上楼 MET 高、下楼低；这里按持续上楼估算。',
    tiers: [{ n: '慢速上楼', met: 8.0, lo: 7.0, hi: 9.0 }, { n: '快速上楼', met: 10.0, lo: 9.0, hi: 11.0 }] },
  { id: 'row', n: '划船机', cite: 'ainsworth', note: '功率与桨频决定强度；机器读数比 MET 更贴近个人。',
    tiers: [{ n: '中等', met: 7.0, lo: 6.0, hi: 8.0 }, { n: '高强度', met: 8.5, lo: 8.0, hi: 9.5 }] },
  { id: 'soccer', n: '足球', cite: 'ainsworth', note: '比赛与训练差异大。',
    tiers: [{ n: '训练', met: 7.0, lo: 6.0, hi: 8.0 }, { n: '比赛', met: 10.0, lo: 9.0, hi: 11.0 }] },
  { id: 'hike', n: '徒步 / 登山', cite: 'ainsworth', note: '坡度与负重影响很大；这里按一般山地徒步。',
    tiers: [{ n: '一般徒步', met: 6.0, lo: 5.0, hi: 7.0 }, { n: '负重爬升', met: 8.0, lo: 7.0, hi: 9.0 }] }
];
function latestWeight() {
  const w = (state.weights || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  return w ? w.kg : (+state.profile.weight || 75);
}
function exCompute(v) {
  const lib = EXLIB.find(x => x.id === v.type) || EXLIB[0];
  const tier = lib.tiers[v.tier] || lib.tiers[0];
  const kg = +v.kg || 75, age = +v.age || 28, hr = +v.hr || 0;
  let totalMin = +v.min || 30, workMin = 0, restMin = 0;
  if (lib.strength && +v.sets > 0) {
    workMin = +v.sets * 0.75;
    restMin = +v.sets * (+v.rest || 1.5);
    totalMin = workMin + restMin;
  }
  let met = tier.met, metNote = '';
  if (lib.strength && workMin > 0 && totalMin > 0) {
    const ws = Math.max(0.15, Math.min(0.9, workMin / totalMin));
    met = tier.lo + (tier.hi - tier.lo) * ws;
    metNote = `按你填的运动/休息比（运动 ${Math.round(workMin)} 分钟、休息 ${Math.round(restMin)} 分钟）在 ${tier.lo}–${tier.hi} 之间插值；这是本应用的近似，不是汇编原文算法。`;
  }
  const h = totalMin / 60;
  const gross = met * kg * h;
  const net = Math.max(0, (met - 1) * kg * h);
  const up = v.level === 'novice' ? 0.22 : v.level === 'adv' ? 0.15 : 0.20;
  const lvlTxt = v.level === 'novice' ? '新手：动作经济性差，实际常偏区间上限'
    : v.level === 'adv' ? '高级：动作更省力，实际常偏区间下限（但未找到可核验的固定下调系数，因此不改中心值）'
    : '中级：取区间中值';
  let hrGross = 0, hrNet = 0;
  if (hr >= 80) {
    const sex = state.profile.sex === 'female' ? 'female' : 'male';
    const perMin = sex === 'male'
      ? (-55.0969 + 0.6309 * hr + 0.1988 * kg + 0.2017 * age) / 4.184
      : (-20.4022 + 0.4472 * hr - 0.1263 * kg + 0.074 * age) / 4.184;
    hrGross = Math.max(0, perMin * totalMin);
    hrNet = Math.max(0, hrGross - kg * h);
  }
  return { lib, tier, met, metNote, totalMin, workMin, restMin, h, kg, gross, net, lo: gross * 0.88, hi: gross * (1 + up), netLo: net * 0.88, netHi: net * (1 + up), hr, hrGross, hrNet, lvlTxt, epocLo: net * 0.06, epocHi: net * 0.15 };
}
function exResultHtml(r, v) {
  return `<div class="calc">
    <div class="calc-row"><span>运动时长</span><b>${Math.round(r.totalMin)} 分钟</b></div>
    ${v.type === 'strength' && +v.sets > 0 ? `<div class="calc-row"><span>运动 / 休息</span><b>${Math.round(r.workMin)} / ${Math.round(r.restMin)} 分钟</b></div>` : ''}
    <div class="calc-row"><span>MET（取用）</span><b>${r.met.toFixed(1)}</b></div>
    <div class="calc-row big"><span>总消耗（含静息）</span><b>${Math.round(r.gross)} kcal</b></div>
    <div class="calc-row big"><span>净额外消耗 ${r.met > 1 ? '(MET−1)' : ''}</span><b>${Math.round(r.net)} kcal</b></div>
    <div class="muted">总消耗 = MET × 体重 × 小时，包含你躺着也会消耗的那部分；净额外 = (MET−1) × 体重 × 小时，才是运动额外多消耗的。很多人/App 把两者混用，就会重复计算。</div>
    <div class="muted" style="margin-top:4px">个体区间：总 ${Math.round(r.lo)}–${Math.round(r.hi)} kcal，净 ${Math.round(r.netLo)}–${Math.round(r.netHi)} kcal（误差约 ±10–25%）。${r.lvlTxt}</div>
    ${r.metNote ? `<div class="muted" style="margin-top:4px">${r.metNote}</div>` : ''}
    ${r.hr >= 80 ? `<div class="hrbox"><div class="calc-row"><span>心率法（Keytel）总消耗</span><b>${Math.round(r.hrGross)} kcal</b></div>
      <div class="calc-row"><span>心率法 净额外</span><b>${Math.round(r.hrNet)} kcal</b></div>
      <div class="muted">心率法用年龄/性别/体重/心率估算，通常比通用 MET 更贴近你个人；但只在次最大强度稳态运动下较可信，间歇、力量训练误差更大。</div></div>`
      : '<div class="muted" style="margin-top:6px">填了运动心率（例如 140）可以用心率法对照，通常更贴近个体。</div>'}
    <div class="muted" style="margin-top:6px">EPOC（运动后额外消耗）常见量级约为净消耗的 6–15%，已包含在上面的范围内，不额外再加，避免夸大。</div>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="saveEx">加入今天的运动记录</button>
      <button class="link" data-act="cite" data-ids="ainsworth,keytel,laForgia,shcherbina">依据 ›</button></div>
  </div>`;
}
function exerciseSheet() {
  const t0 = EXLIB[0];
  openSheet(`<h2>运动消耗计算器</h2>
    <div class="muted">先选运动与强度档，再填时长/体重。结果同时给总消耗与净额外消耗。</div>
    <div class="field" style="margin-top:10px"><label>运动类型</label>
      <select id="exType">${EXLIB.map((x, i) => `<option value="${x.id}" ${i === 0 ? 'selected' : ''}>${x.n}</option>`).join('')}</select></div>
    <div class="field"><label>强度档位</label><select id="exTier">${t0.tiers.map((t, i) => `<option value="${i}">${t.n}（MET ${t.met}）</option>`).join('')}</select></div>
    <div class="two">
      <div class="field"><label>时长（分钟）</label><input class="num" id="exMin" type="number" min="1" step="5" value="30"></div>
      <div class="field"><label>体重（kg）</label><input class="num" id="exKg" type="number" min="30" step="0.1" value="${latestWeight()}"></div>
    </div>
    <div class="two" id="strengthBox" style="display:none">
      <div class="field"><label>组数</label><input class="num" id="exSets" type="number" min="0" step="1" value="4"></div>
      <div class="field"><label>组间休息（分钟）</label><input class="num" id="exRest" type="number" min="0" step="0.5" value="1.5"></div>
    </div>
    <div class="two">
      <div class="field"><label>训练水平</label><select id="exLevel"><option value="novice">新手</option><option value="mid" selected>中级</option><option value="adv">高级</option></select></div>
      <div class="field"><label>运动心率（可选，次/分）</label><input class="num" id="exHr" type="number" min="0" max="220" step="1" placeholder="如 140"></div>
    </div>
    <div id="exOut" style="margin-top:8px"></div>
    <div class="guard">MET 是人群平均值，不是你的个人值；设备与 App 的热量估算误差通常 ±10–25%。这里给区间而不是单点。</div>`, () => {
    const read = () => ({
      type: $('#exType').value, tier: +$('#exTier').value, min: +$('#exMin').value,
      kg: +$('#exKg').value, sets: +$('#exSets').value, rest: +$('#exRest').value,
      level: $('#exLevel').value, hr: +$('#exHr').value
    });
    const fillTiers = () => {
      const lib = EXLIB.find(x => x.id === $('#exType').value) || EXLIB[0];
      $('#exTier').innerHTML = lib.tiers.map((t, i) => `<option value="${i}">${t.n}（MET ${t.met}）</option>`).join('');
      $('#strengthBox').style.display = lib.strength ? '' : 'none';
    };
    const upd = () => { const v = read(); lastEx = { v, r: exCompute(v) }; $('#exOut').innerHTML = exResultHtml(lastEx.r, v); };
    $('#exType').addEventListener('change', () => { fillTiers(); upd(); });
    ['exTier', 'exMin', 'exKg', 'exSets', 'exRest', 'exLevel', 'exHr'].forEach(id => $('#' + id).addEventListener('input', upd));
    upd();
  });
}
function planEvidSheet(meal, id) {
  const p = findPlan(meal, id);
  if (!p) return;
  const rows = p.items.map(([n]) => {
    const f = foodByName(n), tags = foodEvTags(f);
    return `<div class="evrow"><div><b>${esc(n)}</b><div class="muted">${tags.map(t => EVID[t] ? EVID[t].label : '').filter(Boolean).join('、') || '—'}</div></div>
      ${tags.length ? evTag(tagGrade(tags[0])) : evTag('weak')}</div>
      ${tags.map(t => EVID[t] ? `<div class="muted" style="margin-left:8px">· ${EVID[t].why}<button class="cite" data-act="cite" data-ids="${EVID[t].ids.join(',')}">依据 ›</button></div>` : '').join('')}`;
  }).join('');
  openSheet(`<h2>这套餐单的依据</h2>
    <div class="guard" style="margin-top:8px">食品层面的“确定有效”其实很有限：长期随机对照试验很难做，多数证据是观察性研究。所以我们给的是<b>证据等级</b>，不是保证。</div>
    <div style="margin-top:10px">${rows}</div>
    <div class="muted" style="margin-top:10px">整体等级取这套里最弱的一环；含加工肉、含糖饮料、油炸食品的组合不会出现在推荐里。</div>`);
}

/* ================= 动作与入口 ================= */
const PLAN_MEAL = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', pre: 'snack' };
function planMealLabel(m) { return m === 'pre' ? '练前加餐' : (MEAL_NAME[m] || m); }
let lastEx = null;

function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
}
function exportCSV() {
  const rows = [['日期', '餐次', '食物', '克数(g)', '热量(kcal)', '蛋白质(g)', '脂肪(g)', '碳水(g)', '膳食纤维(g)', '钠(mg)', '钾(mg)', '来源', '是否修改']];
  state.entries.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.ts || 0) - (b.ts || 0)).forEach(e => {
    const r = e.g / 100, b = e.base || {};
    rows.push([e.d, MEAL_NAME[e.m] || e.m, e.n, e.g, Math.round((b.kcal || 0) * r), round((b.pro || 0) * r, 1), round((b.fat || 0) * r, 1), round((b.carb || 0) * r, 1), round((b.fib || 0) * r, 1), Math.round((b.na || 0) * r), Math.round((b.k || 0) * r), SRC[e.src] ? SRC[e.src].tag : e.src, e.edited ? '已改' : '']);
  });
  const csv = '\uFEFF' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  download('饮食记录-' + todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
  toast('已导出 CSV（' + (rows.length - 1) + ' 条）');
}
function exportJSON() {
  download('饮食备份-' + todayISO() + '.json', JSON.stringify(state, null, 1), 'application/json');
  toast('已导出 JSON 备份');
}
function importJSON() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const file = inp.files[0]; if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d || !Array.isArray(d.entries)) throw new Error('格式不对');
        state = Object.assign(defaultState(), d);
        state.profile = Object.assign(defaultState().profile, d.profile || {});
        state.settings = Object.assign(defaultState().settings, d.settings || {});
        state.weights = (state.weights || []).map(w => w.t ? w : { id: w.id || uid(), d: w.d, t: 'am', kg: w.kg, ts: w.ts || Date.parse(w.d) || Date.now() });
        dayCache.clear(); rebuildDB(); save(); closeSheet(); S.screen = ''; S.tab = 'today'; render();
        toast('已导入 ' + state.entries.length + ' 条记录');
      } catch (err) { toast('导入失败：' + err.message); }
    };
    fr.readAsText(file);
  };
  inp.click();
}

/* ---- 扫码 ---- */
let scanStream = null, scanRAF = null;
function stopScan() {
  if (scanRAF) cancelAnimationFrame(scanRAF); scanRAF = null;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
}
function scanSheet(extra) {
  openSheet(`<div class="sheet-h"><div><h2>扫条码</h2><div class="muted">查 Open Food Facts，查不到可手动输入</div></div><button class="x" data-act="closeSheet">×</button></div>
    ${extra || ''}
    <div class="field"><label>条码（也可手动输入）</label><div class="grid2">
      <input id="bc" type="tel" inputmode="numeric" placeholder="如 6901234567890">
      <button class="btn sm" data-act="offLookup">查询</button></div></div>
    <div class="muted">Open Food Facts 数据由志愿者上传，包装食品的数值可能有误；以包装上的营养成分表为准。</div>`);
}
async function openScan() {
  if (!('BarcodeDetector' in window)) {
    scanSheet('<div class="guard">这个浏览器不支持条码识别（安卓 Chrome 支持）。可以直接输入条码查询，或手动填营养表。</div>');
    return;
  }
  scanSheet('<div class="scan-box" id="scanBox"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div><div class="scan-tip">对准包装上的条码，2 秒内自动识别</div></div>');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#scanVideo'); v.srcObject = scanStream; await v.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    const loop = async () => {
      if (!scanStream) return;
      try {
        const codes = await det.detect(v);
        if (codes && codes.length) { const code = codes[0].rawValue; stopScan(); await lookupOFF(code); return; }
      } catch (e) { }
      scanRAF = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    stopScan();
    scanSheet('<div class="guard">打不开摄像头：' + esc(e.message || '权限被拒绝') + '。可以直接输入条码或手动填营养。</div>');
  }
}
async function lookupOFF(code) {
  code = String(code || '').replace(/\D/g, '');
  if (!code) return toast('请输入条码');
  toast('查询中…');
  try {
    const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json', { signal: ctrl.signal });
    clearTimeout(tm);
    const j = await res.json();
    if (j.status !== 1 || !j.product) {
      scanSheet(`<div class="banner warn">没查到条码 ${esc(code)}。可以手动填营养成分表，保存后复用。</div>
        <div class="quick-wrap"><button class="btn sm" data-act="customFood">手动填营养表</button><button class="btn sm ghost" data-act="scan">再扫一次</button></div>`);
      return;
    }
    const pr = j.product, nu = pr.nutriments || {};
    const kcal = nu['energy-kcal_100g'] != null ? +nu['energy-kcal_100g'] : (nu['energy_100g'] != null ? +nu['energy_100g'] / 4.184 : 0);
    const f = {
      n: (pr.product_name_zh || pr.product_name || ('条码 ' + code)) + (pr.brands ? '（' + pr.brands + '）' : ''),
      a: pr.generic_name || '', cat: '加工食品', ed: 100, st: '制品', src: 'OFF',
      kcal: Math.round(kcal), pro: +(nu.proteins_100g || 0), fat: +(nu.fat_100g || 0), carb: +(nu.carbohydrates_100g || 0),
      fib: +(nu.fiber_100g || 0), na: nu.sodium_100g != null ? Math.round(+nu.sodium_100g * 1000) : Math.round((+nu.salt_100g || 0) * 400), k: +(nu.potassium_100g || 0) * 1000,
      py: '', pf: ''
    };
    state.custom = state.custom.filter(x => x.n !== f.n).concat(f);
    rebuildDB(); save();
    const fi = foodByName(f.n);
    foodDetailSheet(f.n);
    toast('已从 Open Food Facts 取到数据，确认克数后加入');
  } catch (e) {
    scanSheet(`<div class="banner warn">查询失败（${esc(e.name === 'AbortError' ? '超时' : e.message)}）。没网也能继续：手动填营养表。</div>
      <div class="quick-wrap"><button class="btn sm" data-act="customFood">手动填营养表</button></div>`);
  }
}

/* ---- 体重 / 腰围 / 训练 ---- */
function weightSheet(t) {
  const w = latestWeight();
  openSheet(`<div class="sheet-h"><div><h2>记录${t === 'am' ? '晨起空腹' : '晚间'}体重</h2><div class="muted">同一台秤、同一位置、尽量同一时刻</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="grid2"><div class="field"><label>体重 kg</label><input id="wkg" type="number" step="0.1" inputmode="decimal" value="${round(w, 1)}"></div>
    <div class="field"><label>日期</label><input id="wd" type="date" value="${todayISO()}"></div></div>
    <button class="btn block" data-act="saveWeight" data-t="${t}">保存</button>
    <div class="muted" style="margin-top:8px">同一天同一时点会覆盖，不重复计数；缺一次不算断签。</div>`);
}
function waistSheet() {
  openSheet(`<div class="sheet-h"><div><h2>记腰围</h2><div class="muted">肚脐水平，呼气末测量</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="grid2"><div class="field"><label>腰围 cm</label><input id="wsCm" type="number" step="0.5" inputmode="decimal" value="${(state.waist.slice(-1)[0] || {}).cm || ''}"></div>
    <div class="field"><label>日期</label><input id="wsD" type="date" value="${todayISO()}"></div></div>
    <button class="btn block" data-act="saveWaist">保存</button>
    <div class="muted" style="margin-top:8px">每周一次即可；腰围比体重更能反映腹型脂肪的变化趋势。</div>`);
}
function liftSheet() {
  openSheet(`<div class="sheet-h"><div><h2>记训练表现</h2><div class="muted">用于判断是否在“重组”（体重不动但力量上升）</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="field"><label>动作</label><input id="lfEx" placeholder="如 深蹲 / 卧推 / 硬拉" value="${(state.lift.slice(-1)[0] || {}).ex || ''}"></div>
    <div class="grid2"><div class="field"><label>重量 kg</label><input id="lfKg" type="number" step="0.5" inputmode="decimal" value="${(state.lift.slice(-1)[0] || {}).kg || ''}"></div>
    <div class="field"><label>次数 × 组数</label><input id="lfReps" placeholder="如 8×3" value="${(state.lift.slice(-1)[0] || {}).reps || ''}"></div></div>
    <div class="field"><label>日期</label><input id="lfD" type="date" value="${todayISO()}"></div>
    <button class="btn block" data-act="saveLift">保存</button>`);
}

/* ---- 校准 / 文献 ---- */
function calSheet() {
  const c = calibration(state.settings.calWin), m = maintenanceEstimate();
  openSheet(`<div class="sheet-h"><div><h2>体重趋势校准</h2><div class="muted">滚动 ${c.win} 天窗口</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="kv"><div><b>${c.logged}/${c.win}</b><span>有记录天数</span></div>
      <div><b>${c.avgIntake || '—'}</b><span>平均摄入 kcal</span></div>
      <div><b>${c.ok ? c.delta + ' kg' : '—'}</b><span>体重变化</span></div>
      <div><b>${c.ok ? c.reverse : '—'}</b><span>反推 TDEE</span></div></div>
    ${c.ok ? `<div class="muted">公式：平均摄入 + 体重变化 × 7700 ÷ 天数 = ${c.avgIntake} + (${c.delta}) × 7700 ÷ ${c.span} ≈ ${c.reverse} kcal。可信度：${c.conf === 'high' ? '高' : c.conf === 'mid' ? '中' : '低'}（覆盖率 ${c.coverage}%）。</div>
      <div class="muted" style="margin-top:6px">融合值 ${m.value} kcal = 60% 反推 + 40% 公式（${m.formula}），区间 ${m.low}–${m.high}。</div>`
      : `<div class="guard">还不能校准：${esc(c.reason)}。至少需要 10 天饮食记录 + 7 天体重跨度。</div>`}
    <div class="muted" style="margin-top:8px">双标水法（DLW）是能量消耗的金标准，但需要实验室条件、网页应用做不到；所以这里用的是“公式 + 体重趋势校准”的替代方案，精度目标是接近而不是等同。</div>
    <button class="btn block" style="margin-top:10px" data-act="cite" data-ids="hall,wishnofsky,pontzer">校准依据 ›</button>`);
}
function allCitesSheet() {
  const keys = Object.keys(CITES).filter(k => !k.startsWith('_'));
  openSheet(`<div class="sheet-h"><div><h2>全部依据</h2><div class="muted">共 ${keys.length} 条，可点开核验</div></div><button class="x" data-act="closeSheet">×</button></div>
    <div class="guard">食品层面的“确定有效”其实很有限：长期随机对照试验很难做，多数证据是观察性研究，只能说“方向可靠、个体效果不保证”。所以我们给的是<b>证据等级</b>，而不是保证。</div>
    <div style="margin-top:10px">${keys.map(k => {
    const c = CITES[k];
    return `<div class="cite-card"><div class="row"><span class="st ${c.st.indexOf('指南') >= 0 || c.st.indexOf('立场') >= 0 ? 'a' : ''}">${esc(c.st)}</span>${evTag(evOf(k))}</div>
      <h4>${esc(c.claim)}</h4>
      <div class="meta">${esc(c.authors)}${c.year ? ' · ' + c.year : ''}${c.journal ? ' · ' + esc(c.journal) : ''}</div>
      <div class="meta">${esc(c.title)}</div>
      ${c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${esc(c.url)}</a>` : '<div class="meta" style="color:var(--warn);margin-top:4px">无可核验链接（已降级为共识）</div>'}
      <div class="lim">适用：${esc(c.pop)}<br>局限：${esc(c.lim)}</div></div>`;
  }).join('')}</div>`);
}

/* ---- 主分发 ---- */
const ACTIONS = {
  tab: el => { S.tab = el.dataset.v; S.screen = ''; render(); },
  back: () => { S.screen = ''; render(); },
  prevDay: () => { S.date = addDays(S.date, -1); render(); },
  nextDay: () => { S.date = addDays(S.date, 1); render(); },
  today: () => { S.date = todayISO(); render(); },
  goDate: el => { S.date = el.dataset.d; S.tab = 'today'; S.screen = ''; render(); },
  pickDate: () => {
    openSheet(`<h2>跳到日期</h2><div class="field"><label>日期</label><input id="dpD" type="date" value="${S.date}"></div>
      <button class="btn block" data-act="applyDate">确定</button>`);
  },
  applyDate: () => { S.date = $('#dpD').value || S.date; S.detailDate = S.date; closeSheet(); render(); },
  calPrev: () => { const b = parseISO(S.detailDate || todayISO()); b.setMonth(b.getMonth() - 1); S.detailDate = iso(b); render(); },
  calNext: () => { const b = parseISO(S.detailDate || todayISO()); b.setMonth(b.getMonth() + 1); S.detailDate = iso(b); render(); },
  dayDetail: el => { S.detailDate = el.dataset.d; render(); },
  setTrendWin: el => { S.trendWin = +el.dataset.v; render(); },
  setSrc: el => { S.srcFilter = el.dataset.v; render(); },
  setCat: el => { S.cat = el.dataset.v; render(); },
  goAdd: el => { S.meal = el.dataset.meal; S.q = ''; S.cat = '全部'; S.tab = 'food'; S.screen = ''; render(); setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 60); },
  quickAdd: el => foodDetailSheet(el.dataset.name),
  foodDetail: el => foodDetailSheet(el.dataset.name),
  addOil: () => addEntry(foodByName('植物油(大豆油)'), 10, S.meal, S.date),
  addNamed: el => addEntry(foodByName(el.dataset.name), +el.dataset.g || 100, S.meal, S.date),
  doAdd: el => {
    const g = +$('#addG').value, d = $('#addDate').value || S.date, m = $('#addMeal').value;
    addEntry(DB.find(x => x.n === el.getAttribute('data-name')), g, m, d);
  },
  editEntry: el => editEntrySheet(el.dataset.id),
  saveEntry: el => {
    const e = state.entries.find(x => x.id === el.dataset.id); if (!e) return;
    const g = +$('#eg').value, m = $('#em').value, d = $('#ed').value;
    if (!(g > 0)) return toast('克数要大于 0');
    clearDay(e.d); e.g = round(g, 1); e.m = m; e.d = d; e.edited = true; clearDay(d);
    save(); closeSheet(); render(); toast('已保存并重算');
  },
  delEntry: el => {
    const e = state.entries.find(x => x.id === el.dataset.id); if (!e) return;
    if (!confirm('删除「' + e.n + ' ' + e.g + 'g」？')) return;
    state.entries = state.entries.filter(x => x.id !== e.id);
    clearDay(e.d); save(); closeSheet(); render(); toast('已删除，汇总已重算');
  },
  toggleFav: el => {
    const n = el.dataset.name;
    state.fav = state.fav.includes(n) ? state.fav.filter(x => x !== n) : state.fav.concat(n);
    save(); foodDetailSheet(n);
  },
  customFood: () => customFoodSheet(),
  saveCustom: () => {
    const n = ($('#cfName').value || '').trim();
    if (!n) return toast('请填名称');
    const raw = +$('#cfEnergy').value, unit = $('#cfUnit').value;
    const kcal = unit === 'kj' ? raw / 4.184 : raw;
    if (!(kcal > 0)) return toast('请填能量');
    const f = {
      n, a: '', cat: $('#cfCat').value, ed: 100, st: $('#cfSt').value, src: 'USR',
      kcal: Math.round(kcal), pro: +$('#cfPro').value || 0, fat: +$('#cfFat').value || 0,
      carb: +$('#cfCarb').value || 0, fib: +($('#cfFib') ? $('#cfFib').value : 0) || 0,
      na: +($('#cfNa') ? $('#cfNa').value : 0) || 0, k: +($('#cfK') ? $('#cfK').value : 0) || 0, py: '', pf: ''
    };
    state.custom = state.custom.filter(x => x.n !== n).concat(f);
    rebuildDB(); save(); closeSheet(); render(); toast('已保存自建食物：' + n);
  },
  scan: () => openScan(),
  offLookup: () => lookupOFF($('#bc') ? $('#bc').value : ''),
  closeSheet: () => closeSheet(),
  cite: el => citeSheet(el.dataset.ids),
  allCites: () => allCitesSheet(),
  plan: () => { S.screen = 'plan'; render(); },
  planConfirm: el => planConfirmSheet(el.dataset.meal, el.dataset.plan),
  planEvid: el => planEvidSheet(el.dataset.meal, el.dataset.plan),
  savePlan: el => {
    const meal = el.dataset.meal, p = findPlan(meal, el.dataset.plan);
    const items = $$('#sheetBody [data-pg]').map(inp => [inp.getAttribute('data-pg'), +inp.value || 0]).filter(x => x[1] > 0);
    if (!items.length) return toast('克数都为 0，没东西可加');
    const em = PLAN_MEAL[meal] || 'snack';
    items.forEach(([n, g]) => {
      const f = foodByName(n); if (!f) return;
      state.entries.push({
        id: uid(), d: todayISO(), m: em, n: f.n, g: round(g, 1), src: f.src, ts: Date.now(),
        base: { kcal: f.kcal, pro: f.pro, fat: f.fat, carb: f.carb, fib: f.fib, na: f.na, k: f.k || 0 }
      });
      state.recents = [f.n].concat(state.recents.filter(x => x !== f.n)).slice(0, 10);
    });
    clearDay(todayISO()); save(); closeSheet(); S.date = todayISO(); S.tab = 'today'; S.screen = ''; render();
    toast('已加入' + planMealLabel(meal) + ' · ' + items.length + ' 项');
  },
  toggleDiet: el => {
    const k = el.dataset.k;
    state.profile.diet[k] = !state.profile.diet[k];
    save(); render();
  },
  toggleEv: () => { S.evStrong = !S.evStrong; render(); },
  setMode: el => { state.profile.mode = el.dataset.v; save(); render(); },
  setDeficit: el => { state.profile.deficit = +el.dataset.v; save(); render(); },
  setSurplus: el => { state.profile.surplus = +el.dataset.v; save(); render(); },
  setTdeeMode: el => { state.profile.tdeeMode = el.dataset.v; save(); render(); },
  saveProfile: () => {
    const p = state.profile;
    $$('[data-p]').forEach(inp => {
      const k = inp.getAttribute('data-p'), v = inp.value;
      p[k] = ['age', 'height', 'weight', 'steps', 'proteinPerKg'].includes(k) ? (+v || 0) : v;
    });
    if (p.age < 18) toast('未满 18 岁不建议用本应用的目标计算');
    save(); render(); toast('资料已保存，目标已重算');
  },
  editProfile: () => { S.tab = 'me'; S.screen = ''; render(); },
  saveNa: () => {
    const v = +$('#naLimit').value;
    if (v && v < 1000) return toast('拒绝：长期低于 1000 mg 钠有低钠血症风险');
    state.settings.naLimit = v ? Math.round(v) : '';
    save(); render(); toast('已更新钠上限');
  },
  energy: () => { S.screen = 'energy'; render(); },
  energySheet: () => { S.screen = 'energy'; render(); },
  addExercise: () => exerciseSheet(),
  exercise: () => exerciseSheet(),
  saveEx: () => {
    if (!lastEx) return toast('先填参数');
    const v = lastEx.v, r = lastEx.r;
    state.ex.push({
      id: uid(), d: todayISO(), type: v.type, n: r.lib.n + ' · ' + r.tier.n,
      min: Math.round(r.totalMin), met: round(r.met, 1), kcal: Math.round(r.net), hr: v.hr || '', ts: Date.now()
    });
    save(); closeSheet(); render(); toast('已加入今天的运动：净 +' + Math.round(r.net) + ' kcal');
  },
  delEx: el => {
    state.ex = state.ex.filter(x => x.id !== el.dataset.id); save(); render(); toast('已删除');
  },
  addWeight: el => weightSheet(el.dataset.t || 'am'),
  addWaist: () => waistSheet(),
  logLift: () => liftSheet(),
  saveWeight: el => {
    const t = el.dataset.t, kg = +$('#wkg').value, d = $('#wd').value || todayISO();
    if (!(kg > 20)) return toast('体重看起来不对');
    state.weights = state.weights.filter(w => !(w.d === d && (w.t || 'am') === t));
    state.weights.push({ id: uid(), d, t, kg: round(kg, 1), ts: Date.now() });
    state.profile.weight = round(kg, 1);
    save(); closeSheet(); render(); toast('已记录 ' + (t === 'am' ? '晨重' : '晚重'));
  },
  saveWaist: () => {
    const cm = +$('#wsCm').value, d = $('#wsD').value || todayISO();
    if (!(cm > 30)) return toast('腰围看起来不对');
    state.waist = state.waist.filter(w => w.d !== d).concat({ d, cm: round(cm, 1), ts: Date.now() });
    save(); closeSheet(); render(); toast('已记录腰围');
  },
  saveLift: () => {
    const ex = ($('#lfEx').value || '').trim();
    if (!ex) return toast('填一下动作');
    state.lift.push({ d: $('#lfD').value || todayISO(), ex, kg: +$('#lfKg').value || 0, reps: $('#lfReps').value || '', ts: Date.now() });
    save(); closeSheet(); render(); toast('已记录训练');
  },
  calSheet: () => calSheet(),
  applyCal: () => {
    const m = maintenanceEstimate();
    if (!m.calibrated) return toast('数据还不够，先连续记录');
    state.profile.tdeeBase = m.value; save(); render(); toast('已把 ' + m.value + ' kcal 设为目标基准');
  },
  clearCal: () => { delete state.profile.tdeeBase; save(); render(); toast('已恢复自动估算'); },
  exportCSV: () => exportCSV(),
  exportJSON: () => exportJSON(),
  importJSON: () => importJSON(),
  resetAll: () => {
    if (!confirm('清空本机所有饮食、体重和自建食物？不可恢复。')) return;
    if (!confirm('再确认一次：真的清空？')) return;
    localStorage.removeItem(LS); state = load(); dayCache.clear(); rebuildDB(); S.tab = 'today'; S.screen = ''; render(); toast('已清空');
  },
  settings: () => { S.tab = 'me'; S.screen = ''; render(); }
};

/* ---- 导航与渲染 ---- */
const NAV = [
  ['today', '今天', 'M4 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 7v5l3 2'],
  ['history', '历史', 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16'],
  ['food', '食物', 'M5 8h14l-1.5 12H6.5z M9 8a3 3 0 0 1 6 0'],
  ['weight', '体重', 'M4 7h16v12H4z M8 11a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M9 11h.01'],
  ['me', '我的', 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M5 20c1.5-4 4-5 7-5s5.5 1 7 5']
];
function renderNav() {
  const on = S.screen ? '' : S.tab;
  $('#nav').innerHTML = NAV.map(([k, n, d]) => `<button class="${on === k ? 'on' : ''}" data-act="tab" data-v="${k}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg><span>${n}</span></button>`).join('');
}
function bindInputs() {
  const q = $('#q');
  if (q) q.addEventListener('input', () => { S.q = q.value; $('#resultsWrap').innerHTML = resultsHtml(); });
  const hq = $('#hq');
  if (hq) hq.addEventListener('input', () => {
    S.histFood = hq.value;
    const box = $('#fdHist');
    if (box) box.innerHTML = S.histFood ? foodHistHtml(foodHistory(S.histFood)) : '<div class="muted" style="margin-top:8px">搜一个食物，看过去吃过几次、每次多少克、总共多少。</div>';
  });
}
function render() {
  const map = { today: viewToday, history: viewHistory, food: viewFood, weight: viewWeight, me: viewMe };
  let html;
  if (S.screen === 'energy') html = viewEnergy();
  else if (S.screen === 'plan') html = viewPlan();
  else html = (map[S.tab] || viewToday)();
  $('#view').innerHTML = html;
  renderNav();
  bindInputs();
  window.scrollTo(0, 0);
}

/* ---- 启动 ---- */
(function init() {
  if (!state.profile.diet) state.profile.diet = defaultState().profile.diet;
  if (!state.waist) state.waist = [];
  if (!state.lift) state.lift = [];
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  $('#overlay').addEventListener('click', closeSheet);
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }
})();



