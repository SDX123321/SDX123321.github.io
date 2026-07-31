use super::*;

#[allow(dead_code)]
struct ConceptSeed {
    label: &'static str,
    chapter: &'static str,
    keywords: &'static [&'static str],
    summary: &'static str,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GraphSourceSeed {
    pub(crate) key: String,
    pub(crate) title: String,
    kind: String,
    revision: String,
    #[serde(default)]
    pub(crate) url: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubjectGraphSeed {
    pub(crate) revision: String,
    #[serde(default)]
    subject: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    pub(crate) sources: Vec<GraphSourceSeed>,
    pub(crate) modules: Vec<SubjectModuleSeed>,
    pub(crate) cross_links: Vec<(String, String, String)>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubjectModuleSeed {
    pub(crate) key: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) pages: String,
    #[serde(default)]
    pub(crate) source_key: String,
    #[serde(default)]
    pub(crate) locator: String,
    pub(crate) method: String,
    pub(crate) mistake: String,
    pub(crate) question_type: String,
    pub(crate) formula: String,
    pub(crate) concepts: Vec<String>,
}
impl SubjectGraphSeed {
    fn normalized(mut self, fallback_subject: &str) -> Self {
        if self.subject.is_empty() {
            self.subject = fallback_subject.to_string();
        }
        if self.sources.is_empty() && !self.source.is_empty() {
            self.sources.push(GraphSourceSeed {
                key: "primary".into(),
                title: self.source.clone(),
                kind: "pdf".into(),
                revision: self.revision.clone(),
                url: None,
            });
        }
        for module in &mut self.modules {
            if module.source_key.is_empty() {
                module.source_key = self
                    .sources
                    .first()
                    .map(|s| s.key.clone())
                    .unwrap_or_default();
            }
            if module.locator.is_empty() && !module.pages.is_empty() {
                module.locator = format!("第 {} 页", module.pages);
            }
        }
        self
    }
}

pub(crate) fn seeded_graph(subject: &str) -> Option<anyhow::Result<SubjectGraphSeed>> {
    let raw = match subject {
        "math" => include_str!("../../data/math-knowledge-graph-v1.json"),
        "chinese" => include_str!("../../data/chinese-knowledge-graph-v1.json"),
        "english" => include_str!("../../data/english-knowledge-graph-v1.json"),
        _ => return None,
    };
    Some(
        serde_json::from_str(raw)
            .map(|seed: SubjectGraphSeed| seed.normalized(subject))
            .map_err(Into::into),
    )
}

#[allow(dead_code)]
fn math_concept_catalog() -> &'static [ConceptSeed] {
    &[
        ConceptSeed {
            label: "集合与元素",
            chapter: "集合与逻辑",
            keywords: &["集合", "子集", "交集", "并集"],
            summary: "理解集合、元素及集合间关系，熟练进行交集、并集与补集运算。",
        },
        ConceptSeed {
            label: "命题与量词",
            chapter: "集合与逻辑",
            keywords: &["命题", "充分条件", "必要条件", "全称量词", "存在量词"],
            summary: "判断命题真假，理解充分必要条件以及全称、存在量词的否定。",
        },
        ConceptSeed {
            label: "基本不等式",
            chapter: "不等式",
            keywords: &["基本不等式", "均值不等式", "不等式"],
            summary: "利用基本不等式求最值，并准确检查正数、定值与等号成立条件。",
        },
        ConceptSeed {
            label: "一元二次不等式",
            chapter: "不等式",
            keywords: &["一元二次不等式", "二次不等式", "判别式"],
            summary: "结合二次函数图像、根与判别式求解一元二次不等式。",
        },
        ConceptSeed {
            label: "函数概念与表示",
            chapter: "函数",
            keywords: &["函数", "定义域", "值域", "解析式"],
            summary: "从对应关系理解函数，掌握定义域、值域与常用表示方法。",
        },
        ConceptSeed {
            label: "函数单调性",
            chapter: "函数",
            keywords: &["单调性", "单调递增", "单调递减", "单调区间"],
            summary: "使用定义、图像或导数判断函数的单调区间。",
        },
        ConceptSeed {
            label: "函数奇偶性",
            chapter: "函数",
            keywords: &["奇偶性", "奇函数", "偶函数", "对称"],
            summary: "根据定义域与函数关系判断奇偶性，并利用图像对称性解决问题。",
        },
        ConceptSeed {
            label: "函数零点",
            chapter: "函数",
            keywords: &["零点", "方程的根", "二分法"],
            summary: "理解函数零点与方程根的联系，利用图像和零点存在定理判断根。",
        },
        ConceptSeed {
            label: "指数函数",
            chapter: "基本初等函数",
            keywords: &["指数函数", "指数幂", "指数"],
            summary: "掌握指数运算与指数函数图像、单调性及参数变化规律。",
        },
        ConceptSeed {
            label: "对数函数",
            chapter: "基本初等函数",
            keywords: &["对数函数", "对数", "换底公式"],
            summary: "掌握对数运算、换底公式以及对数函数的图像和性质。",
        },
        ConceptSeed {
            label: "幂函数",
            chapter: "基本初等函数",
            keywords: &["幂函数"],
            summary: "比较典型幂函数的定义域、奇偶性、单调性和图像特征。",
        },
        ConceptSeed {
            label: "三角函数",
            chapter: "三角函数",
            keywords: &["三角函数", "正弦", "余弦", "正切"],
            summary: "理解任意角三角函数，掌握单位圆、图像、周期与基本性质。",
        },
        ConceptSeed {
            label: "三角恒等变换",
            chapter: "三角函数",
            keywords: &["和差角", "二倍角", "恒等变换", "诱导公式"],
            summary: "运用诱导公式、和差角与倍角公式完成化简、求值和证明。",
        },
        ConceptSeed {
            label: "解三角形",
            chapter: "三角函数",
            keywords: &["正弦定理", "余弦定理", "解三角形"],
            summary: "利用正弦定理、余弦定理和面积公式求解三角形及实际测量问题。",
        },
        ConceptSeed {
            label: "平面向量",
            chapter: "向量",
            keywords: &["平面向量", "向量", "数量积"],
            summary: "掌握向量的线性运算、坐标表示和数量积的几何意义。",
        },
        ConceptSeed {
            label: "等差数列",
            chapter: "数列",
            keywords: &["等差数列", "公差"],
            summary: "掌握等差数列通项、前 n 项和及其基本性质。",
        },
        ConceptSeed {
            label: "等比数列",
            chapter: "数列",
            keywords: &["等比数列", "公比"],
            summary: "掌握等比数列通项、前 n 项和及其基本性质。",
        },
        ConceptSeed {
            label: "数列递推与求和",
            chapter: "数列",
            keywords: &["递推", "错位相减", "裂项相消", "数列求和"],
            summary: "由递推关系求通项，并使用错位相减、裂项相消等方法求和。",
        },
        ConceptSeed {
            label: "空间几何体",
            chapter: "立体几何",
            keywords: &["空间几何体", "棱柱", "棱锥", "球", "体积"],
            summary: "认识空间几何体结构，掌握表面积、体积和直观图。",
        },
        ConceptSeed {
            label: "空间线面关系",
            chapter: "立体几何",
            keywords: &["线面平行", "线面垂直", "面面平行", "面面垂直"],
            summary: "使用判定与性质定理证明空间中的平行、垂直关系。",
        },
        ConceptSeed {
            label: "直线与圆",
            chapter: "解析几何",
            keywords: &["直线方程", "圆的方程", "直线与圆"],
            summary: "建立直线与圆的方程，研究位置关系、距离及弦长问题。",
        },
        ConceptSeed {
            label: "圆锥曲线",
            chapter: "解析几何",
            keywords: &["椭圆", "双曲线", "抛物线", "圆锥曲线"],
            summary: "理解圆锥曲线定义、标准方程和几何性质，处理定点定值问题。",
        },
        ConceptSeed {
            label: "导数与切线",
            chapter: "导数",
            keywords: &["导数", "切线", "瞬时变化率"],
            summary: "理解导数的几何意义，计算基本函数导数并求曲线切线。",
        },
        ConceptSeed {
            label: "导数研究函数",
            chapter: "导数",
            keywords: &["极值", "最值", "导数", "单调区间"],
            summary: "利用导数研究函数单调性、极值、最值以及参数范围。",
        },
        ConceptSeed {
            label: "计数原理与排列组合",
            chapter: "计数原理",
            keywords: &["排列", "组合", "计数原理"],
            summary: "使用分类、分步计数原理以及排列组合模型解决计数问题。",
        },
        ConceptSeed {
            label: "二项式定理",
            chapter: "计数原理",
            keywords: &["二项式定理", "二项式系数"],
            summary: "掌握二项展开式、通项与二项式系数性质。",
        },
        ConceptSeed {
            label: "古典概型",
            chapter: "概率统计",
            keywords: &["古典概型", "概率", "样本空间"],
            summary: "建立样本空间，使用计数方法求等可能事件的概率。",
        },
        ConceptSeed {
            label: "统计与数据分析",
            chapter: "概率统计",
            keywords: &["平均数", "方差", "标准差", "频率分布", "统计"],
            summary: "使用统计图表和数字特征描述数据，理解抽样与估计。",
        },
    ]
}

#[allow(dead_code)]
fn math_prerequisites() -> &'static [(&'static str, &'static str)] {
    &[
        ("集合与元素", "命题与量词"),
        ("集合与元素", "函数概念与表示"),
        ("函数概念与表示", "函数单调性"),
        ("函数概念与表示", "函数奇偶性"),
        ("函数概念与表示", "函数零点"),
        ("函数概念与表示", "指数函数"),
        ("函数概念与表示", "对数函数"),
        ("函数概念与表示", "幂函数"),
        ("函数单调性", "导数研究函数"),
        ("导数与切线", "导数研究函数"),
        ("三角函数", "三角恒等变换"),
        ("三角恒等变换", "解三角形"),
        ("平面向量", "解三角形"),
        ("等差数列", "数列递推与求和"),
        ("等比数列", "数列递推与求和"),
        ("直线与圆", "圆锥曲线"),
        ("空间几何体", "空间线面关系"),
        ("计数原理与排列组合", "古典概型"),
        ("计数原理与排列组合", "二项式定理"),
        ("统计与数据分析", "古典概型"),
        ("基本不等式", "导数研究函数"),
        ("一元二次不等式", "函数零点"),
    ]
}

#[cfg(test)]
mod subject_graph_tests {
    use super::{seeded_graph, SubjectGraphSeed};
    use std::collections::{HashMap, HashSet, VecDeque};

    fn assert_valid_seed(seed: &SubjectGraphSeed, expected_subject: &str) {
        let valid_relations = HashSet::from([
            "prerequisite",
            "part_of",
            "related",
            "derived_from",
            "applies_to",
            "contrasts_with",
        ]);
        assert_eq!(seed.subject, expected_subject);
        assert!(!seed.revision.is_empty());
        assert!(!seed.sources.is_empty());
        assert!(seed.modules.iter().all(|module| {
            !module.key.is_empty()
                && !module.name.is_empty()
                && !module.locator.is_empty()
                && !module.method.is_empty()
                && !module.mistake.is_empty()
                && !module.question_type.is_empty()
                && !module.formula.is_empty()
                && !module.concepts.is_empty()
        }));

        let mut labels = HashSet::<String>::new();
        for module in &seed.modules {
            assert!(labels.insert(module.name.clone()), "duplicate module label");
            for concept in &module.concepts {
                assert!(
                    labels.insert(concept.clone()),
                    "duplicate concept label: {concept}"
                );
            }
        }
        assert!(seed.cross_links.iter().all(|(source, target, relation)| {
            source != target
                && labels.contains(source)
                && labels.contains(target)
                && valid_relations.contains(relation.as_str())
        }));

        let mut adjacency: HashMap<String, Vec<String>> = labels
            .iter()
            .map(|label| (label.clone(), Vec::new()))
            .collect();
        for module in &seed.modules {
            for concept in &module.concepts {
                adjacency
                    .get_mut(&module.name)
                    .unwrap()
                    .push(concept.clone());
                adjacency
                    .get_mut(concept)
                    .unwrap()
                    .push(module.name.clone());
            }
            if expected_subject == "math" {
                for pair in module.concepts.windows(2) {
                    adjacency.get_mut(&pair[0]).unwrap().push(pair[1].clone());
                    adjacency.get_mut(&pair[1]).unwrap().push(pair[0].clone());
                }
            }
        }
        for (source, target, _) in &seed.cross_links {
            adjacency.get_mut(source).unwrap().push(target.clone());
            adjacency.get_mut(target).unwrap().push(source.clone());
        }
        let start = labels.iter().next().unwrap().clone();
        let mut visited = HashSet::from([start.clone()]);
        let mut queue = VecDeque::from([start]);
        while let Some(label) = queue.pop_front() {
            for neighbor in &adjacency[&label] {
                if visited.insert(neighbor.clone()) {
                    queue.push_back(neighbor.clone());
                }
            }
        }
        assert_eq!(visited.len(), labels.len(), "seed graph must be connected");

        let mut indegree: HashMap<String, usize> =
            labels.iter().map(|label| (label.clone(), 0)).collect();
        let mut directed: HashMap<String, Vec<String>> = HashMap::new();
        for (source, target, relation) in &seed.cross_links {
            if relation == "prerequisite" {
                directed
                    .entry(source.clone())
                    .or_default()
                    .push(target.clone());
                *indegree.get_mut(target).unwrap() += 1;
            }
        }
        let mut ready: VecDeque<String> = indegree
            .iter()
            .filter(|(_, degree)| **degree == 0)
            .map(|(label, _)| label.clone())
            .collect();
        let mut processed = 0;
        while let Some(label) = ready.pop_front() {
            processed += 1;
            for target in directed.get(&label).into_iter().flatten() {
                let degree = indegree.get_mut(target).unwrap();
                *degree -= 1;
                if *degree == 0 {
                    ready.push_back(target.clone());
                }
            }
        }
        assert_eq!(
            processed,
            labels.len(),
            "prerequisite relations must be acyclic"
        );
    }

    #[test]
    fn all_seeded_subject_graphs_are_complete_and_valid() {
        for subject in ["math", "chinese", "english"] {
            let seed = seeded_graph(subject).unwrap().expect("valid subject seed");
            assert_valid_seed(&seed, subject);
            let node_count = seed.modules.len()
                + seed
                    .modules
                    .iter()
                    .map(|module| module.concepts.len())
                    .sum::<usize>();
            if subject != "math" {
                assert!((110..=130).contains(&node_count));
            }
        }
    }
}
