# 产品本质课 · 设计+发现引用核验报告

> 本文件为设计 5 篇 + 发现 4 篇的引用核验存档，不进入专栏展示。所有结论基于 WebSearch 多源核验，链接基于 2026-07 检索结果。
> 核验维度：① 概念归属是否正确；② 出处/年份/版本是否可查；③ 数字事实是否硬约束；④ 是否存在常见误传。
> 标注规则：【核实】= 多源一致且可追溯到一手或权威出处；【版本可查】= 主体正确但版本/措辞细节需注意；【存疑】= 一手出处未直接确认或与任务描述有出入。

---

## 一、设计章核验

### 1.1 用户体验五要素

- **核实结论**：【核实】
- **提出者**：Jesse James Garrett（**非** Norman）。Garrett 是 Adaptive Path 联合创始人，2000 年将五要素模型先发布在个人网站 jjg.net/elements，2002 年成书《The Elements of User Experience: User-Centered Design for the Web》，2011 年第二版扩展副题为 "…for the Web and Beyond"。
- **五层名称（自底向顶）**：Strategy / Scope / Structure / Skeleton / Surface（战略层 / 范围层 / 结构层 / 框架层 / 表现层）。
- **决策依赖链**：Garrett 在原书第二章 "Building from Bottom to Top" 明确指出每一层依赖其下一层，从最抽象（战略）到最具体（表现），是自底向顶的决策链。
- **2011 第二版扩展范围澄清**：第二版序言原话为 "this book is no longer just about Web sites… the themes, concepts, and principles apply to products and services of all kinds"。任务描述中"扩展到移动"是简化表述——实际是扩展到"所有产品与服务"，移动只是其中一类。撰写时建议写"扩展到 Web 以外的所有产品与服务"，避免窄化。
- **权威出处**：
  - Garrett 个人网站原图（jjg.net）：http://www.jjg.net/elements/pdf/elements_simpleplanes.pdf
  - 第二版样章 PDF（Pearson/New Riders，Copyright © 2011 Jesse James Garrett）：https://ptgmedia.pearsoncmg.com/images/9780321683687/samplepages/0321683684.pdf
  - Interaction Design Foundation 解读：https://www.interaction-design.org/literature/article/the-relationship-between-visual-design-and-user-experience-design
- **撰写建议**：文中明确"用户体验五要素由 Jesse James Garrett 于 2000 年提出，2002 年成书，2011 年第二版扩展到 Web 以外的产品与服务"，并强调"非 Norman 提出"以纠正常见误传。五层中译名采用"战略层/范围层/结构层/框架层/表现层"。

### 1.2 可见性与反馈

- **核实结论**：【核实】
- **三个概念**：
  - **Affordance（示能 / 供可见性）**：感知到的"对象允许什么操作"。Norman 借自 James J. Gibson（1977/1979）的生态心理学概念，但改造为"感知属性"而非纯物理属性。
  - **Signifier（意符）**：指示 affordance 存在的可见信号（如门上的金属平板"暗示推"）。**Norman 在 2013 修订版才正式引入此概念**——他观察到设计师二十年来把"affordance"误用为他本意中的"signifier"，故在修订版中做出区分。
  - **Feedback（反馈）**：动作发生后系统给出的可感知响应，是"可见性"闭环的最后一环。
- **原版 vs 修订版**：
  - 原版 1988 年名为 *The Psychology of Everyday Things*（Basic Books），1990 年平装版改名 *The Design of Everyday Things*。原版只讲 affordance。
  - 2013 年修订扩版（Basic Books）新增 signifier 概念，并补充关于技术、复杂系统、自动化等章节。
- **权威出处**：
  - Norman 本人对 affordance/signifier 的澄清（Nielsen Norman Group）：https://www.nngroup.com/articles/affordances/
  - IxDF 词条 "Affordances"（明确指出 Norman 1988 首次将 affordances 引入设计语境，借自 Gibson 1977）：https://www.interaction-design.org/literature/topics/affordances
  - 修订版出版信息：https://www.nngroup.com/books/design-everyday-things-revised/
- **撰写建议**：文中应明确"affordance 与 signifier 是两个不同概念，signifier 是 2013 修订版才补入的"，避免把二者混为一谈。原书名翻译为《设计心理学》（中信出版社），但英文原名 *The Design of Everyday Things*（首版 1988，原名 *The Psychology of Everyday Things*；修订版 2013）。

### 1.3 无意识设计

- **核实结论**：【部分存疑】——"无意识设计"= 深泽直人 提出已【核实】；但任务清单中两处细节有误，需修正。
- **归属核实**："Without Thought（无意识）"由深泽直人（Naoto Fukasawa，1956– ）命名并实践，**非 Norman**。深泽直人官网明确："深泽直人发现人类无意识的行动中隐藏着设计原理，并将之命名为 'Without Thought（无意识）'"。
- **时间修正 1（重要）**：任务清单写"2007 IDEA 大会 'without thought'"。实际是 **1999 年起每年举办的 "Without Thought" 设计研讨会**——深泽直人官网原话："1999 年起，每年举办以此为名的设计研讨会，并持续将成果以书籍、展览的形式发布。" 2007 不是起源年。
- **时间修正 2（重要）**：任务清单写"深泽直人《Designing Design》2007"。**《Designing Design》实为原研哉（Kenya Hara）所著**，2007 年由 Lars Müller Publishers 出版（深泽直人是书中 RE-DESIGN / HAPTIC 章节的受邀设计师之一，设计了茶包、juice skin 果汁包装等作品）。深泽直人本人的著作是《设计的轮廓》（TOTO 出版，2005）、《Naoto Fukasawa EMBODIMENT》（Phaidon，2018）等。
- **代表作修正**：
  - 壁挂式 CD 播放器（MUJI，1999）——任务写"CD 盒壁挂灯"不准确，应为"壁挂式 CD 播放器"，被纽约 MoMA 永久收藏。
  - 茂密森林果汁包装——准确说是"HAPTIC 展"中的"juice skin"（果皮外观的果汁包装），但 HAPTIC 展是原研哉策展，深泽直人是受邀设计师之一。
- **权威出处**：
  - 深泽直人官网（明确 1999 年起举办 Without Thought 研讨会）：https://naotofukasawa.com/cn/about/
  - Lars Müller Publishers 官方页面（确认《Designing Design》作者是 Kenya Hara）：https://www.lars-mueller-publishers.com/designing-design
  - 加拿大建筑中心馆藏（明确 "First published in 2007"，作者 Kenya Hara）：https://www.cca.qc.ca/en/search/details/library/publication/317404126
- **撰写建议**：文中写"深泽直人于 1999 年起每年举办 'Without Thought' 研讨会，提出无意识设计理念"，**不要写《Designing Design》是深泽直人的书**（那是原研哉的书）。代表作准确写"无印良品壁挂式 CD 播放器（1999）"。如要提及 HAPTIC 果汁包装，应说明这是原研哉策展、深泽直人参与设计的作品。

### 1.4 极简与少即是多

- **核实结论**：【核实】
- **"少即是多"（Less is more）**：现代主义建筑师 **Ludwig Mies van der Rohe（密斯·凡德罗）** 的格言，指向建筑/空间中的形式优雅与留白美学。
- **"少但更好"（Less but better / Weniger, aber besser）**：德国工业设计师 **Dieter Rams（迪特拉姆斯）** 的设计哲学标语，是其"好设计十原则"第 10 条 "Good design is as little design as possible" 的精神提炼。1995 年 Gestalten 出版同名著作《Less but Better / Weniger, aber besser》。
- **二者区别**：密斯是"少 = 美"（建筑师的审美判断），拉姆斯是"少 = 更好"（功能纯净化、用体验提升）；不可混为一谈。常见还有 Robert Venturi 的反诘"Less is a bore"。
- **Colborne《简约至上》四策略**：Giles Colborne《Simple and Usable: Web, Mobile and Interaction Design》（2010 年 New Riders / Pearson 出版）提出四策略：**删除（Remove）/ 组织（Organize）/ 隐藏（Hide）/ 转移（Displace）**。作者在 UX Podcast 采访中亲自阐明四种策略的英文命名。
- **权威出处**：
  - Dieter Rams 第 10 原则原文（Vitsœ 官方文本，含 "Less, but better — because it concentrates on the essential aspects…"）：https://zack.haus/blogs/germandesign/rams-principle-10-less-design
  - 四句 "less" 名言对照（含 Mies / Venturi / Rams / Buckminster Fuller）：https://www.re-thinkingthefuture.com/architectural-community/a11381-what-is-less/
  - Giles Colborne 专访（亲口描述 remove/organize/hide/displace 四策略）：https://uxpod.com/episodes/simple-and-usable-an-interview-with-giles-colborne.html
- **撰写建议**：明确对照"少即是多 = 密斯·凡德罗（建筑）"与"少但更好 = 拉姆斯（工业产品）"，并引用拉姆斯第 10 原则英文原文以增强权威性。Colborne 四策略中译统一为"删除/组织/隐藏/转移"。

### 1.5 情感化设计三层次

- **核实结论**：【核实】（年份有版本细节）
- **提出者**：Donald A. Norman。
- **著作**：《Emotional Design: Why We Love (or Hate) Everyday Things》，Basic Books 2003 年精装首版（部分二次文献标 2004，为平装/重印年份；日译、中译多沿用 2004）。
- **三层次（自下而上）**：
  - **Visceral（本能层）**：自动的、先天的、毫秒级反应——外观、色彩、形态、质感的第一印象。
  - **Behavioral（行为层）**：习得性行为——使用过程中的功能、可用性、效率、反馈。
  - **Reflective（反思层）**：意识与自我认知——自我形象、记忆、故事、品牌认同。
- **理论依据**：三层次源自 Norman 与同事 Andrew Ortony、William Revelle 合作的论文 "Affect and Proto-affect in Effective Functioning"（2003，载于 *Who Needs Emotions?* Oxford UP）。
- **中译本**：中信出版社《情感化设计》。
- **权威出处**：
  - 学术综述（明示三层次由 Norman 提出）：https://files.eric.ed.gov/fulltext/EJ1386092.pdf
  - 全书摘要（确认 2003 年出版、三层次定义）：https://www.supersummary.com/emotional-design/summary/
  - 原典溯源（黑须教授对三层次命名流变的考据，含 Ortony/Norman/Revelle 2003 论文）：https://u-site.jp/lecture/emotional-design
- **撰写建议**：文中写"Norman《Emotional Design》2003 年首版提出情感三层次：本能层/行为层/反思层"，中译名采用中信出版社译名。注意：这不是 Norman 1988《设计心理学》的内容，是 2003 年的新框架。

---

## 二、发现章核验

### 2.1 持续发现习惯

- **核实结论**：【核实】
- **Opportunity Solution Tree（机会解决方案树）归属**：Teresa Torres 原创，确认为其本人提出。
- **首提时间**：Torres 本人在 producttalk.org 明确写道："When I finally wrote about the opportunity solution tree (back in 2016), I knew that it was a big enough idea that I would need to write a book about it."——即 **2016 年博客首提**。
- **成书**：《Continuous Discovery Habits》2021 年出版。书中将 OST 定义为：以"期望业务结果"为根，向下展开"机会（客户需求/痛点/欲望）→ 解决方案 → 实验"四层可视化的发现框架。
- **OST 四层结构**（撰写时可参考）：Outcome → Opportunities → Solutions → Experiments。
- **权威出处**：
  - Torres 本人博客（OST 原始介绍）：https://www.producttalk.org/opportunity-solution-trees/
  - Torres 回忆 2016 首提 OST、2021 成书过程：https://www.producttalk.org/2021/08/writing-a-book/
  - 书评与笔记（确认 2021 年出版）：https://www.alexjhughes.com/books/2021/8/3/continuous-discovery-habits-teresa-torres
- **撰写建议**：文中写"Torres 于 2016 年在博客首次提出机会解决方案树，2021 年在《Continuous Discovery Habits》一书中系统化"。强调"OST 是 Torres 原创"，避免与产品树、影响地图等混淆。

### 2.2 妈妈测试

- **核实结论**：【核实】
- **作者与年份**：Rob Fitzpatrick《The Mom Test》，2013 年自出版，约 130 页。
- **核心方法（三条规则）**：
  1. **Talk about their life, not your idea**（谈对方的生活，不谈你的想法）
  2. **Ask about specifics in the past instead of generics or opinions about the future**（问过去的具体行为，不问对未来的泛泛意见）
  3. **Talk less and listen more**（少说多听）
- **书名来源**：书名源自"设计问题让妈妈都无法对你撒谎"——核心是问题设计技巧，**不是"不要问妈妈"**。任务清单已正确指出此误区。
- **核心金句**："Past behavior is data. Future intentions are fiction."（过去的行为是数据，未来的承诺是虚构。）
- **权威出处**：
  - 全书 PDF（含三条规则原文）：https://inkubator.si/wp-content/uploads/2020/05/The-Mom-Test-by-@robfitz.pdf
  - 三规则深度解读：https://gonogo.team/the-mom-test
  - 中文整理（含"妈妈测试"名称由来辨析）：https://tianpan.co/notes/2025-04-29-the-mom-test
- **撰写建议**：文中明确"妈妈测试 ≠ 不要问妈妈"，而是"问题设计得即使你妈都无法撒谎"。核心要点是"问过去的具体行为，不问未来的承诺"。

### 2.3 设计冲刺

- **核实结论**：【核实】
- **作者**：Jake Knapp 主创，与 John Zeratsky、Braden Kowitz 合著。
- **著作**：《Sprint: How to Solve Big Problems and Test New Ideas in Just Five Days》，2016 年出版（英文版 Simon & Schuster 旗下；中信出版社中文版《设计冲刺》）。
- **方法起源**：Knapp 2010 年在 Google 开发，后在 Google Ventures (GV) 与 Slack、Blue Bottle Coffee、Flatiron Health 等公司完善。
- **五天流程（已核实）**：
  - **Monday – Map（地图）**：从终点出发设定长期目标，绘制挑战地图，咨询专家，选定一个目标靶点。
  - **Tuesday – Sketch（草图）**：每人独立用四步法画解决方案草图，开始为周五测试招募用户。
  - **Wednesday – Decide（决策）**：用"美术馆→热图投票→快速评议→稻草投票→决断者拍板"五步选出方案，做故事板。
  - **Thursday – Prototype（原型）**："fake it" 哲学，8 小时内做出高保真原型。
  - **Friday – Test（测试）**：找 5 位目标用户做 1 对 1 测试，团队同步观看并记录。
- **权威出处**：
  - GV 官方 Sprint 页（含每日流程与 Jake Knapp 视频）：https://www.gv.com/sprint/
  - 书评 + 六步拆解（含 Set the Stage）：https://gettingbettereveryday.org/2016/07/08/what-you-can-learn-from-sprint-by-jake-knapp-john-zeratsky-braden-kowitz-2016-220-pages/
  - 五天流程详解：https://www.uxpin.com/studio/blog/design-sprints
- **撰写建议**：中译名统一为"星期一·地图 / 星期二·草图 / 星期三·决策 / 星期四·原型 / 星期五·测试"。强调"5 天 5 步"硬约束，并注明是 Jake Knapp 主创（合著者为 Zeratsky 与 Kowitz）。

### 2.4 MVP 与精益创业

- **核实结论**：【版本可查】（任务给出的 MVP 定义引文与 Ries 原文措辞有出入，需修正）
- **著作**：Eric Ries《The Lean Startup: How Today's Entrepreneurs Use Continuous Innovation to Create Radically Successful Businesses》，**2011 年 Crown Business（Crown Publishing Group / Random House 旗下）出版**。
- **MVP 首提时间**：Ries 2008 年起在博客 *Startup Lessons Learned* 持续讨论精益创业与 MVP 概念，2011 年成书。
- **MVP 定义（重要修正）**：
  - 任务清单引文："that version of a product that enables a full turn of the Build-Measure-Learn loop with minimum effort"
  - Ries 在书中给出的标准定义："**the version of a new product which allows a team to collect the maximum amount of validated learning about customers with the least effort**"（能让团队以最少努力收集到关于客户的最大量已验证学习的新产品版本）
  - 任务引文的精神与 Ries 一致（都是"最少努力 + 完整学习闭环"），但不是逐字原文。Ries 也确实在书和博客中反复强调 MVP 是"完成 Build-Measure-Learn 一个完整循环"的最小单位——这一表述在二手文献中常见，可能源自 Ries 演讲或博客的另一种说法。
  - 建议：引用时使用 Ries 书中的标准定义（"maximum amount of validated learning…with the least effort"），更稳妥。
- **MVP 三大常见误读**（撰写时建议明确反驳）：
  1. MVP ≠ 最简陋的产品（不是"做得糙"）
  2. MVP ≠ 半成品（不是"未完成的功能模块"）
  3. MVP ≠ 最小可发布版本（重点在"验证学习"而非"发布"）
  - 典型正例：Dropbox 用 3 分钟解说视频作为 MVP（验证需求），Zappos 用代购鞋子的方式作为 MVP（验证购买意愿）。
- **Build-Measure-Learn 循环**：精益创业的核心反馈环——构建 → 测量 → 学习 → 决策（坚持/转向/终止），循环越快越成功。
- **权威出处**：
  - Lean Startup 方法论综述（含 MVP 定义原文 "version of a new product which allows a team to collect the maximum amount of validated learning about customers with the least effort"）：https://handwiki.org/wiki/Finance:Lean_startup
  - MVP 定义与误用辨析：https://startupbooks.com/authors/eric-ries
  - Build-Measure-Learn 循环与 MVP 案例（Dropbox / Zappos）：https://www.frmwrks.ai/library/lean-startup
- **撰写建议**：文中明确"MVP 由 Eric Ries 在 2008 年博客首提、2011 年在《The Lean Startup》（Crown Business）中系统化"，并强调"MVP 不是最简陋的产品，而是以最少努力完成一次完整 Build-Measure-Learn 学习闭环的版本"。引用定义时使用书中标准原文，避免使用任务清单中略有意译的版本。

---

## 三、概念归属易错清单

> 以下为本次核验中确认的"易混淆归属"清单，撰写专栏时务必逐条对照。

| 概念 | 正确归属 | 常见误传 |
|---|---|---|
| 用户体验五要素（5 Planes） | **Jesse James Garrett**（《用户体验要素》2002/2011） | 误归 Norman |
| "Without Thought"无意识设计 | **深泽直人**（1999 年起年度研讨会） | 误归 Norman；误把 2007 当起源年 |
| 《Designing Design》作者 | **原研哉（Kenya Hara）**（Lars Müller, 2007） | 误归深泽直人（深泽直人只是受邀设计师之一） |
| "少即是多"（Less is more） | **密斯·凡德罗（Mies van der Rohe）** | 与拉姆斯混淆 |
| "少但更好"（Less but better） | **迪特拉姆斯（Dieter Rams）**（第 10 原则） | 与密斯混淆 |
| "好设计十原则" | **Dieter Rams**（1970s 后期体系化） | 误归 Braun 公司而非个人 |
| 情感化设计三层次 | **Norman**（《Emotional Design》2003，Basic Books） | 误归入《设计心理学》 |
| affordance / signifier 区分 | **Norman**（2013 修订版才引入 signifier） | 误以为两概念同时出现 |
| 机会解决方案树（OST） | **Teresa Torres**（2016 博客首提，2021 成书） | 与影响地图、产品树混淆 |
| 妈妈测试 | **Rob Fitzpatrick**（《The Mom Test》2013） | 误读为"不要问妈妈" |
| 设计冲刺 | **Jake Knapp** 主创（合著 Zeratsky、Kowitz） | 误归 IDEO 或 Tim Brown |
| MVP / Build-Measure-Learn | **Eric Ries**（《The Lean Startup》2011，Crown Business；MVP 首提于 2008 博客） | MVP 误读为"最简陋产品" |

---

## 四、数字事实硬约束

> 以下数字为撰写时不可写错的硬约束。

| 维度 | 硬约束 |
|---|---|
| 用户体验五要素层数 | **5 层**（战略/范围/结构/框架/表现） |
| 用户体验五要素首提年份 | **2000 年**（Garrett 个人网站），2002 年成书，2011 年第二版 |
| Norman《设计心理学》首版年份 | **1988 年**（原名 *The Psychology of Everyday Things*，1990 平装改名） |
| Norman《设计心理学》修订版年份 | **2013 年**（引入 signifier） |
| 深泽直人 "Without Thought" 起始年 | **1999 年**（非 2007） |
| 情感化设计三层次数 | **3 层次**（本能层/行为层/反思层） |
| 情感化设计首版年份 | **2003 年**（Basic Books 精装；部分文献标 2004 为平装） |
| 拉姆斯"好设计十原则"条数 | **10 条**（第 10 条 "as little design as possible"） |
| Colborne 简约四策略数 | **4 个**（删除/组织/隐藏/转移） |
| 设计冲刺天数 | **5 天**（周一地图/周二草图/周三决策/周四原型/周五测试） |
| 设计冲刺成书年份 | **2016 年**（Knapp 主创） |
| MVP 首提年份 | **2008 年**（Ries 博客 *Startup Lessons Learned*） |
| 精益创业成书年份 | **2011 年**（Crown Business） |
| 妈妈测试成书年份 | **2013 年**（Rob Fitzpatrick） |
| OST 首提年份 | **2016 年**（Torres 博客），2021 成书 |

---

## 五、撰写红线提示

1. **不要写"深泽直人《Designing Design》"**——那是原研哉的书。深泽直人的代表作集是《设计的轮廓》《Naoto Fukasawa EMBODIMENT》。
2. **不要写"2007 IDEA 大会提出 without thought"**——实际是 1999 年起每年举办的研讨会。
3. **不要把 MVP 写成"最简陋的产品"或"半成品"**——Ries 的定义核心是"以最少努力收集最大量的已验证学习"。
4. **不要把五要素归给 Norman**——是 Garrett。
5. **不要把"少即是多"和"少但更好"混用**——前者密斯（建筑），后者拉姆斯（工业产品）。
6. **不要把"妈妈测试"解读为"不要问妈妈"**——书名原意是"问题设计得让妈妈都无法对你撒谎"。
7. **不要把 affordance 和 signifier 当作同时期概念**——signifier 是 Norman 2013 修订版才补入的。
8. **引用 MVP 定义时**，优先使用书中标准原文 "the version of a new product which allows a team to collect the maximum amount of validated learning about customers with the least effort"，而非任务清单中略有意译的版本。
