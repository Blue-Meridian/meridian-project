# Known issues

## Coordinator (Orchestrate) — intermittent recursion-limit failure

**Symptom.** Some Coordinator-mode chat runs fail mid-pipeline with:

> I have encountered an error. Please try again. (Error: Recursion limit of 30
> reached without hitting a stop condition. You can increase the limit by setting
> the `recursion_limit` config key.)
> https://python.langchain.com/docs/troubleshooting/errors/GRAPH_RECURSION_LIMIT

It is **intermittent** — the same prompt ("Build a clean energy plan for Nain")
often succeeds on retry and returns the full seven-section brief in ~30 s
(verified against the deployed API, 2026-05-31). Granite mode is unaffected.

**Root cause (Orchestrate-side, not this repo).** The Coordinator is a LangGraph
multi-agent graph. When the supervisor↔specialist hand-off loops without
converging, it hits LangGraph's default `recursion_limit` of 30 and aborts. This
is a config/agent-instruction issue inside watsonx Orchestrate — there is no
code in this repo (FastAPI tools or React frontend) that can fix it. `api/chat.py`
only proxies the NDJSON stream; the loop happens before the stream reaches us.

**Fix options for Isaac (Orchestrate console / ADK):**
1. **Raise the limit.** Set `recursion_limit` higher (e.g. 50) on the Coordinator
   run/agent config so a few extra hand-offs don't trip it.
2. **Tighten the stop condition (preferred).** The Coordinator instructions say
   "call the 5 agents in order, then return the brief verbatim." Make the
   terminal step unambiguous so the supervisor stops after Brief Writer returns
   instead of re-planning — e.g. an explicit "once Brief Writer returns
   `brief_markdown`, output it and END; do not call any agent again" guideline.
   Most recursion loops here are a specialist being re-invoked because the
   supervisor didn't recognise the run as complete.
3. **Lower fan-out.** Ensure each specialist is called once; if any are marked as
   collaborators that can be re-entered, constrain them.

**Frontend handling (done, this repo).** The chat can't prevent the failure, but
it no longer lies about it: when a Coordinator reply contains the recursion /
error markers, the Agent-pipeline card switches to a red "Run didn't complete —
try again" state instead of showing five green checkmarks. See
`frontend/src/components/AgentPipeline.tsx` (`errored` prop) and the detection in
`ConversationPanel.tsx` (`MessageRow`).

**Demo guidance.** If recording, retry once if the first Coordinator run trips the
limit, or use Granite mode for the narrated single-community answer. The portfolio
brief panel (right side) always reads the deterministic `briefs.json`, so its
numbers are correct regardless.
