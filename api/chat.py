"""
Chat module for Meridian — streams responses from watsonx.ai Granite (or
the Orchestrate Coordinator) over the briefs as grounded context.

Used by api/main.py's /chat proxy. Streamlit-free; the IAM token cache is
a simple time-based dict so the only runtime dependency is httpx.

/* USAGE:
    from api.chat import stream_chat, stream_via_orchestrate, has_credentials

    for chunk in stream_chat(
        user_message="Compare Nain and Natuashish",
        history=[],
        briefs=briefs_dict,
        current_state={"budget_m": 50, "w_dollar": 0.4, ...},
    ):
        ...  # forward chunk as SSE
*/
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Iterator, Optional

import httpx

WATSONX_URL_DEFAULT = "https://us-south.ml.cloud.ibm.com"
WATSONX_MODEL_DEFAULT = "ibm/granite-3-8b-instruct"
WATSONX_API_VERSION = "2024-05-01"

# watsonx.ai requires the project_id to be a UUID v4.
_UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def has_credentials() -> bool:
    return bool(
        os.environ.get("IBM_CLOUD_API_KEY") and os.environ.get("WATSONX_PROJECT_ID")
    )


def project_id_looks_valid() -> bool:
    pid = (os.environ.get("WATSONX_PROJECT_ID") or "").strip().strip('"').strip("'")
    return bool(_UUID_V4_RE.match(pid))


# ── IAM token cache (replaces st.cache_data) ─────────────────────────────────

_token_cache: dict = {"token": None, "expires_at": 0.0}


def _get_iam_token() -> str:
    """
    Exchange an IBM Cloud API key for a short-lived IAM access token.
    Cached in-process for ~45 min (IAM tokens last 1 hour; we refresh early).
    """
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]

    api_key = os.environ["IBM_CLOUD_API_KEY"]
    resp = httpx.post(
        "https://iam.cloud.ibm.com/identity/token",
        data={
            "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
            "apikey": api_key,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    payload = resp.json()
    _token_cache["token"] = payload["access_token"]
    # Cache for up to 45 min, refreshing 60s before stated expiry as a margin.
    expires_in = int(payload.get("expires_in", 3600))
    _token_cache["expires_at"] = now + min(expires_in - 60, 2700)
    return _token_cache["token"]


# ── Orchestrate Coordinator streaming (optional path) ────────────────────────


def stream_via_orchestrate(
    messages: list[dict],
    current_state: Optional[dict] = None,
) -> Iterator[str]:
    """
    Stream from the watsonx Orchestrate Coordinator agent. Reads
    ORCHESTRATE_AGENT_URL + ORCHESTRATE_API_KEY (or falls back to IAM via
    IBM_CLOUD_API_KEY). Tries OpenAI-style SSE first, then a few
    Orchestrate-specific shapes.
    """
    agent_url = (os.environ.get("ORCHESTRATE_AGENT_URL") or "").strip()
    api_key = (os.environ.get("ORCHESTRATE_API_KEY") or "").strip()

    if not agent_url:
        yield (
            "⚠️ Coordinator mode needs an Orchestrate REST URL.\n\n"
            "Set `ORCHESTRATE_AGENT_URL` in `.env` to the Coordinator agent's "
            "invocation URL (Orchestrate agent builder → Deploy → API).\n\n"
            "Set `ORCHESTRATE_API_KEY` if your instance uses a dedicated key; "
            "otherwise the proxy reuses `IBM_CLOUD_API_KEY` via IAM."
        )
        return

    try:
        auth_header = (
            f"Bearer {api_key}" if api_key else f"Bearer {_get_iam_token()}"
        )
    except Exception as e:
        yield f"⚠️ Couldn't get auth token for Orchestrate: {type(e).__name__}: {e}"
        return

    chat_messages = [
        {"role": m.get("role"), "content": m.get("content")}
        for m in messages
        if m.get("role") in ("user", "assistant", "system") and m.get("content")
    ]

    if current_state:
        sys_note = (
            f"Current dashboard state — budget: ${current_state.get('budget_m', '?')}M, "
            f"weights dollar={current_state.get('w_dollar', 0):.2f}, "
            f"co2={current_state.get('w_co2', 0):.2f}, "
            f"equity={current_state.get('w_equity', 0):.2f}."
        )
        chat_messages = [{"role": "system", "content": sys_note}] + chat_messages

    body = {"messages": chat_messages, "stream": True}
    headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    try:
        with httpx.stream("POST", agent_url, json=body, headers=headers, timeout=300) as resp:
            if resp.status_code != 200:
                error_body = resp.read().decode(errors="replace")[:600]
                yield (
                    f"⚠️ Orchestrate returned HTTP {resp.status_code}.\n\n"
                    f"```\n{error_body}\n```\n\n"
                    f"Common causes: wrong `ORCHESTRATE_AGENT_URL`, expired or wrong "
                    f"`ORCHESTRATE_API_KEY`, agent not deployed, or the chat schema "
                    f"differs from OpenAI's. Check the agent builder's Deploy → API tab."
                )
                return

            for raw in resp.iter_lines():
                if not raw:
                    continue
                line = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]" or not data:
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                # OpenAI-style delta
                choices = payload.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    chunk = delta.get("content")
                    if chunk:
                        yield chunk
                        continue
                # Orchestrate-specific shapes seen in the wild
                for key in ("content", "delta", "text", "output", "message"):
                    val = payload.get(key)
                    if isinstance(val, str) and val:
                        yield val
                        break
                    if isinstance(val, dict):
                        inner = val.get("content") or val.get("text")
                        if isinstance(inner, str) and inner:
                            yield inner
                            break
    except httpx.TimeoutException:
        yield "\n\n⚠️ Orchestrate timed out after 300s."
    except Exception as e:
        yield f"\n\n⚠️ Orchestrate stream error: {type(e).__name__}: {e}"


# ── watsonx.ai error diagnosis ───────────────────────────────────────────────


def _diagnose_watsonx_error(
    status_code: int, body: str, model_id: str, project_id: str
) -> str:
    """Translate a watsonx.ai error response into an actionable hint."""
    body_lower = body.lower()

    if "no_associated_service_instance" in body_lower or (
        status_code == 403 and "not associated" in body_lower
    ):
        return (
            "**Your project has no Watson Machine Learning (WML) instance attached.** "
            "watsonx.ai needs a WML / Runtime service associated with the project before it can serve inference.\n\n"
            "**Fix in ~30 seconds:**\n"
            "1. Open the project: https://dataplatform.cloud.ibm.com/projects/?context=wx\n"
            "2. Click your project, then the **Manage** tab.\n"
            "3. Open **Services & integrations** in the left nav.\n"
            "4. Click **Associate service**.\n"
            "5. Pick your **Watson Machine Learning** / **watsonx.ai Runtime** instance. "
            "If you don't have one, provision it from IBM Cloud Catalog (Services → "
            "*Watson Machine Learning*, Lite plan is free)."
        )

    if status_code == 401 or "unauthorized" in body_lower:
        return (
            "**Authentication failed.** Likely an expired or wrong "
            "`IBM_CLOUD_API_KEY`. Generate a new key at "
            "https://cloud.ibm.com/iam/apikeys and update `.env`."
        )

    if "project_id" in body_lower and ("invalid" in body_lower or "not found" in body_lower):
        return (
            f"**Project ID {project_id} not found** in your IBM Cloud account. "
            "Confirm the UUID in watsonx.ai Studio → Prompt Lab → `</>` View code → "
            "Developer access."
        )

    if "model_id" in body_lower or "model not found" in body_lower or "not allowed" in body_lower:
        return (
            f"**Model `{model_id}` isn't enabled** in this project. "
            "Open Prompt Lab and try the model from the picker. Or set `WATSONX_MODEL_ID` "
            "in `.env` to a model you can use (e.g. `ibm/granite-13b-instruct-v2`)."
        )

    if status_code == 404 and "version" in body_lower:
        return (
            "**Wrong API version.** watsonx.ai may have moved past the version pinned "
            "in `api/chat.py` (`WATSONX_API_VERSION`). Try a more recent date."
        )

    return (
        f"Common causes: wrong `WATSONX_URL` region, missing WML/Runtime service, "
        f"or model id `{model_id}` not enabled in your project."
    )


# ── System prompt construction ───────────────────────────────────────────────


def build_system_prompt(briefs: dict, current_state: Optional[dict] = None) -> str:
    """Build the grounded system prompt with all 20 community summaries + state."""
    communities = briefs["communities"]

    summary_lines = []
    for c in communities:
        e = c["economics"]
        s = c["system"]
        gov_label = "Indigenous" if c["indigenous"] else "non-Indigenous"
        summary_lines.append(
            f"- **{c['name']}** ({c['region']}, {gov_label}): "
            f"capex ${e['capital_cost_cad']['point']/1e6:.1f}M | "
            f"saves ${e['annual_cost_saved_cad']/1e6:.2f}M/y | "
            f"avoids {e['annual_co2_avoided_tonnes']:,} tCO₂/y | "
            f"payback {e['payback_years']}y | "
            f"mix: {s['mix_label']}"
        )
    summary = "\n".join(summary_lines)

    total_cap = sum(c["economics"]["capital_cost_cad"]["point"] for c in communities)
    total_co2 = sum(c["economics"]["annual_co2_avoided_tonnes"] for c in communities)
    total_savings = sum(c["economics"]["annual_cost_saved_cad"] for c in communities)
    n_indig = sum(1 for c in communities if c["indigenous"])

    state_block = ""
    if current_state:
        ranking_text = ""
        ranked = current_state.get("ranking_rows", [])
        if ranked:
            for r in ranked:
                flag = "✓ fundable" if r["fundable"] else "  above budget"
                ranking_text += (
                    f"  {r['name']:32s} score {r['score']:.4f}  "
                    f"capex ${r['capital_cost_m']:.1f}M  {flag}\n"
                )
        state_block = f"""
=== Current dashboard state ===
- Budget: ${current_state.get('budget_m', '?')}M
- Weights: dollar={current_state.get('w_dollar', 0):.2f}, CO2={current_state.get('w_co2', 0):.2f}, equity={current_state.get('w_equity', 0):.2f}  (normalised inside the ranker)
- Fundable under these settings: {current_state.get('fundable_count', '?')} of {len(communities)} communities, using ${current_state.get('fundable_capital_m', 0):.1f}M of the ${current_state.get('budget_m', 0)}M budget
- Annual CO2 avoided (fundable subset): {current_state.get('fundable_co2', 0):,} tonnes
- Annual cost saved (fundable subset): ${current_state.get('fundable_savings_m', 0):.1f}M

=== Current ranking under those settings (top → bottom) ===
{ranking_text}"""

    return f"""You are **Meridian**, an AI assistant for Newfoundland and Labrador's off-diesel energy planning. You help NL Hydro resource planners and federal program officers (Natural Resources Canada, Indigenous Services Canada) understand the 20 diesel-dependent NL communities and their clean-energy options.

You have detailed pre-feasibility data for all 20 communities below. Always use specific numbers from the data; never invent values. Cite community names by name. Use Canadian spelling.

When users ask portfolio questions ("rank under $X", "which to fund first", "compare X and Y"), reason from the dataset — the cost savings, CO2 avoided, the 1.5× equity multiplier for Indigenous-governed communities, and the federal funding programs. The dashboard's current ranking is included below under "Current dashboard state".

Refer to Indigenous communities by their governance: **Nunatsiavut Government** (Inuit, 5 communities), **Mushuau Innu First Nation** (1 community — Natuashish), **NunatuKavut Community Council** (11 communities along south Labrador). Never call them "stakeholders".

Be concise. Note that all payback figures are simple payback (excludes ongoing operations and maintenance). Capacity sizing comes from the NL Hydro 2020 Hatch study.

=== Twenty community summaries ===
{summary}

=== Province-wide totals (if all 20 funded) ===
- Total capital: ${total_cap/1e6:.1f}M
- Annual CO2 avoidable: {total_co2:,} tonnes
- Annual cost savings: ${total_savings/1e6:.1f}M
- Indigenous-governed: {n_indig} of 20

=== Federal funding programs ===
1. **Reducing Diesel Dependency in Isolated Labrador Communities** — $220M, Labrador-only, Indigenous-priority. Eligibility requires the community be in Labrador AND have Indigenous governance (or formal Indigenous partnership).
2. **Indigenous Off-Diesel Initiative (IODI)** — National. Requires Indigenous governance / leadership of the project.
3. **Clean Energy for Rural and Remote Communities (CERRC)** — $453M, applies to all 20 by geographic scope.
4. **Smart Renewables and Electrification Pathways (SREPs)** — $2.2B, utility-scale only; relevant when project capex ≥ $5M or when communities are bundled into a regional proposal.
{state_block}"""


# ── Granite streaming chat ───────────────────────────────────────────────────


def stream_chat(
    user_message: str,
    history: list[dict],
    briefs: dict,
    current_state: Optional[dict] = None,
) -> Iterator[str]:
    """
    Stream a Granite response with the briefs baked into the system prompt.
    Yields text chunks; the FastAPI /chat proxy wraps each in an SSE frame.
    """
    if not has_credentials():
        yield (
            "⚠️ Chat is not connected to watsonx.ai. Add `IBM_CLOUD_API_KEY` and "
            "`WATSONX_PROJECT_ID` to your `.env` (see `.env.example`), then restart "
            "the API with `uvicorn api.main:app`."
        )
        return

    if not project_id_looks_valid():
        raw = (os.environ.get("WATSONX_PROJECT_ID") or "").strip()
        yield (
            f"⚠️ `WATSONX_PROJECT_ID` must be a UUID v4.\n\n"
            f"Current value: `{raw}`\n\n"
            f"**Where to find it:**\n"
            f"1. Open https://dataplatform.cloud.ibm.com/wx/home\n"
            f"2. **Open Prompt Lab** → top-right **`</>` View code** → "
            f"**Developer access** → Project ID.\n"
            f"3. Paste into `.env` as `WATSONX_PROJECT_ID=<uuid>`."
        )
        return

    try:
        token = _get_iam_token()
    except httpx.HTTPStatusError as e:
        yield f"⚠️ IAM token request failed (HTTP {e.response.status_code}). Check `IBM_CLOUD_API_KEY` in `.env`."
        return
    except Exception as e:
        yield f"⚠️ IAM token error: {type(e).__name__}: {e}"
        return

    system_prompt = build_system_prompt(briefs, current_state)

    messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": user_message})

    url_base = os.environ.get("WATSONX_URL", WATSONX_URL_DEFAULT)
    model_id = os.environ.get("WATSONX_MODEL_ID", WATSONX_MODEL_DEFAULT)
    project_id = os.environ["WATSONX_PROJECT_ID"]
    url = f"{url_base}/ml/v1/text/chat_stream?version={WATSONX_API_VERSION}"

    body = {
        "model_id": model_id,
        "project_id": project_id,
        "messages": messages,
        "max_tokens": 1200,
        "temperature": 0.3,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    try:
        with httpx.stream("POST", url, json=body, headers=headers, timeout=120) as resp:
            if resp.status_code != 200:
                error_body = resp.read().decode(errors="replace")[:600]
                hint = _diagnose_watsonx_error(
                    resp.status_code, error_body, model_id, project_id
                )
                yield (
                    f"⚠️ watsonx.ai returned HTTP {resp.status_code}.\n\n"
                    f"{hint}\n\n"
                    f"<details><summary>Raw response</summary>\n\n"
                    f"```\n{error_body}\n```\n\n"
                    f"</details>"
                )
                return

            for raw in resp.iter_lines():
                if not raw:
                    continue
                line = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]" or not data:
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = payload.get("choices", [])
                if not choices:
                    continue
                delta = choices[0].get("delta", {}) or {}
                chunk = delta.get("content")
                if chunk:
                    yield chunk
    except httpx.TimeoutException:
        yield "\n\n⚠️ watsonx.ai timed out after 120s. Try a shorter question or retry."
    except Exception as e:
        yield f"\n\n⚠️ Error during streaming: {type(e).__name__}: {e}"
