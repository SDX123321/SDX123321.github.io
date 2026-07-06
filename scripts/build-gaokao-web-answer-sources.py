import json
import re
import urllib.request
from urllib.parse import quote, urlsplit, urlunsplit
from collections import Counter
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from PIL import Image
from rapidocr_onnxruntime import RapidOCR


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "src/data"
OUT_PATH = DATA_DIR / "gaokao-2026-web-answer-sources.json"
CACHE_DIR = REPO_ROOT / "tmp/gaokao-web-answer-ocr"

SOURCES = [
    {
        "id": "gaokzx-anhui-biology-2026",
        "family": "biology:anhui",
        "title": "2026年高考安徽生物试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156352.html",
    },
    {
        "id": "gaokzx-yunnan-chemistry-2026",
        "family": "chemistry:yunnan",
        "title": "2026年高考云南化学试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156668.html",
    },
    {
        "id": "gaokzx-hunan-history-2026",
        "family": "history:hunan",
        "title": "2026年高考湖南卷历史试题及答案（全）",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156388.html",
    },
    {
        "id": "zizzs-hunan-history-2026",
        "family": "history:hunan",
        "title": "2026年湖南高考历史试题及答案（全）",
        "pageUrl": "https://www.zizzs.com/gk/shitiku/222716.html",
        "imageUrlPattern": r"_00(?:0[1-9]|10)",
        "sourceName": "自主选拔在线",
    },
    {
        "id": "gaokzx-henan-history-2026",
        "family": "history:henan",
        "title": "2026年河南高考历史试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156387.html",
        "parseInlineAnswerBlocks": True,
        "parseSequentialChoiceAnswers": 16,
    },
    {
        "id": "zizzs-guangdong-geography-2026",
        "family": "geography:guangdong",
        "title": "2026年广东高考地理试题及答案（全）",
        "pageUrl": "https://www.zizzs.com/gk/shitiku/222652.html",
        "imageUrlPattern": r"_000[1-9]",
        "sourceName": "自主选拔在线",
    },
    {
        "id": "baidu-guangdong-geography-open-2026",
        "family": "geography:guangdong",
        "title": "2026年高考真题 地理（广东卷）开放题答案",
        "pageUrl": "https://tiku.baidu.com/tikupc/paperdetail/461f30dfd5bbfd0a795673f3",
        "sourceName": "百度题库",
        "manualAnswers": [
            {"number": 17, "answer": "原因：矿井废弃后，地下水位回升淹没含黄铁矿的煤层；黄铁矿与水、空气发生氧化反应，生成可溶性铁盐，使地下水成为富铁水体。过程：地表水沿岩溶管道、矿井、裂隙等下渗汇入采煤通道，形成富铁水体；受地势东高西低的影响，富铁水体自东向西向泉眼流动，泉眼位于断层破裂带，泉水由此溢出地表。"},
            {"number": 18, "answer": "（1）不同中草药对气象要素需求差异显著，多观测点可精准监测区域内气象条件差异，为不同品种中草药匹配适宜种植区；丘陵地形导致局地小气候复杂，水热条件空间分布差异大，多观测点有利于因地制宜布局种植品种；暴雨、干旱、低温冻害等气象灾害对中草药产量与品质影响大，多观测点可提前防范，减少损失，保障药材稳产提质；精准气象数据可优化灌溉、施肥、采收等农事管理，提升中药材品质与产量。（2）科技条件、政策与资金、基础设施与服务、品牌与市场、就业与人才、文化传承、产业结构优化升级等区位条件得以改善；理由分别为气象观测与数据分析提升科学管理，政校企合作提供支持，基础设施完善，特色品牌拓宽市场，文旅融合创造就业并吸引人才，中医药与旅游融合促进文化传承，由单一种植拓展旅游文创等新业态。（3）该镇拥有多样的地质资源与优质银杏资源，提升旅游资源独特性与观赏性；地质与文旅融合度高，可推动观光、研学融合发展，延长产业链、吸引游客、实现产业转型升级；国家地质文化镇知名度高，品牌效应强。"},
            {"number": 19, "answer": "（1）三叠系、侏罗系。（2）滑坡所在处为背斜构造，背斜顶部受张力作用，岩石破碎，易被风化侵蚀；后经流水等外力长期侵蚀、下切，最终形成谷地。（3）粉砂岩与粉砂质泥岩交错分布，粉砂质泥岩更软，易受风化侵蚀，形成差异侵蚀；粉砂质泥岩吸湿性较强，易吸收雨水软化，重量增加，易发生重力崩塌；较软岩层易在上覆岩层挤压下发生蠕动形变，形成结构性失稳。（4）连续多日降水，水分沿裂隙下渗，在地下深处积聚；顶部温度低于裂隙内，裂隙中的空气受热膨胀上升；水汽沿裂隙向上运动冒出地表，在裂隙出口处遇冷凝结，形成水汽升腾现象。"},
        ],
    },
    {
        "id": "zizzs-yunnan-history-2026",
        "family": "history:yunnan",
        "title": "2026年云南高考历史试题及答案",
        "pageUrl": "https://www.zizzs.com/gk/shitiku/223171.html",
        "imageUrlPattern": r"178174656",
        "sourceName": "自主选拔在线",
        "parseInlineAnswerBlocks": True,
        "parseTextChoiceTables": True,
    },
    {
        "id": "zizzs-heilongjiliao-physics-2026",
        "family": "physics:heilongjiliao",
        "title": "2026年黑吉辽蒙高考物理试题及答案",
        "pageUrl": "https://www.zizzs.com/gk/shitiku/222659.html",
        "imageUrlPattern": r"178245645",
        "sourceName": "自主选拔在线",
        "parsePlainNumberedAnswers": True,
    },
    {
        "id": "gaokzx-hunan-physics-2026",
        "family": "physics:hunan",
        "title": "2026年高考湖南卷物理试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156321.html",
        "pdfUrl": "https://cdn.gaokzx.com/zixunzhan/2026\u6e56\u5357\u9ad8\u8003\u771f\u9898\u7269\u7406   \u6709\u7b54\u68481781604136417.pdf",
        "sourceName": "北京高考在线",
        "parsePdfBracketAnswers": True,
    },
    {
        "id": "zizzs-heilongjiliao-chemistry-2026",
        "family": "chemistry:heilongjiliao",
        "title": "2026年黑吉辽蒙高考化学试题及答案",
        "pageUrl": "https://www.zizzs.com/gk/shitiku/222654.html",
        "imageUrlPattern": r"17811460|17811461",
        "sourceName": "自主选拔在线",
        "parseInlineAnswerBlocks": True,
    },
    {
        "id": "kaosj-shanghai-physics-2026",
        "family": "physics:shanghai",
        "title": "2026 Shanghai physics answer analysis",
        "pageUrl": "https://kaosj.com/papers/2026/06/2026-shanghai-gaokao-physics-analysis/",
        "sourceName": "kaosj.com",
        "manualAnswers": [
            {"number": 10, "answer": "t1"},
            {"number": 13, "answer": "d=R(1-sin theta)"},
            {"number": 14, "answer": "v0min=l*sqrt(g/(2h))"},
            {"number": 18, "answer": "v=pi*D/(2*N*T)"},
            {"number": 21, "answer": "a=27*n*(U2^2-U1^2)/(4*pi*B^2*L^2*R)"},
        ],
    },
    {
        "id": "baidu-shanghai-chemistry-2026",
        "family": "chemistry:shanghai",
        "title": "2026 Shanghai chemistry answer analysis",
        "pageUrl": "https://tiku.baidu.com/tikupc/paperdetail/dca0eae2910ef12d2af9e73a",
        "sourceName": "Baidu Tiku",
        "manualAnswers": [
            {"number": 14, "answer": "HO-C6H2(CH3)2-COOH (COOH-1, CH3-3/5, OH-4)"},
            {"number": 37, "answer": "0.36"},
        ],
    },
    {
        "id": "gaokzx-national1-english-2026",
        "family": "english:national1",
        "title": "2026年高考全国I卷英语试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156349.html",
    },
    {
        "id": "qisuen-national1-english-cloze-2026",
        "family": "english:national1",
        "title": "2026新高考I卷英语完形填空答案",
        "pageUrl": "https://qisuen.cn/resource/detail?id=134771",
        "sourceName": "奇速英语",
        "manualAnswers": [
            {"number": 51, "answer": "A"},
            {"number": 52, "answer": "B"},
            {"number": 53, "answer": "D"},
        ],
    },
    {
        "id": "gaokzx-national1-chinese-2026",
        "family": "chinese:national1",
        "title": "2026年高考全国I卷语文试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156295.html",
    },
    {
        "id": "gaokzx-beijing-math-answer-2026",
        "family": "math:beijing",
        "title": "2026年北京高考数学试卷参考答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156470.html",
        "pdfUrl": "https://cdn.xschu.com/zixunzhan/1781596760729%E3%80%8A2026%E5%B9%B4%E5%8C%97%E4%BA%AC%E9%AB%98%E8%80%83%E6%95%B0%E5%AD%A6%E8%AF%95%E5%8D%B7%E3%80%8B%E5%8F%82%E8%80%83%E7%AD%94%E6%A1%88.pdf",
        "sourceName": "北京高考在线",
    },
    {
        "id": "baidu-tiku-tianjin-math-2026",
        "family": "math:tianjin",
        "title": "2026\u5e74\u9ad8\u8003\u771f\u9898 \u6570\u5b66 (\u5929\u6d25\u5377)",
        "pageUrl": "https://tiku.baidu.com/tikupc/paperdetail/f02e253f482fb4daa58d4b95",
        "sourceName": "\u767e\u5ea6\u9898\u5e93",
        "manualAnswers": [
            {"number": 6, "answer": "A"},
            {"number": 7, "answer": "B"},
        ],
    },
    {
        "id": "cnjy-shanghai-spring-math-fill-2026",
        "family": "math:shanghai-spring",
        "title": "2026\u5e74\u4e0a\u6d77\u5e02\u6625\u5b63\u9ad8\u8003\u6570\u5b66\u586b\u7a7a\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://zy.21cnjy.com/25980046",
        "sourceName": "21\u4e16\u7eaa\u6559\u80b2\u7f51 + \u672c\u5730\u89e3\u6790\u7248WMF\u516c\u5f0f\u4eba\u5de5\u590d\u6838",
        "manualAnswers": [
            {"number": 1, "answer": "4"},
            {"number": 2, "answer": "(-2, 3)"},
            {"number": 5, "answer": "18"},
            {"number": 8, "answer": "1"},
            {"number": 10, "answer": "-39/32"},
            {"number": 11, "answer": "√3"},
            {"number": 12, "answer": "14.2"},
        ],
    },
    {
        "id": "baidu-shanghai-math-fill-open-2026",
        "family": "math:shanghai",
        "title": "2026\u5e74\u9ad8\u8003\u4e0a\u6d77\u5377\u6570\u5b66\u586b\u7a7a\u4e0e\u7edf\u8ba1\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://tiku.baidu.com/tikupc/paperdetail/f03bb5235727a5e9856a6191",
        "sourceName": "\u767e\u5ea6\u9898\u5e93 + \u672c\u5730\u89e3\u6790\u7248OCR\u4eba\u5de5\u590d\u6838",
        "manualAnswers": [
            {"number": 8, "answer": "0.6"},
            {"number": 12, "answer": "2/3"},
            {"number": 17, "answer": "（1）颗粒物密度高于二氧化硫密度的概率为7/9。（2）应选用散点图；两变量正相关，相关系数r的取值范围为(0,1)。（3）指数模型y₁=106.55e^(-0.461(x-2014))的预测误差更小。"},
        ],
    },
    {
        "id": "sjds-national1-math-open-2026",
        "family": "math:national1",
        "title": "2026\u5e74\u9ad8\u8003\u5168\u56fdI\u5377\u6570\u5b66\u586b\u7a7a\u4e0e\u89e3\u7b54\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://sjds.net/740707.html",
        "sourceName": "\u56db\u5b63\u8bfb\u4e66\u7f51 + \u672c\u5730\u89e3\u6790\u7248\u4eba\u5de5\u590d\u6838",
        "manualAnswers": [
            {"number": 12, "answer": "√(11/6)"},
            {"number": 14, "answer": "∛(3/2)"},
            {"number": 15, "answer": "（1）证明见解析。（2）直线DE到平面BCC₁B₁的距离为1。"},
            {"number": 16, "answer": "（1）cos A=1/3。（2）CE=3√5。"},
            {"number": 17, "answer": "（1）当N=4，p=1/3时，X的分布列为：P(X=1)=1/3，P(X=2)=2/9，P(X=3)=4/27，P(X=4)=8/27。（2）（i）当k≤N-1时，P(X>k)=(1-p)^k。（ii）当k+m≤N-1时，P(X>k+m|X>k)=P(X>m)。"},
        ],
    },
    {
        "id": "sjds-jiangsu-math-open-2026",
        "family": "math:数学江苏卷",
        "title": "2026年高考江苏卷数学填空与解答题参考答案",
        "pageUrl": "https://sjds.net/740707.html",
        "sourceName": "四季读书网 + 本地解析版人工复核",
        "manualAnswers": [
            {"number": 12, "answer": "√(11/6)"},
            {"number": 14, "answer": "∛(3/2)"},
            {"number": 17, "answer": "（1）当N=4，p=1/3时，X的分布列为：P(X=1)=1/3，P(X=2)=2/9，P(X=3)=4/27，P(X=4)=8/27。（2）（i）当k≤N-1时，P(X>k)=(1-p)^k。（ii）当k+m≤N-1时，P(X>k+m|X>k)=P(X>m)。"},
        ],
    },
    {
        "id": "sjds-national2-math-open-2026",
        "family": "math:national2",
        "title": "2026\u5e74\u9ad8\u8003\u5168\u56fdII\u5377\u6570\u5b66\u586b\u7a7a\u4e0e\u89e3\u7b54\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://sjds.net/a/500606.html",
        "sourceName": "\u56db\u5b63\u8bfb\u4e66\u7f51 + \u672c\u5730\u89e3\u6790\u7248\u4eba\u5de5\u590d\u6838",
        "manualAnswers": [
            {"number": 14, "answer": "5√3/4"},
            {"number": 15, "answer": "（1）第一四分位数为370，中位数为381。（2）（i）p̂=0.15。（ii）E(X)=15，D(X)=12.75。"},
            {"number": 16, "answer": "（1）证明见解析。（2）AD与平面ABC所成角的正弦值为√6/3。"},
            {"number": 17, "answer": "（1）证明见解析。（2）△ABC的周长为3+√2。"},
        ],
    },
    {
        "id": "baidu-anhui-biology-open-2026",
        "family": "biology:anhui",
        "title": "2026\u5e74\u9ad8\u8003\u5b89\u5fbd\u5377\u751f\u7269\u975e\u9009\u62e9\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://tiku.baidu.com/tikupc/paperdetail/b8c93459b307e87100f69600",
        "sourceName": "\u767e\u5ea6\u9898\u5e93",
        "manualAnswers": [
            {"number": 20, "answer": "（1）pH（酸碱度）；不会；胰蛋白酶会分解细胞膜上的蛋白质，处理时间过长会损伤细胞，导致细胞死亡；处理时间过短则细胞无法充分分散，影响后续培养。（2）②和④；将不含P基因的空质粒导入乳腺癌细胞（或仅导入空质粒的乳腺癌细胞）。（3）抑制；促进。"},
            {"number": 23, "answer": "（1）灭菌；互利共生；寄生。（2）负相关；缓解菊的种内竞争；接种根孢囊霉后，提高了菊对土壤中水和无机盐的吸收和利用，提高了叶片磷含量和单株生物量，减弱种内竞争。（3）密度制约因素。"},
        ],
    },
    {
        "id": "sohu-guangdong-history-open-2026",
        "family": "history:guangdong",
        "title": "2026\u5e74\u9ad8\u8003\u5e7f\u4e1c\u7701\u5386\u53f2\u5377\u975e\u9009\u62e9\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://www.sohu.com/a/1034062998_567589",
        "sourceName": "\u5386\u53f2\u6559\u80b2\u5bb6\uff08\u641c\u72d0\uff09",
        "manualAnswers": [
            {
                "number": 17,
                "answer": "（1）内容：将盐、铁等重要物资收归国家专卖或专营；政府垄断、控制盐铁的生产和销售，控制价格和利润；设置专门机构管理盐铁事务；严禁私人煮盐、冶铁，违者受罚。（2）原因：肯定者认为盐铁官营能增加国家财政收入，为对外战争和中央集权提供物质基础，并有利于抑制地方豪强商贾势力，加强中央对经济的控制，维护国家统一；否定者认为官府与民争利，加重百姓经济负担，官营体制腐败、效率低下、产品质次价高，扰乱社会经济秩序，并从儒家仁政、德治思想出发，主张政府不应过度干预经济，应与民休养生息。",
            },
            {
                "number": 18,
                "answer": "（1）性质：工农民主专政的政权，或劳动群众自己的政权。历史任务：领导工农劳苦大众进行土地革命，推翻国民党反动统治，消灭封建剥削，争取民族独立和人民解放。（2）原因：文革结束后，党和国家工作重心转移到社会主义现代化建设上来，急需大批科技、教育和管理人才；尊重知识、尊重人才的社会氛围需要法律保障，通过修宪提高知识分子地位，有利于调动其积极性；适应改革开放和现代化建设的迫切需要。（3）共同点：都以国家根本大法的形式巩固革命和建设成果，保障人民利益；都体现中国共产党与时俱进的执政理念，根据时代需要调整施政方针；都致力于维护国家统一、民族团结和推动社会发展；都坚持党的领导、人民当家作主和依法治国的有机统一。",
            },
            {
                "number": 19,
                "answer": "示例：论题：工业革命导致亚洲在世界经济中的占比急剧下降。论述：1750年，亚洲凭借传统农业和手工业在世界经济中占据重要地位；18世纪中期以后，英国率先开始工业革命，西方实现机械化生产，劳动效率大幅提高，而亚洲大部分国家仍固守传统制度，或遭受殖民侵略，错失工业化机遇。到1913年，亚洲经济总量占比明显下降。总结：工业文明对传统农业文明的冲击是此时期亚洲经济衰落的重要原因，落后就要挨打，发展才是硬道理。",
            },
            {
                "number": 20,
                "answer": "（1）史料价值：材料一是日本方面的文献，直接反映日本对唐朝先进文化的仰慕和学习态度，是探究唐朝对日本文化吸引力的重要证据；材料二是文学史料，虽有艺术加工，但可侧面佐证唐朝与日本的文化交流及两国文人的深厚情谊，需与其他史料互证；材料三是官方正史记载，记录唐朝官方对新罗的评价及交往，可用于研究唐朝与新罗的政治、文化关系及文化认同。（2）内容提要：唐朝国力强盛，文化高度发达，对周边国家形成强大文化辐射力。日本通过遣唐使、留学生和僧侣全面学习唐朝文化，在制度、文字、建筑、服饰、佛教等方面受到深刻影响；新罗也积极吸收唐朝官制、科举、儒学、佛教、历法、文学等。唐朝通过册封、朝贡、互市和佛教传播等方式，在东亚建立起以中华文化为核心的儒家文化圈或汉字文化圈，推动东亚文明共同进步。",
            },
        ],
    },
    {
        "id": "sjds-shanjinqingning-physics-open-2026",
        "family": "physics:shanjinqingning",
        "title": "2026\u5e74\u9ad8\u8003\u9655\u664b\u9752\u5b81\u5377\u7269\u7406\u975e\u9009\u62e9\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://sjds.net/752628.html",
        "sourceName": "\u56db\u5b63\u8bfb\u4e66\u7f51\u9898\u5e72 + \u672c\u5730\u7eaf\u7b54\u6848\u7248\u4eba\u5de5\u590d\u6838",
        "manualAnswers": [
            {"number": 11, "answer": "（1）B；（2）0.305 m/s；（3）1.28 m/s²。"},
            {"number": 12, "answer": "（1）①D；②增大；③423 Ω。（2）①A；②√(R₁R₂)。"},
            {
                "number": 13,
                "answer": "（1）p₁=p₀-ρgh₁=9.80×10⁴ Pa，p₂=p₁+ρgh₂=p₀+ρg(h₂-h₁)=1.01×10⁵ Pa。（2）ΔV=V₂-p₁V₁/p₀=1314 mL=1.314×10⁻³ m³。",
            },
            {
                "number": 14,
                "answer": "（1）μ₁=√2/10。（2）AB段机械能损失为2.88×10³ J，动量变化量大小为720 kg·m/s。（3）乙到达B点时与甲的距离为40 m。",
            },
            {
                "number": 15,
                "answer": "（1）0.6或0.8。（2）再次射入磁场后到达挡板P上的y坐标为2L/5或4L/5。（3）U>2mv₀²/q时，无粒子能到达O点，均无法打到P右侧面；0≤U≤16mv₀²/(17q)时，仅一个粒子能进入磁场，1个撞击点；16mv₀²/(17q)<U<2mv₀²/q时，两粒子均能进入且撞击点不同，2个撞击点；U=2mv₀²/q时，两粒子轨迹重合，1个撞击点。",
            },
        ],
    },
    {
        "id": "baidu-shanjinqingning-history-open-2026",
        "family": "history:shanjinqingning",
        "title": "2026\u5e74\u9ad8\u8003\u9655\u664b\u9752\u5b81\u5377\u5386\u53f2\u975e\u9009\u62e9\u9898\u53c2\u8003\u7b54\u6848",
        "pageUrl": "https://tiku.baidu.com/tikupc/paperdetail/76b248a7fd0a79563c1e728b",
        "sourceName": "\u767e\u5ea6\u9898\u5e93",
        "manualAnswers": [
            {
                "number": 17,
                "answer": "（1）清代边疆厅多直属中央，官员由中央选派；兼具民政、军政职能；面向多民族地区，因地制宜治理；设置持续时间较长。（2）有利于加强中央集权、巩固统一多民族国家；强化边疆治理和边防安全；促进边疆开发、商贸往来与民族交融；丰富古代国家治理和边疆治理经验。",
            },
            {
                "number": 18,
                "answer": "（1）设立专门管理机构并出台扶持政策；向牧民提供贷款等资金支持；引进、改良优良品种，建立兽医站点防治疫病；组织互助合作，统筹劳力和养殖资源；划定牧场、保护草场生态。（2）启示：坚持政府引导和政策扶持；因地制宜发展特色产业；重视科技赋能和人才支撑；坚持生态优先、可持续发展；发挥群众主体作用并完善利益联结机制。",
            },
            {
                "number": 19,
                "answer": "（1）古希腊城邦民主政治、公共生活和宗教庆典为戏剧兴起提供环境；中世纪教会借宗教剧传播教义，使戏剧延续；文艺复兴时期商品经济发展、市民阶层壮大和赞助制度提供支撑；人文主义兴起推动题材与思想内涵丰富。（2）戏剧作为文化传播载体，承载城邦文化、宗教文化和世俗市民文化；培养公民意识，传播人文主义，冲击封建神学束缚，推动民众思想解放和社会思想变革。",
            },
            {
                "number": 20,
                "answer": "示例：论题：水利工程的建设与利用深刻影响文明发展和国家治理。论述：战国都江堰兼具防洪、灌溉和水运功能，使成都平原成为重要农业区，体现国家组织动员能力；隋代大运河沟通南北水系，促进经济文化交流并加强中央对南方的控制，但过度役使民力也加剧社会矛盾。古埃及依托尼罗河定期泛滥形成历法、土地丈量和统一水利管理，推动早期中央集权国家形成；近代苏伊士运河缩短东西方航程，改变国际贸易和地缘政治格局。综上，水的治理与利用既塑造文明形态，也体现国家治理能力并影响历史走向。",
            },
        ],
    },
]


def read_url(url: str) -> bytes:
    parts = urlsplit(url)
    url = urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe="/%"), quote(parts.query, safe="=&?/%"), parts.fragment))
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def source_image_urls(page_url: str) -> list[str]:
    html = read_url(page_url).decode("utf-8", "ignore")
    urls = []
    patterns = [
        r"(?:https?:)?//cdn\.gaokzx\.com/zixunzhan/_[^\"'<> ]+?\.(?:png|jpg|jpeg|webp)",
        r"(?:https?:)?//cdn\.zizzs\.com/zixunzhan/[^\"'<> ]+?\.(?:png|jpg|jpeg|webp)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, html, re.I):
            url = match.group(0)
            if url.startswith("//"):
                url = "https:" + url
            if "cdn.gaokzx.com" in url and not re.search(r"/_\d+_\d+\.(?:png|jpg|jpeg|webp)$", url, re.I):
                continue
            if url not in urls:
                urls.append(url)
    return urls


def cache_key(source_id: str, image_url: str) -> Path:
    suffix = re.sub(r"[^A-Za-z0-9]+", "-", image_url.rsplit("/", 1)[-1]).strip("-")
    return CACHE_DIR / source_id / f"{suffix}.json"


def pdf_cache_path(source_id: str) -> Path:
    return CACHE_DIR / source_id / "source.pdf"


def ocr_image(ocr: RapidOCR, source_id: str, image_url: str) -> list[dict]:
    cache_path = cache_key(source_id, image_url)
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(BytesIO(read_url(image_url))).convert("RGB")
    result, _ = ocr(image)
    items = []
    for box, text, score in result or []:
        text = re.sub(r"\s+", " ", text.strip())
        if not text or score < 0.5:
            continue
        items.append({
            "text": text,
            "score": round(float(score), 3),
            "top": round(min(point[1] for point in box), 1),
            "left": round(min(point[0] for point in box), 1),
        })
    cache_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return items


def pdf_text_lines(source_id: str, pdf_url: str) -> list[str]:
    cache_path = pdf_cache_path(source_id)
    if not cache_path.exists():
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(read_url(pdf_url))
    reader = PdfReader(str(cache_path))
    lines = []
    for page in reader.pages:
        text = page.extract_text() or ""
        for line in text.splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if line:
                lines.append(line)
    return lines


def row_lines(items: list[dict], tolerance: int = 16) -> list[str]:
    rows = []
    for item in sorted(items, key=lambda value: (value["top"], value["left"])):
        for row in rows:
            if abs(row["top"] - item["top"]) <= tolerance:
                row["items"].append(item)
                row["top"] = min(row["top"], item["top"])
                break
        else:
            rows.append({"top": item["top"], "items": [item]})
    lines = []
    for row in sorted(rows, key=lambda value: value["top"]):
        parts = [item["text"] for item in sorted(row["items"], key=lambda value: value["left"])]
        line = re.sub(r"\s+", " ", " ".join(parts)).strip()
        if line:
            lines.append(line)
    return lines


def parse_choice_tables(page_items: list[dict]) -> dict[int, str]:
    answers = {}
    for heading in [item for item in page_items if "题号" in item["text"]]:
        numbers = []
        choices = []
        for item in page_items:
            if item["top"] < heading["top"] - 20 or item["top"] > heading["top"] + 110:
                continue
            text = item["text"].strip()
            if re.fullmatch(r"\d{1,2}", text):
                number = int(text)
                if 1 <= number <= 100:
                    numbers.append({"number": number, "left": item["left"]})
            elif item["top"] > heading["top"] + 20 and re.fullmatch(r"[A-G]", text):
                choices.append({"answer": text, "left": item["left"]})
        used = set()
        for number_item in numbers:
            ranked = sorted(
                ((abs(choice["left"] - number_item["left"]), index, choice) for index, choice in enumerate(choices) if index not in used),
                key=lambda value: value[0],
            )
            if ranked and ranked[0][0] <= 45:
                _, index, choice = ranked[0]
                used.add(index)
                answers.setdefault(number_item["number"], choice["answer"])
    return answers


def clean_answer(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^【答案】", "", text)
    text = re.sub(r"^[:：]\s*", "", text)
    return text.strip()


def parse_bracket_heading_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if not line or re.match(r"^第\d+页/共\d+页$", line):
            continue
        heading = re.match(r"^【(?P<number>\d{1,2})题答案】", line)
        if heading:
            flush()
            current_number = int(heading.group("number"))
            current_lines = []
            continue
        answer = re.match(r"^【答案】(?P<body>.*)$", line)
        if answer and current_number is not None:
            body = answer.group("body").strip()
            choice = re.match(r"^([A-D])(?:\s|$)", body)
            if current_number <= 16 and choice:
                current_lines.append(choice.group(1))
                flush()
                continue
            current_lines.append(body)
            continue
        if current_number is not None:
            if re.match(r"^【(?:解析|详解|分析)】", line):
                flush()
                continue
            current_lines.append(line)
    flush()
    return answers


def parse_plain_numbered_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if not line or re.match(r"^第\d+页", line):
            continue
        match = re.match(r"^(?P<number>\d{1,2})[.．]\s*(?P<body>.+)$", line)
        if match:
            flush()
            current_number = int(match.group("number"))
            body = match.group("body").strip()
            if current_number <= 10 and re.fullmatch(r"[A-D]{1,4}", body):
                answers.setdefault(current_number, body)
                current_number = None
                current_lines = []
                continue
            current_lines = [body]
            continue
        if current_number is not None:
            if re.match(r"^(?:一、|二、|三、|【)", line):
                flush()
                continue
            current_lines.append(line)
    flush()
    return answers


def parse_inline_answer_blocks(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    answer_number = None
    answer_lines = []

    def flush() -> None:
        nonlocal answer_number, answer_lines
        if answer_number is None:
            return
        answer = clean_answer(" ".join(answer_lines))
        if answer:
            answers.setdefault(answer_number, answer)
        answer_number = None
        answer_lines = []

    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if not line or re.match(r"^第\d+页", line):
            continue
        question = re.match(r"^(?P<number>\d{1,2})[.．](?!\d)\s*", line)
        if question:
            flush()
            current_number = int(question.group("number"))
            continue
        answer = re.match(r"^【答案】(?P<body>.*)$", line)
        if answer and current_number is not None:
            flush()
            body = answer.group("body").strip()
            choice = re.fullmatch(r"[A-D]{1,4}", body)
            if current_number <= 15 and choice:
                answers.setdefault(current_number, body)
                continue
            answer_number = current_number
            answer_lines = [body] if body else []
            continue
        if answer_number is not None:
            if re.match(r"^【(?:解析|详解|分析)】", line):
                flush()
                continue
            answer_lines.append(line)
    flush()
    return answers


def parse_sequential_choice_answers(lines: list[str], count: int) -> dict[int, str]:
    answers = {}
    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        match = re.match(r"^【答案】\s*([A-D])\s*$", line)
        if not match:
            continue
        number = len(answers) + 1
        if number > count:
            break
        answers[number] = match.group(1)
    return answers


def parse_text_choice_tables(lines: list[str]) -> dict[int, str]:
    answers = {}
    for index, line in enumerate(lines):
        if not line.strip().startswith("题号"):
            continue
        answer_line = next((candidate.strip() for candidate in lines[index + 1 : index + 4] if candidate.strip().startswith("答案")), "")
        if not answer_line:
            continue
        numbers = [int(value) for value in re.findall(r"\d{1,2}", line)]
        choices = re.findall(r"(?<![A-Z])[A-GV]{1,4}(?![A-Z])", answer_line)
        for number, answer in zip(numbers, choices):
            if re.fullmatch(r"[A-G]{1,4}", answer):
                answers.setdefault(number, answer)
    return answers


def parse_written_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        match = re.match(r"^(?P<number>\d{1,2})[.．]\s*【答案】\s*(?P<body>.*)$", line)
        if match:
            flush()
            current_number = int(match.group("number"))
            current_lines = [match.group("body").strip()]
            continue
        if current_number is not None:
            if re.match(r"^\d{1,2}[.．]\s*【答案】", line):
                flush()
                continue
            if "【解析】" in line or "【分析】" in line or re.match(r"^【小问\d+详解】", line):
                flush()
                continue
            current_lines.append(line)
    flush()
    return answers


def parse_english_sequences(lines: list[str]) -> dict[int, str]:
    answers = {}
    text = "\n".join(lines)
    for match in re.finditer(r"(?P<start>\d{1,2})\s*[-~—]\s*(?P<end>\d{1,2})\s*[:：]?\s*(?P<body>[A-G\s]{2,40})", text):
        start = int(match.group("start"))
        end = int(match.group("end"))
        sequence = re.findall(r"[A-G]", match.group("body"))
        if 0 < start <= end and len(sequence) >= end - start + 1:
            for offset, answer in enumerate(sequence[: end - start + 1]):
                answers.setdefault(start + offset, answer)
    return answers


def parse_pdf_choice_tables(lines: list[str]) -> dict[int, str]:
    answers = {}
    for index, line in enumerate(lines):
        if "题号" not in line:
            continue
        answer_line = next((candidate for candidate in lines[index + 1 : index + 4] if "答案" in candidate), "")
        if not answer_line:
            continue
        numbers = [int(value) for value in re.findall(r"\d{1,2}", line)]
        choices = re.findall(r"(?<![A-Z])[A-G]{1,4}(?![A-Z])", answer_line)
        if len(choices) >= len(numbers):
            for number, answer in zip(numbers, choices):
                answers.setdefault(number, answer)
    return answers


def parse_pdf_numbered_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        match = re.match(r"^(?P<number>\d{1,2})[．.]\s*(?P<body>.*)$", line)
        if match:
            flush()
            number = int(match.group("number"))
            body = match.group("body").strip()
            if number <= 10 and re.fullmatch(r"[A-G]", body):
                current_number = None
                current_lines = []
                continue
            current_number = number
            current_lines = [body]
            continue
        if current_number is not None:
            current_lines.append(line)
    flush()
    return answers


def parse_pdf_bracket_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    in_answers = False
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if not line or re.match(r"^第\d+页", line):
            continue
        if "参考答案" in line:
            in_answers = True
            flush()
            continue
        if not in_answers:
            continue
        match = re.match(r"^(?P<number>\d{1,2})[.．]\s*【答案】\s*(?P<body>.*)$", line)
        if match:
            flush()
            current_number = int(match.group("number"))
            body = match.group("body").strip()
            current_lines = [body] if body else []
            continue
        if current_number is not None:
            if re.match(r"^【(?:详解|解析|分析|小问\s*\d+\s*详解)】", line):
                flush()
                continue
            current_lines.append(line)
    flush()
    return answers


def build_source(source: dict, ocr: RapidOCR) -> dict:
    if source.get("manualAnswers"):
        answers = [
            {
                "number": int(item["number"]),
                "answer": item["answer"],
                "confidence": "reviewed-web-text",
            }
            for item in source["manualAnswers"]
            if item.get("answer")
        ]
        return {
            **source,
            "sourceName": source.get("sourceName", "reviewed public web text"),
            "imageCount": 0,
            "imageUrls": [],
            "answers": answers,
        }

    if source.get("pdfUrl"):
        lines = pdf_text_lines(source["id"], source["pdfUrl"])
        answer_map = parse_pdf_choice_tables(lines)
        if source.get("parsePdfBracketAnswers"):
            answer_map.update(parse_pdf_bracket_answers(lines))
        else:
            answer_map.update(parse_pdf_numbered_answers(lines))
        answers = [
            {
                "number": number,
                "answer": answer,
                "confidence": "web-pdf-text",
            }
            for number, answer in sorted(answer_map.items())
            if answer
        ]
        return {
            **source,
            "sourceName": source.get("sourceName", "public web PDF"),
            "imageCount": 0,
            "imageUrls": [],
            "answers": answers,
        }

    image_urls = source_image_urls(source["pageUrl"])
    if source.get("imageUrlPattern"):
        image_urls = [url for url in image_urls if re.search(source["imageUrlPattern"], url)]
    page_items = [ocr_image(ocr, source["id"], url) for url in image_urls]
    lines = []
    answer_map: dict[int, str] = {}
    for items in page_items:
        answer_map.update(parse_choice_tables(items))
        lines.extend(row_lines(items))
    answer_map.update(parse_bracket_heading_answers(lines))
    if source.get("parseInlineAnswerBlocks"):
        answer_map.update(parse_inline_answer_blocks(lines))
    if source.get("parseSequentialChoiceAnswers"):
        answer_map.update(parse_sequential_choice_answers(lines, int(source["parseSequentialChoiceAnswers"])))
    if source.get("parseTextChoiceTables"):
        answer_map.update(parse_text_choice_tables(lines))
    if source.get("parsePlainNumberedAnswers"):
        answer_map.update(parse_plain_numbered_answers(lines))
    answer_map.update(parse_written_answers(lines))
    if source["family"].startswith("english:"):
        answer_map.update(parse_english_sequences(lines))
    answers = [
        {
            "number": number,
            "answer": answer,
            "confidence": "web-ocr",
        }
        for number, answer in sorted(answer_map.items())
        if answer
    ]
    return {
        **source,
        "sourceName": source.get("sourceName", "北京高考在线"),
        "imageCount": len(image_urls),
        "imageUrls": image_urls,
        "answers": answers,
    }


def main() -> None:
    ocr = RapidOCR()
    sources = [build_source(source, ocr) for source in SOURCES]
    by_family = Counter()
    for source in sources:
        by_family[source["family"]] += len(source["answers"])
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "note": "Web answer maps from public gaokzx.com article image pages and reviewed public PDF answer files. Review source URLs before relying on open-ended answers.",
        },
        "summary": {
            "sources": len(sources),
            "answers": sum(len(source["answers"]) for source in sources),
            "byFamily": dict(by_family),
        },
        "sources": sources,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {payload['summary']['answers']} web answer entries")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
