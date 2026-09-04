---
title: "Reasoning effort: how hard should an LLM think?"
subtitle: "What the setting controls, how providers implement it, and when an agent harness should spend more"
updated: "2026-09-04"
---

# Reasoning effort: how hard should an LLM think?

The small low–medium–high selector is the visible end of a larger change in how language models are trained, served, and orchestrated.

> **Thesis:** Reasoning effort is not intelligence. It is an inference-time compute policy.

## Introduction

An engineer opening an LLM console today may find a small selector labeled *low*, *medium*, or *high*. It looks like a quality setting: move it to the right and receive a better answer. But that modest control is the visible end of a much larger change in how language models are trained, served, and orchestrated.

A few years ago, developers tried to elicit reasoning by writing “think step by step,” supplying worked examples, or sampling several answers and voting. Then models were trained to produce useful intermediate work. Providers began charging for hidden reasoning tokens. Open-weight releases exposed the training recipes and prompt protocols. Agent harnesses learned to vary the budget from one step to the next. What began as a prompting trick became a layer of inference infrastructure.

Consider two requests. The first asks a model to extract an invoice number from a well-formed document. The second asks it to review a database migration for failure modes that could cause data loss. Both requests involve language, but the useful work is different. Extraction mostly requires recognizing a value and returning it in the requested schema. The migration review requires the model to reconstruct a plan, follow dependencies, imagine partial failures, compare alternatives, and check whether its own conclusions are supported.

These tasks should not receive the same inference budget. Reasoning effort is best understood as a model-specific policy that influences how much computational work the model applies while producing a response. Lower effort favors a direct path. Higher effort allows a longer or more thorough internal trajectory: planning, exploring alternatives, checking intermediate results, and recovering from a bad approach.

That allowance is not equivalent to giving the model a fixed amount of extra wall-clock time. It commonly results in more generated reasoning tokens and therefore more latency, but the mapping is adaptive: the same setting can consume very different token counts and durations on two prompts. Extra effort creates an opportunity to do useful work; it does not reserve a precise number of seconds or guarantee a correct answer.

To understand what the selector means—and why providers and agent harnesses cannot simply hide it forever—we need to follow the path by which reasoning became something engineers could budget.

## How reasoning became a budget

### 2022: reasoning was something you prompted for

The modern story starts before there was an effort field. The chain-of-thought paper showed that sufficiently large language models could solve some multi-step problems more accurately when prompts included worked intermediate reasoning. Self-consistency then showed a second route to better results: sample several different reasoning paths and select the answer they most often reach. One method spent more tokens inside a trajectory; the other spent more compute across trajectories. Both established the idea that inference could be scaled after training.[^cot][^self-consistency]

At this stage, the developer owned the machinery. A prompt encouraged a trace, a sampling loop created alternatives, and application code chose the result. “Reasoning effort” was an emergent consequence of prompting and decoding, not a calibrated model capability.

### 2023: the process became a training target

The next step moved reasoning from prompt craft into post-training. Work on process supervision compared rewarding correct intermediate steps with rewarding only the final outcome. In mathematics, OpenAI reported that process-supervised reward models selected correct solutions more reliably than outcome-supervised ones as more candidate solutions were considered. This did not settle the general training recipe, but it made a central design question explicit: should a model learn from the path, the destination, or both?[^process-supervision]

Verifiable domains such as mathematics and code offered another possibility. If a checker can determine whether the final answer or program is correct, reinforcement learning can reward successful behavior without requiring a human to annotate every hidden step. That idea would become central to the open reasoning-model wave.

### September 2024: test-time compute became a product

OpenAI’s o1 release was the moment the shift became visible to ordinary API users. OpenAI described a model trained with reinforcement learning to refine its chain of thought, recognize mistakes, and try other approaches, and reported that performance improved with both train-time compute and time spent thinking at inference. Raw chain-of-thought was withheld, while a model-generated summary could be shown. The internal trajectory had become a metered product behavior rather than prompt text the application necessarily owned.[^o1]

This changed the engineering question. Developers no longer asked only, “How should I prompt the model to reason?” They also had to ask, “How much invisible generation should this request be allowed to consume, how do I measure it, and when does the extra latency pay off?”

### January 2025: open weights exposed the recipe

DeepSeek-R1 made the training story inspectable. R1-Zero applied large-scale reinforcement learning before supervised fine-tuning and developed longer reasoning, reflection, and self-correction. The full R1 pipeline added cold-start data and further training for readability and general usefulness, then distilled the behavior into smaller models. The release turned techniques that had largely been inferred from closed systems into code, weights, and a detailed report.[^deepseek-r1]

That openness also demystified the interface. A `<think>` block was not a symbolic theorem prover hidden inside the transformer. It was an autoregressively generated scratch space, learned through training and given special treatment by the prompt template and serving stack.

### 2025: reasoning became configurable

Once reasoning was a model behavior, providers began turning it into a family of controls. Qwen3 offered hybrid thinking and non-thinking modes. OpenAI’s gpt-oss encoded low, medium, and high effort in the Harmony prompt protocol. Hosted APIs exposed qualitative levels, numeric budgets, or adaptive modes. Gateways such as OpenRouter normalized the wire format, while hosts such as Baseten surfaced the native semantics of individual open models.[^qwen3][^gpt-oss][^openrouter][^baseten]

### 2026: one label, several mechanisms

The current generation has made the term *effort* less uniform, not more. It can mean a learned ordinal mode, a hard token budget, a continuous conditioning value, an adaptive provider policy, preserved thinking across tool calls, or—in one multi-agent API—the number of collaborating agents. Agent harnesses now sit above those mechanisms, allocating compute across planning, acting, verification, retries, and handoffs.

That history explains the present confusion. The industry converged on the need to control inference-time work, but not on a unit for measuring it. The rest of this article follows the stack downward—from the semantics of the control, through tokens and model training, and back upward into agent policy and production evaluation.

## What reasoning effort actually controls

A conventional description of an LLM request has two parts: tokens go in and tokens come out. A reasoning model adds a meaningful middle stage. Before and sometimes between pieces of visible output, the model can spend computation deciding how to approach the task. It may decompose the problem, keep track of intermediate results, reconsider an assumption, decide which tool to call, or inspect whether a proposed answer is internally consistent.

## Reasoning tokens are part of the budget

Reasoning models introduce a hidden computational stage between input and visible output. Providers account for that work in different ways, but the engineering consequences are the same: it consumes budget, time, and context capacity.

In OpenAI’s Responses API, reasoning tokens are not exposed as readable internal chain-of-thought. They are still counted in usage, occupy context-window space, and are billed as output tokens. The response reports their count under `output_tokens_details.reasoning_tokens`.[^openai-reasoning]

| Token class | Visible? | Consumes budget? |
|---|---:|---:|
| Input tokens | Yes | Yes |
| Reasoning tokens | No* | Yes |
| Visible output | Yes | Yes |

*Some APIs can return a summary, but not the model’s raw private reasoning.

Reasoning effort is usually not a promise to spend an exact number of tokens. It is a policy signal. OpenAI’s documentation describes models as adaptive across effort levels: simple tasks can use fewer tokens, while harder tasks can use more.[^openai-reasoning]

### Budget for the invisible work

A response can exhaust its output limit during reasoning before it emits a useful visible answer. Treat the generated-token limit as a shared envelope, not merely a cap on prose length.

## Reasoning effort is not verbosity

Reasoning effort changes the work used to solve a task. It does not directly set how long, creative, or well-informed the final answer will be.

| Control | Primarily changes | Does not guarantee |
|---|---|---|
| `reasoning.effort` | Internal problem-solving work | A longer or correct answer |
| Verbosity | Detail in the visible response | Deeper analysis |
| Output-token limit | The hard generation ceiling | Efficient use of the ceiling |
| Temperature | Sampling variability | More careful reasoning |
| Context window | Information available in a request | Attention to every detail |

A model can reason extensively and return three sentences. It can also produce two pages of plausible prose after shallow reasoning. This is why “explain in detail” is not a reliable substitute for an effort control—and why visible length is a poor proxy for computational work.

## The API surface

The exact parameter is provider- and model-specific. Some APIs expose qualitative levels, some expose token budgets, and others choose adaptively. Always check the model’s current reference page before hard-coding a value.

Here is a concrete OpenAI Responses API example. At the time of writing, `gpt-5.6` supports `none`, `low`, `medium`, `high`, `xhigh`, and `max`; supported values and defaults remain model-dependent.[^openai-models]

```javascript
import OpenAI from "openai";

const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-5.6",
  reasoning: { effort: "medium" },
  input: "Review this migration plan for data-loss risks.",
  max_output_tokens: 32000
});

console.log(response.output_text);
console.log(
  response.usage.output_tokens_details.reasoning_tokens
);
```

Three details matter:

1. **Effort is guidance.** It influences the model’s reasoning policy rather than reserving a fixed block of tokens.
2. **The limit is shared.** `max_output_tokens` covers reasoning and visible generated output.
3. **Usage is observable.** Record reasoning tokens, total tokens, latency, and outcome quality together.

API behavior changes. Keep examples tied to a dated model reference and verify them against the official documentation before shipping.

### The same idea has several API shapes

| Surface | Primary control | Important behavior |
|---|---|---|
| OpenAI Responses | `reasoning.effort` | Qualitative levels; reasoning tokens share the generated-output envelope. |
| Anthropic Messages | `thinking.type` plus `output_config.effort` | Adaptive thinking decides whether and how deeply to think; effort applies to the whole response. |
| Google Gemini | `thinking_level` | Dynamic thinking is the default on current thinking models; supported levels vary. |
| xAI Responses | `reasoning.effort` | Grok 4.6 uses it for depth; the Grok multi-agent model uses it for agent count. |
| OpenRouter | `reasoning.effort` or `reasoning.max_tokens` | A normalized gateway surface translated to provider-native controls. |
| Baseten Model APIs | Model-specific fields | Open-weight models keep their native chat-template and reasoning semantics. |

> **Current snapshot, 29 August 2026.** OpenAI’s GPT-5.6 family exposes a broad effort ladder; current Claude models use adaptive thinking with response-wide effort; Gemini 3.x uses dynamic thinking levels; Grok 4.6 adds `xhigh`; and recent open-weight/API releases include DeepSeek V4, Qwen3.8, Kimi K3, GLM-5.3 and GLM-5.3-Flash, Nemotron 3 Ultra, gpt-oss, and Inkling. Capability discovery should be part of the client, not a hard-coded assumption.[^openai-models][^anthropic-thinking][^gemini][^xai][^qwen38]

Anthropic separates the thinking mode from response-wide effort. On a model that supports adaptive thinking:

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=16000,
    thinking={"type": "adaptive"},
    output_config={"effort": "medium"},
    messages=[{"role": "user", "content": prompt}],
)
```

Older extended-thinking Claude models use `budget_tokens` instead. The two forms are model-generation specific and should not be treated as interchangeable.[^anthropic-thinking][^anthropic-effort]

xAI’s API illustrates why field names alone are insufficient. For Grok 4.6, `reasoning.effort` selects low, medium, high, or xhigh depth and reasoning cannot be disabled. On `grok-4.20-multi-agent`, the same field controls how many agents collaborate instead of the depth of one trajectory.[^xai]

OpenRouter presents a normalized request:

```json
{
  "model": "your-model",
  "messages": [{"role": "user", "content": "..."}],
  "reasoning": {"effort": "high"}
}
```

The gateway maps that value to a provider level or a token budget. This is useful portability, not standardization: `medium` can mean different policies after translation.[^openrouter]

Baseten serves open-weight models through an OpenAI-compatible endpoint while retaining model-native controls. Its DeepSeek V3.2 example enables thinking through the chat template:

```python
response = client.chat.completions.create(
    model="deepseek-ai/DeepSeek-V3.2",
    messages=[{"role": "user", "content": prompt}],
    extra_body={"chat_template_args": {"enable_thinking": True}},
)
```

That is a model-specific switch, not a portable effort ladder.[^baseten]

Across providers, log the application’s intended effort, the exact native request, observed usage, and the model version. Otherwise a gateway or model migration can silently change the meaning of an experiment.

## Inside open-weight reasoning models

In the common open-weight design, “thinking” is not a separate symbolic engine. The model autoregressively generates an intermediate sequence—often in a dedicated channel or between special tags—and generates the answer conditioned on that sequence. More effort usually permits or encourages a longer trajectory; it does not change the transformer into a different algorithm for every token.

There are two engineering problems. Training must teach the model that useful intermediate work improves the eventual answer. Serving must format the request, parse the channels, manage budgets, and preserve the required reasoning state across turns.

### Training scaling and inference scaling

Training a larger or better post-trained model changes the weights. Increasing reasoning effort keeps the weights fixed and spends more compute during generation. Model capacity and inference budget are separate axes. A smaller model at high effort can sometimes match a larger model at low effort, but the relationship is workload-specific.

A longer trace is only one form of inference scaling. A harness can sample multiple solutions and select by majority vote or a verifier, ask for critique and revision, search a tree of candidates, or fan out to several agents. These methods spend compute across trajectories instead of only extending one.

### RLVR and think delimiters

DeepSeek-R1 popularized reinforcement learning with verifiable rewards. In math or code, a checker can reward the final answer without supervising every reasoning step. The model can learn scratch work, backtracking, and self-correction because those behaviors improve its chance of receiving the outcome reward.[^deepseek-r1]

The literal `<think>` tags do not create reasoning. They delimit an intermediate trace so trainers, servers, and user interfaces can separate it from the answer. Another marker could serve the same protocol role.

Current reports disclose four recurring mechanisms for controllable effort:

1. Mixed supervised fine-tuning on direct and reasoning examples conditioned on a mode.
2. Mode-conditioned reinforcement learning with different token costs, length penalties, or budgets.
3. Separate domain or effort specialists distilled into a single controllable checkpoint.
4. Budget-aware training or serving that teaches the model to answer after a reasoning trace is truncated.

A plain-language instruction works only when post-training taught the model to interpret it. Adding “reason at maximum effort” to an arbitrary model does not manufacture a calibrated mode.

### DeepSeek-R1

DeepSeek-R1-Zero applied large-scale reinforcement learning without supervised fine-tuning first and exhibited longer reasoning, reflection, and self-correction. The full R1 pipeline added cold-start supervised data, further reinforcement learning, and later supervised and RL stages. DeepSeek also distilled the behavior into smaller Qwen and Llama checkpoints.[^deepseek-r1]

### Qwen3

Qwen3 was trained for hybrid thinking and non-thinking behavior. Its Transformers integration enables thinking by default, supports a hard `enable_thinking=False` switch, and accepts `/think` or `/no_think` steering when thinking is enabled. The template and parser separate the generated trace from the final answer. Qwen3 also supports a hard reasoning budget: the runtime can stop the trace, insert a stop-thinking instruction, and continue to the answer. Its report says this continuation behavior emerged after Thinking Mode Fusion rather than explicit truncation training.[^qwen3]

### gpt-oss

OpenAI’s gpt-oss models are open-weight mixture-of-experts reasoning models with low, medium, and high effort. The Harmony prompt protocol places effort in the system message and separates analysis, tool commentary, and final channels. A serving runtime may implement Harmony for you; a custom loop must render and parse it correctly.[^gpt-oss]

### The 2026 generation

| Model | Inference control | Distinctive mechanism |
|---|---|---|
| DeepSeek V4 | Non-think plus low, high, max | Effort changes the prompt prefix and selects behavior created during post-training. |
| Nemotron 3 Ultra | Learned reasoning mode plus external token budget | Budget-aware continuation allows the server to close a reasoning span near a limit. |
| Kimi K2.5 | Thinking or instant mode | Token-Efficient RL alternates budgeted and unconstrained phases so efficiency does not destroy test-time scalability. |
| Kimi K3 | Low, high, max | Domain × effort specialists are combined through multi-teacher on-policy distillation. |
| Qwen3.8 | Explicit effort plus thinking on/off | Preserved thinking lets earlier reasoning state participate in long tool-using conversations. |
| GLM-5.3 | Low, high, max; always thinking | Builds on interleaved, preserved, and per-turn thinking for tool-using runs. |
| Inkling | Continuous value | The system-message effort changes per-token cost during large-scale RL. |

DeepSeek V4’s current API accepts low, high, and max effort, while non-thinking is separate. The released encoder shows that the effort mode changes a text prefix before the system message. A gateway translating `medium` must therefore choose and document a mapping.[^deepseek-v4]

Nemotron 3 Ultra combines controllable reasoning budgets with supervised fine-tuning, reinforcement learning, and multi-teacher on-policy distillation. Its budget-aware pattern lets a client stop a trace near a threshold and still ask the model to complete the answer.[^nemotron]

Kimi K2.5’s Toggle method alternates budgeted training phases, where correct solutions are encouraged to stay under a problem-specific limit, with unconstrained phases that restore the normal generation ceiling. The released policy has no selector for these training phases; the method makes its default thinking policy more token-efficient without removing its ability to benefit from extra test-time compute.[^kimi-k25]

Kimi K3 trains specialists across general, coding, and agentic domains at multiple effort budgets, then combines them into one model. Its API requires complete reasoning content to be preserved across multi-turn tool use.[^kimi-k3]

Qwen3.8 extends Qwen’s hybrid modes with explicit effort control and preserved thinking history. Retaining earlier reasoning can improve continuity and cache reuse, but the harness and inference runtime must agree on the chat-template contract.[^qwen38]

GLM introduced interleaved thinking between tools, preserved thinking across turns, and per-turn toggles. The August 2026 GLM-5.3 release adds low, high, and max effort and removes the thinking-off mode; GLM-5.3-Flash followed with the same effort-oriented evaluation framing.[^glm][^glm-flash]

Thinking Machines Lab’s Inkling uses a continuous effort value. During large-scale asynchronous RL, effort appears in the system message and changes the cost assigned to generated tokens, directly conditioning the cost–quality trade-off.[^inkling]

## Why not choose effort automatically?

Providers can, and increasingly do. Gemini uses dynamic thinking by default on current thinking models. Anthropic’s adaptive mode decides whether and how deeply to think. OpenAI treats effort as guidance rather than an exact reservation.[^gemini][^anthropic-thinking][^openai-reasoning]

That does not solve the application’s optimization problem. The provider may not know the cost of a wrong migration recommendation, a user’s latency target, whether a validator can catch a bad extraction, or whether the next tool call is irreversible. Prompt difficulty is only one input. The real question is how much this system should spend given the value and risk of the step.

The useful division of responsibility is hierarchical:

1. The application chooses an envelope: model, maximum effort, token budget, deadline, and escalation policy.
2. The provider or model adapts inside that envelope to the prompt.
3. The harness observes the result and accepts, retries, escalates, or requests human review.

## The role of the agent harness

An agent harness owns the loop around model calls: state, tools, retries, handoffs, limits, and observability. Reasoning effort can therefore change per call as a run moves through classification, planning, action, verification, and synthesis.

A harness can:

- Set different effort for different steps.
- Switch to a stronger model when more effort on the current model is unlikely to help.
- Start cheaply and escalate after a validation failure.
- Enforce token, call, tool, wall-clock, and spend budgets over the complete run.
- Preserve provider-specific reasoning items or signed thinking blocks across turns.
- Attribute usage and quality to the policy that caused each call.

The OpenAI Agents SDK accepts reasoning settings at agent or run level and aggregates reasoning-token usage. LangChain middleware can intercept each model call and dynamically replace the model or configuration from current state.[^openai-agents][^langchain-agents]

```javascript
function policy(step, state) {
  if (state.deadlineMs < 1200) return { model: "fast", effort: "low" };
  if (step.kind === "classify") return { model: "fast", effort: "low" };
  if (state.validatorFailures > 0) return { model: "strong", effort: "high" };
  if (step.isIrreversible) return { model: "strong", effort: "high" };
  return { model: "default", effort: "medium" };
}
```

Planning and acting often deserve different budgets. A research agent might reason deeply about a search plan, spend little on independent queries, and raise effort again to reconcile evidence. A coding agent might spend more on architecture and review than on mechanical edits guarded by tests.

Reasoning state is also protocol data. Providers may return summaries, encrypted items, signed blocks, or plain reasoning text, with different continuation rules. A harness should preserve required structures without copying private reasoning into user-visible text or indiscriminate logs.

## Cache-preserving effort switches: an append-only control plane

Prompt caching lets a provider skip reprocessing the unchanged prefix of a conversation. On most providers, effort is rendered into the prompt itself, so changing it between requests invalidates cache breakpoints and forces a full reprocess of the conversation history. That was true without qualification as of late August 2026. It stopped being fully true a few days later. Since September 1, 2026, Claude's Fable 5.1, Mythos 5.1, and Opus 5 models accept a per-message effort update that changes reasoning depth for the next turn without rewriting anything that came before it. GPT-6 Astra, which followed on September 3, ships a comparable mechanism under a different name. Adoption is still narrow, but the pattern previews a shift worth understanding precisely: reasoning effort is starting to become mutable runtime state, appended to a conversation, rather than a value baked into its prefix.

In a causal transformer, the key/value representation of a token depends on every token before it. A serving stack that supports prefix caching stores those tensors so a later request sharing an identical prefix can skip recomputing them. If effort is encoded near the start of the serialized prompt — inside the system message, a settings block, or a text prefix before it — changing effort changes token zero, and the entire downstream cache for that conversation becomes invalid:

```text
[effort=low]  [system]  [turn 1]  [turn 2] ...
```

A cache-preserving design instead appends the change as a later, privileged event rather than rewriting the start of the sequence:

```text
[system]  [turn 1]  [turn 2]
[control: effort=high]
[turn 3] ...
```

Everything before the control event stays byte-for-byte unchanged and remains eligible for cache reuse; only the computation for turns after it changes. A model qualifies as cache-preserving on effort only if all five of the following hold: the conversation has an already-cacheable prefix; effort can change for later turns; the earlier serialized prefix is untouched by that change; the serving system can therefore reuse its existing cache; and, ideally, the provider documents the guarantee rather than leaving it to be inferred from behavior. Offering both prompt caching and a `reasoning_effort` parameter is not sufficient on its own — most current models satisfy neither the third nor the fifth condition.

| Model | Mechanism | Cache preserved across an effort change? | Classification |
|---|---|---|---|
| GPT-6 Astra | Appended `configuration_update` event | Documented | Exact |
| Claude Fable 5.1 / Mythos 5.1 / Opus 5 | Per-message effort in an appended system event | Documented | Exact |
| Qwen3 | `/think` or `/no_think` in the latest message | Yes, by construction, given prefix caching in the serving runtime | Open-weight analogue |
| Gemini | Per-request thinking level plus explicit, named cached content | Stable cached base can be reused; not documented for the full implicit dialogue history | Economic near-equivalent |
| Grok 4.6 | Top-level effort plus automatic caching | Not documented across effort changes | Unconfirmed |
| Kimi K3 | Effort chosen before the conversation starts | No supported transition | Not equivalent |
| DeepSeek V4, GLM-5.3, Qwen3.8 (graded template), gpt-oss | Effort encoded in the opening system block or an early prompt prefix | No | Cache-breaking |
| Mistral Small 4, MiniMax M3 | Effort/thinking chosen via a top-level request field, not an appended event | No supported transition | Not equivalent |

This list is not necessarily exhaustive, and it will age quickly — treat it as a snapshot of the principal frontier and open-weight families as of early September 2026, not a permanent scorecard.

### GPT-6 Astra: `configuration_update`

Astra introduces `configuration_update`, an event appended to conversation history that changes reasoning effort for subsequent turns while the earlier prompt prefix stays cache-eligible. It currently changes only reasoning effort, applies from the next user turn until another update overrides it, and works only in the standard single-agent configuration. It cannot currently be combined directly with automatic compaction or truncation — after an explicit compaction, the application must reapply the desired configuration itself, since compaction rewrites the prefix the update was appended to.[^openai-reasoning][^openai-caching][^gpt6-astra]

Response metadata can also report the request-level effort rather than the effective effort established by an in-history `configuration_update`. A dashboard that reads only that field will show the wrong effort for every turn after the first update — log the update event itself, not just the per-response metadata.

### Claude: per-message effort

Claude's Fable 5.1, Mythos 5.1, and Opus 5 models support per-message effort through an appended, empty system message carrying `output_config.effort`:

```json
{
  "role": "system",
  "content": [],
  "output_config": { "effort": "high" }
}
```

The feature sits behind the beta header `mid-conversation-output-config-2026-07-01`; the date in a beta header names when the header was registered, not when the capability became generally usable, and public release notes describing the behavior appeared on September 1, 2026, shortly before Astra's September 3 launch. The new effort applies to the following user turn and persists until overridden; earlier messages remain byte-for-byte unchanged, so the existing cached prefix can still be reused. Changing the traditional top-level `effort` parameter still restarts the cache — this mechanism is additive, not a replacement for it. Anthropic's broader direction is append-only changes for system instructions, tool definitions, and turn-scoped instructions as well as output configuration, which is what makes the design relevant to long-running agents beyond effort alone.[^anthropic-effort][^anthropic-caching]

### Qwen3: the open-weight precursor

Qwen3's `/think` and `/no_think` steering is a real open-weight analogue: the model follows the most recent instruction, so if it's appended to a new message, all prior tokens stay identical and a runtime such as vLLM can reuse the KV cache for that prefix.[^qwen3][^vllm-cache] It is weaker than Astra or Claude's mechanism in four ways: it is binary rather than graded, natural-language rather than a privileged typed event, potentially imitable by user or retrieved content, and dependent on the serving runtime's routing, eviction, and serialization rather than a hosted API-level guarantee. Qwen3.8's newer graded-effort template cuts the other way: it converts effort into an instruction placed in the initial system message, which changes the start of the token sequence and invalidates the cache on every effort change. Preserved thinking across turns is a separate property from where the effort selection itself sits in the prompt; finer-grained effort control and cache composability are in tension here, not the same feature.

### Gemini: a useful near-equivalent

Gemini separates the per-request `thinking_level` from an explicitly named cached-content object: an application caches a large system prompt, document corpus, or other stable context once, references it in later requests, and varies the thinking level independently. That preserves the economic value of the cached base context and is a strong pattern for RAG and stable-context workloads. It is not the same guarantee as an appended in-conversation control event — Google does not document that changing thinking level mid-conversation preserves the entire accumulated dialogue cache — so treat it as a near-equivalent for stable corpora and inspect `total_cached_tokens` rather than assume a hit from the request shape.[^gemini][^gemini-caching]

### Why most models still lose the cache

Official chat templates confirm early, cache-breaking effort placement in DeepSeek V4, GLM-5.3, and gpt-oss.[^deepseek-v4][^glm][^gpt-oss] Mistral Small 4 and MiniMax M3 select effort or thinking mode through a top-level request field rather than an appended event, so neither offers a documented mid-conversation transition; the exact rendering details differ from model to model and are worth checking against the current chat template before relying on them.[^mistral-small4][^minimax-m3] Kimi K3's `reasoning_effort` is a top-level field with no mid-conversation update path documented; it separately requires the full `reasoning_content` from prior turns to be passed back verbatim, which is a preserved-thinking requirement, not a claim about effort itself being changeable.[^kimi-k3] Grok exposes both reasoning effort and prompt caching, but xAI's caching docs address only message edits, deletions, and reordering — effort transitions specifically aren't addressed either way, which is why it's classified as unconfirmed rather than cache-breaking.[^xai][^xai-caching]

### The unresolved problem: compaction

An append-only history eventually gets too large and has to be compacted, and compaction rewrites the prefix — which can erase the very control events this design depends on. Astra's restriction against combining `configuration_update` with automatic compaction is an honest acknowledgment of that gap rather than an edge case to route around. A complete checkpoint needs to preserve summarized semantic history alongside the effective control state — current reasoning effort, active tools, permissions, response configuration — not just the compressed conversation text. This is the same gap Bet 3, in the closing section below, is about: reasoning and configuration state is heading toward a typed protocol object, and compaction is the part of that object nobody has fully solved yet.

Read together, these mechanisms are early pieces of something larger than cheaper caching: an append-only inference control plane, where conversation history stays immutable and cacheable while changes to effort, tools, permissions, or other execution policy arrive as privileged events layered on top instead of prefix rewrites. One consequence worth carrying forward: escalating effort later cannot retroactively repair a decision already made under low effort. Raise effort before an irreversible step, or make sure the higher-effort turn explicitly re-examines the earlier conclusion rather than just building on it.

## Choosing an effort level

Start with the lowest effort that reliably clears your quality bar. Increase it when the task has branching possibilities, dependent steps, ambiguity, or costly mistakes.

### None or minimal: direct transformation

Suitable for classification, extraction, formatting, routing, and fast retrieval that do not benefit from chained reasoning.

### Low: light judgment

Useful for short explanations, straightforward tool use, and familiar code changes with one likely solution path.

### Medium: balanced default

A good starting point for planning, debugging, multi-step work, and decisions with several constraints.

### High: hard reasoning

Consider it for complex debugging, architecture, adversarial review, and high-value analysis where missed details matter more than latency.

### Xhigh or max: quality-first runs

Reserve the deepest settings for asynchronous research or difficult agentic work—and only when evaluations justify the additional resources.

### A five-question routing test

1. Does the task require several dependent decisions?
2. Are there multiple plausible approaches worth comparing?
3. Would a subtle mistake be expensive or difficult to detect?
4. Can the user tolerate additional latency?
5. Do evaluations show that extra effort improves the outcome?

The first three questions estimate potential value. The fourth establishes the operational budget. The fifth decides the matter. If the evaluation says “no,” the higher setting is overhead.

## Evaluate a frontier, not a winner

There is no globally best effort level. You are looking for the configurations that sit on the quality–latency–cost frontier for your workload.

### What published work already shows

The most influential independent result is Snell and colleagues’ ICLR 2025 study of test-time compute. Using mathematical reasoning tasks, revision models, and process reward models, the authors found that the useful strategy depended on problem difficulty. Their adaptive, compute-optimal policy reached the performance of a best-of-*N* baseline with up to four times less inference compute. In a FLOPs-matched comparison, a smaller model with test-time compute could beat a model with fourteen times as many parameters on problems where the smaller model already had a non-trivial chance of success. On the hardest problems, however, additional inference produced little benefit; more capable weights remained the better investment.[^snell]

The peer-reviewed *s1* project provides a concrete implementation case. The researchers fine-tuned Qwen2.5-32B-Instruct on 1,000 carefully selected reasoning examples, then controlled its inference budget by ending the reasoning span at a limit or appending “Wait” when the model tried to stop. On AIME 2024, extending the budget raised reported accuracy from 50% to 57%. The case is important because the data, model, and code are open, but its result should not be universalized: the model was specifically trained for the intervention and the headline evaluations were competition mathematics and science questions.[^s1]

A later large-scale study generated more than 30 billion tokens with eight open models across four reasoning datasets. It found no universally best test-time strategy. Some models favored short traces; others benefited from longer traces only on hard problems; expanding beam search often flattened or reduced accuracy even while consuming more tokens. The best policy depended on the model’s post-training, the problem, and the available compute budget.[^art-tts]

### A published harness case: retry only the failures

Anthropic reported a directly operational experiment on an internal subset of SWE-bench Pro. At low effort, 16% of tasks failed; rerunning only those test-detected failures at the default effort brought the pass rate to about 93% for roughly $0.45 per task. Running every task once at the default achieved 91.7% for $0.93 per task. Starting at medium and rerunning failures produced about 94% for $0.61.[^anthropic-cost]

The result is a useful case study of what an agent harness contributes: the model adapts within one call, but the harness observes an external test result and reallocates budget across calls. It also exposes the boundary conditions. The measurement was vendor-run on a private subset and is not comparable to the public SWE-bench leaderboard. It works because tests provide a reliable failure signal, and failed tasks pay for two attempts and therefore take longer.

> **Read the numbers as evidence for a pattern, not as portable pricing.** The independent studies use mathematical and scientific tasks; the harness example uses checkable code tasks and vendor models. Together they support adaptive allocation, but they do not establish one universal effort level.

### What these results establish

1. Additional inference compute can improve accuracy when the model has a viable solution path.
2. The way compute is spent—longer trace, revisions, parallel samples, verifier, or retry—matters as much as the amount.
3. The hardest tasks may need a stronger model rather than more effort on a weaker one.
4. When outcomes are cheaply verifiable, low-first escalation can beat any fixed setting on cost per successful task.

These findings are enough to reject “always high” and “always low” as general policies. They cannot choose a default for every unseen workload, but they give an engineer a defensible prior: allocate effort adaptively, use external verification when it is trustworthy, and measure success at the level of the complete task rather than one model call.

## Routing effort in production

Once the evaluation reveals different sweet spots, stop sending every request through one global setting. Route by observable task properties.

```javascript
function chooseEffort(task) {
  if (task.kind === "extract" && task.schemaIsStrict) {
    return "low";
  }

  if (task.isHighStakes || task.hasManyConstraints) {
    return task.canRunAsync ? "high" : "medium";
  }

  return "medium";
}
```

A router can use request type, number of constraints, tool plan, user tier, latency budget, or an inexpensive difficulty classifier. Keep the decision explainable and log the chosen level. Otherwise, effort becomes an invisible variable in incident analysis.

Three useful patterns:

1. **Start low, escalate on evidence.** Retry at a higher effort only after a validator detects a concrete failure.
2. **Split planning from execution.** Use more effort to form a plan, then less effort for repetitive, constrained steps.
3. **Reserve deep runs.** Move xhigh or max work to asynchronous paths with explicit budgets and timeouts.

### Production guardrails

- Pin a model version while running comparisons.
- Set generated-token and wall-clock limits.
- Handle incomplete responses before showing output.
- Record the model, effort, usage, latency, and validator result.
- Re-run evaluations after model, prompt, tool, or schema changes.

## The mistakes that look reasonable

### Defaulting everything to high

Routine work absorbs extra latency and cost while difficult work still lacks task-specific evaluation.

### Using answer length as a quality metric

Long responses can be shallow. Grade correctness, coverage, evidence, and downstream success.

### Changing prompt and effort together

You lose causal information. Sweep one variable at a time before testing interactions.

### Ignoring the missing answer

Reasoning can consume the output envelope. Detect incomplete states and budget generated tokens deliberately.

### Treating labels as portable

“Medium” on one model is not a standardized quantity. Recalibrate when the model or provider changes.

## What comes next: from slider to allocator

*These are dated, falsifiable bets—not a summary of announced product roadmaps. They should be revisited by the end of 2028.*

The reasoning-effort slider is useful today because the underlying systems are still uneven. Over time, the slider is likely to become less important as a user-interface choice and more important as a policy boundary. The user or application will state the goal, risk tolerance, deadline, and spend limit; a provider and agent harness will decide how to distribute that budget.

### Bet 1 — by the end of 2027, effort moves to the step level

A single effort value for an entire agent run is too coarse. Classification, planning, a reversible tool call, an irreversible action, and final verification have different stakes. Harnesses already vary models and settings per call. The next step is a controller that learns where an additional unit of compute has the highest expected value, while explicit rules cap spend and protect high-risk actions.

### Bet 2 — gateways standardize intent before they standardize units

Providers are unlikely to agree on a literal unit of reasoning. Their mechanisms are too different: one extends a single trace, another sets a token ceiling, another fans out agents. A more durable cross-provider contract would express an application intent such as *latency-first*, *balanced*, *quality-first*, or *maximum cost*, then record the native policy used to satisfy it. Gateways can translate the intent, but evaluations must decide whether the translation is acceptable.

### Bet 3 — by 2028, reasoning state becomes a typed protocol object

Preserved and interleaved thinking point toward long-running agents that carry structured reasoning state across tools and turns. That state can improve continuity and cache efficiency, but it also creates questions about context growth, privacy, retention, replay, and portability. Harnesses will need typed reasoning-state interfaces in the same way they now need typed tool calls.

This bet already has an early, narrow data point. GPT-6 Astra's `configuration_update` and Claude's per-message `output_config.effort`, both shipped in the first days of September 2026, treat effort as an appended, typed event rather than a prefix rewrite — see the cache-preserving effort section above. Neither system has solved the harder version of the problem yet: what happens to that appended state when the conversation is compacted. That gap is exactly what this bet is about.

### Bet 4 — the best systems mix several kinds of test-time compute

More inference does not have to mean a longer monologue. A future allocator may choose between extending one trace, asking a verifier, sampling alternatives, running a specialist, or creating a small team of agents. The important quantity will be total system compute per successful outcome, including tools and retries—not the token count of one response.

### Bet 5 — automatic effort improves, but budget ownership stays outside the model

Providers will get better at estimating prompt difficulty, and harnesses will learn from validation and production outcomes. Yet neither can infer every business constraint from text. The model does not know the true cost of a bad migration unless the system tells it; the provider does not own the application’s latency promise; a learned router cannot approve an irreversible action merely because it is confident. Automation can allocate the envelope. Product and engineering teams still define it.

The likely end state is not “always think harder.” It is an inference market inside each request: several possible reasoning actions compete for a limited budget, and the system spends only while the expected improvement exceeds the marginal cost.

These bets would be wrong if fixed high effort remains Pareto-optimal across diverse production benchmarks, if providers converge on a portable compute unit, or if raw prompt difficulty alone predicts the correct budget without application context. Those are useful failure conditions: they turn a speculative ending into claims the field can actually test.

## Closing thoughts

**Buy reasoning where it changes the outcome.**

Reasoning effort is an engineering control over inference-time work. Start with a measured baseline, increase effort only for tasks that can use it, and keep the level only when quality gains survive a fair comparison with latency and cost.

```text
lowest effort + required quality = right default
```

[^openai-reasoning]: OpenAI, [“Reasoning models”](https://developers.openai.com/api/docs/guides/reasoning): reasoning tokens, effort behavior, context allocation, usage, and incomplete responses.
[^openai-models]: OpenAI, [“Model guidance”](https://developers.openai.com/api/docs/guides/latest-model): current GPT-5.6 effort levels and selection guidance.
[^anthropic-thinking]: Anthropic, [“Adaptive thinking”](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking): per-request thinking decisions, effort steering, and interleaved thinking.
[^anthropic-effort]: Anthropic, [“Effort”](https://platform.claude.com/docs/en/build-with-claude/effort): response-wide token expenditure and model-specific levels.
[^gemini]: Google, [“Gemini thinking”](https://ai.google.dev/gemini-api/docs/thinking): dynamic thinking, thinking levels, budgets, and model support.
[^openrouter]: OpenRouter, [“Reasoning tokens”](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens): normalized effort and token-budget controls.
[^baseten]: Baseten, [“DeepSeek V3.2”](https://www.baseten.co/library/deepseek-v3-2/) and [Inference API overview](https://docs.baseten.co/reference/inference-api/overview): model-specific thinking on an OpenAI-compatible endpoint.
[^deepseek-r1]: DeepSeek, [“DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning”](https://arxiv.org/abs/2501.12948): RLVR, R1-Zero, the full R1 pipeline, and distillation.
[^qwen3]: Qwen, [“Qwen3 inference with Transformers”](https://github.com/QwenLM/Qwen3/blob/main/docs/source/inference/transformers.md): thinking and non-thinking controls.
[^gpt-oss]: OpenAI, [“gpt-oss-120b”](https://developers.openai.com/api/docs/models/gpt-oss-120b) and [“Harmony response format”](https://cookbook.openai.com/articles/openai-harmony): open weights, effort, and channel protocol.
[^deepseek-v4]: DeepSeek, [“Thinking mode”](https://api-docs.deepseek.com/guides/thinking_mode/) and [V4 encoding documentation](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731/blob/main/encoding/README.md): effort levels, mappings, and prompt prefixes.
[^nemotron]: NVIDIA, [“Nemotron 3 Ultra”](https://research.nvidia.com/labs/nemotron/Nemotron-3-Ultra/) and its [technical report](https://arxiv.org/abs/2606.15007): reasoning-budget control and post-training.
[^kimi-k3]: Moonshot AI, [“Kimi K3”](https://github.com/MoonshotAI/Kimi-K3) and its [technical report](https://arxiv.org/abs/2607.24653): effort specialists, preserved thinking, and distillation.
[^glm]: Z.ai, [“GLM-5.3”](https://z.ai/blog/glm-5.3) and [“Thinking mode”](https://docs.z.ai/guides/capabilities/thinking-mode): current effort API and agentic thinking state.
[^inkling]: Thinking Machines Lab, [“Inkling: Our Open-Weights Model”](https://thinkingmachines.ai/news/introducing-inkling/): continuous effort conditioning and per-token cost in RL.
[^openai-agents]: OpenAI, [“Agents SDK models”](https://openai.github.io/openai-agents-python/models/) and [“Usage”](https://openai.github.io/openai-agents-python/usage/): reasoning settings and run-level accounting.
[^langchain-agents]: LangChain, [“Agents”](https://docs.langchain.com/oss/python/langchain/agents): middleware, dynamic model selection, state, retries, and tools.
[^glm-flash]: Z.ai, [“GLM-5.3-Flash: Frontier Intelligence, Flash Cost”](https://z.ai/blog/glm-5.3-flash): the latest Flash release and behavior across effort levels.
[^kimi-k25]: Moonshot AI, [“Kimi K2.5: Visual Agentic Intelligence”](https://arxiv.org/abs/2602.02276): Token-Efficient RL and alternating budgeted and unconstrained phases.
[^xai]: xAI, [“Reasoning”](https://docs.x.ai/developers/model-capabilities/text/reasoning): Grok 4.6 effort levels, encrypted reasoning continuity, and multi-agent effort semantics.
[^qwen38]: Qwen, [“Qwen3.8”](https://github.com/QwenLM/Qwen3.8): explicit reasoning effort and preserved thinking in the latest open-model series.
[^cot]: Wei et al., [“Chain-of-Thought Prompting Elicits Reasoning in Large Language Models”](https://arxiv.org/abs/2201.11903): worked intermediate reasoning as an inference-time capability.
[^self-consistency]: Wang et al., [“Self-Consistency Improves Chain of Thought Reasoning in Language Models”](https://arxiv.org/abs/2203.11171): sampling diverse reasoning paths and selecting their most consistent answer.
[^process-supervision]: OpenAI, [“Improving mathematical reasoning with process supervision”](https://openai.com/index/improving-mathematical-reasoning-with-process-supervision/): rewarding intermediate steps and selecting among multiple solutions.
[^o1]: OpenAI, [“Learning to reason with LLMs”](https://openai.com/index/learning-to-reason-with-llms/): the September 2024 o1 release, reinforcement learning, test-time compute, and hidden chain-of-thought.
[^snell]: Snell et al., [“Scaling LLM Test-Time Compute Optimally Can Be More Effective Than Scaling Model Parameters”](https://arxiv.org/abs/2408.03314), ICLR 2025: adaptive allocation, verifier search, revisions, and FLOPs-matched comparisons.
[^s1]: Muennighoff et al., [“s1: Simple Test-Time Scaling”](https://aclanthology.org/2025.emnlp-main.1025/), EMNLP 2025: an open implementation of budget forcing trained from 1,000 curated reasoning examples.
[^anthropic-cost]: Anthropic, [“Optimizing for cost and intelligence”](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence): vendor-run effort sweeps, SWE-bench Pro escalation results, task budgets, and multi-model routing.
[^art-tts]: Agarwal, Sengupta, and Chakraborty, [“The Art of Scaling Test-Time Compute for Large Language Models”](https://arxiv.org/abs/2512.02008): a 30-billion-token comparison across eight open models and four reasoning datasets.
[^openai-caching]: OpenAI, [“Prompt caching”](https://developers.openai.com/api/docs/guides/prompt-caching): prefix-caching mechanics, cache breakpoints, and how a changed prompt prefix invalidates a cached conversation.
[^gpt6-astra]: OpenAI, [“GPT-6 Astra”](https://openai.com/index/gpt-6-astra/) and [“Reasoning models: configuration_update”](https://developers.openai.com/api/docs/guides/reasoning#configuration-update): the appended, cache-preserving effort-update event, its restrictions with automatic compaction, and the request-level-effort reporting caveat.
[^anthropic-caching]: Anthropic, [“Prompt caching”](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): cache breakpoints and the mid-conversation `output_config.effort` update that preserves earlier ones.
[^vllm-cache]: vLLM, [“Automatic Prefix Caching”](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html): how a serving runtime reuses KV cache for an unchanged token prefix.
[^gemini-caching]: Google, [“Context caching”](https://ai.google.dev/gemini-api/docs/caching): explicit, named cached content billed separately from the per-request thinking level.
[^xai-caching]: xAI, [“Prompt caching”](https://docs.x.ai/developers/advanced-api-usage/prompt-caching) and [“What breaks caching”](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn): automatic caching behavior on Grok models; editing, removing, or reordering earlier messages breaks the cache, and effort transitions specifically aren't addressed either way.
[^mistral-small4]: Mistral AI, [“Introducing Mistral Small 4”](https://mistral.ai/news/mistral-small-4/) and [model card](https://huggingface.co/mistralai/Mistral-Small-4-119B-2603): `reasoning_effort` is a top-level request field (`high`/`none`) rendered into the chat template rather than an appended event; Mistral's own settings-block prefix mechanism (`[MODEL_SETTINGS]{"reasoning_effort": "..."}`) is documented for Mistral Medium 3.5, not confirmed for Small 4 specifically.
[^minimax-m3]: MiniMax, [“MiniMax M3”](https://huggingface.co/MiniMaxAI/MiniMax-M3) chat template: a `thinking` request field (`enabled`/`adaptive`/`disabled`) with reasoning wrapped in `<mm:think>` tags; exactly how that field is rendered into the prompt wasn't independently confirmed for this piece.
