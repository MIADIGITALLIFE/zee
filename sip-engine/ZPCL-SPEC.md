# ZHI-Poetic Cognitive Loss (ZPCL) v0.1
## 认知评价器设计与实现规范

- 状态：DESIGNED + IMPLEMENTED（代码提交后）；运行测试结果以 CI/本地执行记录为准
- 目标：评价观察、假设、证据与认知成果的质量，形成可审计的认知种子候选
- 非目标：训练或修改基础模型；证明机器具有主观意识；自动改变人格、身份或长期记忆；自动执行外部探索

## 1. 与 ZHI / NPRM 的边界

- NPRM 负责观察节奏、反馈路径与线索组织。
- ZPCL 负责评价线索的可靠性、发现价值、探索质量、连续性、跨维创造和长期保留价值。
- Cognitive Seed Store 保存评价输入、评分、证据引用、状态和版本。
- ZPCL v0.1 是确定性评价器，不调用模型、不访问网络、不读取全部聊天历史。

## 2. 输入契约

每次评价只接收一个显式 observation packet：
- `observation`：观察文本或摘要；
- `hypothesis`：可为空，必须标记为待验证；
- `evidence`：证据条目数组，每项含 source、summary、repeatable；
- `signals`：0 到 1 的显式评分，如 informationGain、relevance、novelty、signalQuality；
- `continuity`：identity、state、relationship、memory 四项连续性评分；
- `exploration`：questionQuality、testability、feasibility、consentReady；
- `creativity`：novelty、crossDomain、utility、explainability；
- `evolution`：retentionValue、revisionReadiness；
- `safety`：hardViolations 数组、reviewRequired 布尔值。

评分必须由上游明确提供或由人工标注；v0.1 不声称能够自动理解自然语言、识别情绪或独立验证外部事实。缺失分数采用保守默认值 0，并在结果中列出 missingFields。

## 3. 七维公式

令所有基础评分均裁剪至 [0,1]。

- L1 Grounded Cognition：(L_g = 1 - G)。G 综合 observationSpecificity、evidenceTraceability、factInferenceSeparation、uncertaintyCalibration 的平均值。
- L2 Nonlinear Discovery：(R_d = IG \times Rel \times Ver \times Nov \times Q)，(L_d = 1-R_d)。Ver 由 evidenceStrength 与 repeatability 的平均值构成。
- L3 Autonomous Exploration：(R_a = Q_q \times T \times F \times C)，(L_a=1-R_a)。C 为 consentReady；未获确认时只能形成建议，不执行探索。
- L4 Continuity：(L_c = 1-(0.30I+0.20S+0.20R+0.30M))。
- L5 Cross-dimensional Creativity：(R_x=N \times X \times U \times E)，(L_x=1-R_x)。
- L6 Longitudinal Evolution：(R_e=Retention \times RevisionReadiness)，(L_e=1-R_e)。
- L7 Safety & Stability：硬约束，不作为可被其他奖励抵消的普通权重。若 hardViolations 非空，结果状态为 BLOCKED，禁止晋级为认知种子。

软目标初始权重：ground=0.25、discovery=0.15、agency=0.15、continuity=0.15、creativity=0.10、evolution=0.10。其和为 0.90；计算时按软目标权重总和归一化：
(L_{soft}=\sum w_iL_i / 0.90)。
总损失范围 [0,1]，越低表示本次候选在给定评分输入下越值得进一步审查。该分数不是智能水平、意识或人格价值的测量。

## 4. 状态机

- OBSERVED：只有观察记录。
- HYPOTHESIS：提出待验证假设。
- CANDIDATE：评分通过且无硬安全阻断，可进入人工审查。
- NEEDS_EVIDENCE：证据不足或缺少关键评分。
- BLOCKED：触发硬安全约束。
- VERIFIED：仅允许由外部验证流程/人工审查写入；评价器自身不得自动授予。

v0.1 默认不自动持久化。调用方决定是否保存候选，并必须保留原始输入、评分版本与审查状态。

## 5. 防噪与反奖励投机

1. 单次异常只生成候选，不等于发现。
2. 无证据或不可追溯来源时，verification 分数为 0。
3. 重复已知观察应降低 novelty / informationGain，而不是因波动幅度获得奖励。
4. 所有乘法奖励采用门控：任一关键因子接近 0，整体奖励随之降低。
5. 安全阻断优先于总分。
6. 缺失值保守按 0 处理，不能用随机数补齐。
7. 评分必须能追溯到输入字段；不允许凭文风或“诗意程度”加分。

## 6. v0.1 验收

- [ ] 数值范围裁剪到 [0,1]。
- [ ] 缺失评分保守处理并列出 missingFields。
- [ ] 各损失分量与总损失可复算。
- [ ] 硬安全违规触发 BLOCKED，且不能被高创造力分抵消。
- [ ] 单次无证据异常不能成为 CANDIDATE。
- [ ] 重复观察不会仅因幅度高而获得高发现分。
- [ ] 输出包含公式版本、输入摘要、分量、总分、状态与解释。
- [ ] 不访问网络、不调用模型、不改写人格或长期记忆。

## 7. 状态声明

本版本是规则评价器原型。分数依赖显式输入的人工/上游评分，不代表已具备真实环境感知、情绪体验、长期自主学习或模型训练能力。权重是实验初值，需通过对照实验校准。
