#!/usr/bin/env python3
"""
Async — CLI
A standalone command-line interface for your 72-skill Claude ecosystem.

Usage:
  python cli.py send "Your message" [OPTIONS]
  python cli.py sessions list
  python cli.py sessions new "Name"
  python cli.py skills list [--domain DOMAIN]
  python cli.py skills search "query"
  python cli.py memory list
  python cli.py memory add "Key" "Value"
  python cli.py export --session SESSION_ID
  python cli.py config set --key sk-ant-...
  python cli.py config show

Config file: ~/.async-ai/config.json
"""

import json
import os
import sys
import argparse
import urllib.request
import urllib.error
import http.client
import time
import textwrap
from pathlib import Path
from datetime import datetime

# ─────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────

CONFIG_DIR  = Path.home() / ".async-ai"
CONFIG_FILE = CONFIG_DIR / "config.json"
DATA_FILE   = CONFIG_DIR / "sessions.json"
MEMORY_FILE = CONFIG_DIR / "memory.json"

DEFAULT_CONFIG = {
    "apiKeys": {
        "anthropic": "",
        "openai": "",
        "google": "",
        "groq": "",
    },
    "defaultModel": "claude-opus-4-5",
    "defaultProvider": "anthropic",
    "maxTokens": 4096,
    "defaultSystemPrompt": (
        "You are Claude, an AI assistant. "
        "You are working with a sophisticated developer who manages a curated library of 72+ skills."
    ),
}

MODELS = {
    "claude-opus-4-5":           {"provider": "anthropic", "input": 15.00,  "output": 75.00},
    "claude-sonnet-4-5":         {"provider": "anthropic", "input": 3.00,   "output": 15.00},
    "claude-haiku-3-5":          {"provider": "anthropic", "input": 0.80,   "output": 4.00},
    "gpt-4o":                    {"provider": "openai",    "input": 2.50,   "output": 10.00},
    "gpt-4o-mini":               {"provider": "openai",    "input": 0.15,   "output": 0.60},
    "o3":                        {"provider": "openai",    "input": 10.00,  "output": 40.00},
    "gemini-2.5-pro":            {"provider": "google",    "input": 1.25,   "output": 10.00},
    "gemini-2.5-flash":          {"provider": "google",    "input": 0.15,   "output": 0.60},
    "llama-3.3-70b-versatile":   {"provider": "groq",      "input": 0.59,   "output": 0.79},
    "llama-3.1-8b-instant":      {"provider": "groq",      "input": 0.05,   "output": 0.08},
}

SKILLS_SUMMARY = [
    ("office-files",      "Documents",   "Create/edit Word, Excel, PowerPoint, PDF"),
    ("eng-debug",         "Engineering", "Structured debug: reproduce→isolate→fix"),
    ("tdd",               "Dev Workflow","RED-GREEN-REFACTOR before implementation"),
    ("systematic-debugging","Dev Workflow","Root-cause discipline before proposing fixes"),
    ("writing-plans",     "Dev Workflow","Turn a spec into a task-by-task plan"),
    ("brainstorming",     "Dev Workflow","Explore intent/requirements before building"),
    ("eng-architecture",  "Engineering", "ADRs and trade-off records"),
    ("security-review",   "Engineering Craft","Threat model + vulnerability audit"),
    ("massgen",           "MassGen",     "Invoke multi-agent system on a task"),
    ("context-compression","Context",    "Compaction + handoff summaries"),
    ("memory-systems",    "Context",     "Persistent semantic memory across sessions"),
    ("multi-agent",       "Agents",      "Supervisor/swarm coordination patterns"),
    ("llm-eval",          "Agents",      "Eval sets, graders, variance handling"),
    ("data-analysis",     "Engineering Craft","pandas/plotting, honest statistics"),
    ("performance",       "Engineering Craft","Measure-first optimization"),
    ("ci-cd",             "Engineering Craft","GitHub Actions, caching, flaky CI"),
]


def ensure_dirs():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    ensure_dirs()
    if CONFIG_FILE.exists():
        try:
            return {**DEFAULT_CONFIG, **json.loads(CONFIG_FILE.read_text())}
        except Exception:
            pass
    return dict(DEFAULT_CONFIG)


def save_config(cfg: dict):
    ensure_dirs()
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def load_sessions() -> list:
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text())
        except Exception:
            pass
    return []


def save_sessions(sessions: list):
    ensure_dirs()
    DATA_FILE.write_text(json.dumps(sessions, indent=2))


def load_memories() -> list:
    if MEMORY_FILE.exists():
        try:
            return json.loads(MEMORY_FILE.read_text())
        except Exception:
            pass
    return []


def save_memories(mems: list):
    ensure_dirs()
    MEMORY_FILE.write_text(json.dumps(mems, indent=2))


def uid() -> str:
    import random, string
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8)) + str(int(time.time() * 1000))[-6:]


# ─────────────────────────────────────────────────────────────
# Terminal colors
# ─────────────────────────────────────────────────────────────

class C:
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    INDIGO = "\033[38;5;105m"
    CYAN   = "\033[38;5;87m"
    GREEN  = "\033[38;5;82m"
    YELLOW = "\033[38;5;220m"
    RED    = "\033[38;5;196m"
    GRAY   = "\033[38;5;244m"

def color(text, *attrs):
    return "".join(attrs) + str(text) + C.RESET

def header(text):
    print(f"\n{color('✦', C.INDIGO, C.BOLD)} {color(text, C.BOLD)}")

def dim(text):
    print(color(f"  {text}", C.DIM))

def success(text):
    print(color(f"  ✓ {text}", C.GREEN))

def warn(text):
    print(color(f"  ⚠ {text}", C.YELLOW))

def error(text):
    print(color(f"  ✕ {text}", C.RED))
    sys.exit(1)


# ─────────────────────────────────────────────────────────────
# API calls
# ─────────────────────────────────────────────────────────────

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    m = MODELS.get(model, {})
    return (input_tokens / 1_000_000) * m.get("input", 0) + \
           (output_tokens / 1_000_000) * m.get("output", 0)


def call_anthropic_stream(api_key: str, model: str, messages: list,
                          system: str, max_tokens: int):
    """Stream from Anthropic, printing tokens as they arrive. Returns (text, usage)."""
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
        "stream": True,
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    accumulated = ""
    usage = {"input_tokens": 0, "output_tokens": 0}

    try:
        with urllib.request.urlopen(req) as resp:
            buffer = ""
            while True:
                chunk = resp.read(1024)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                lines = buffer.split("\n")
                buffer = lines.pop()
                for line in lines:
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        continue
                    try:
                        ev = json.loads(data)
                        if ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                            t = ev["delta"]["text"]
                            print(t, end="", flush=True)
                            accumulated += t
                        if ev.get("type") == "message_start":
                            usage["input_tokens"] = ev.get("message", {}).get("usage", {}).get("input_tokens", 0)
                        if ev.get("type") == "message_delta":
                            usage["output_tokens"] = ev.get("usage", {}).get("output_tokens", 0)
                    except Exception:
                        pass
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        error(f"Anthropic API error {e.code}: {body_text[:200]}")

    print()  # newline after stream
    return accumulated, usage


def call_openai_stream(api_key: str, model: str, messages: list,
                       system: str, max_tokens: int, base_url: str = "https://api.openai.com"):
    """Stream from OpenAI-compatible API."""
    api_messages = []
    if system:
        api_messages.append({"role": "system", "content": system})
    api_messages.extend(messages)

    body = json.dumps({
        "model": model,
        "messages": api_messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": max_tokens,
    }).encode()

    req = urllib.request.Request(
        f"{base_url}/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    accumulated = ""
    usage = {"input_tokens": 0, "output_tokens": 0}

    try:
        with urllib.request.urlopen(req) as resp:
            buffer = ""
            while True:
                chunk = resp.read(1024)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                lines = buffer.split("\n")
                buffer = lines.pop()
                for line in lines:
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        continue
                    try:
                        ev = json.loads(data)
                        t = ev.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if t:
                            print(t, end="", flush=True)
                            accumulated += t
                        if ev.get("usage"):
                            usage["input_tokens"]  = ev["usage"].get("prompt_tokens", 0)
                            usage["output_tokens"] = ev["usage"].get("completion_tokens", 0)
                    except Exception:
                        pass
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        error(f"API error {e.code}: {body_text[:200]}")

    print()
    return accumulated, usage


def send_message(cfg: dict, messages: list, model: str = None,
                 system: str = None, skill: str = None) -> tuple:
    """Route to correct provider and return (response_text, usage)."""
    model    = model or cfg["defaultModel"]
    system   = system or cfg["defaultSystemPrompt"]
    provider = MODELS.get(model, {}).get("provider", cfg["defaultProvider"])
    api_key  = cfg["apiKeys"].get(provider, "")
    max_tok  = cfg.get("maxTokens", 4096)

    if not api_key:
        error(f"No API key set for provider '{provider}'. Run: python cli.py config set --provider {provider} --key YOUR_KEY")

    if skill:
        messages = list(messages)
        messages[-1] = {
            **messages[-1],
            "content": f"Read and follow the **{skill}** skill.\n\n{messages[-1]['content']}"
        }

    print(f"\n{color('┄' * 60, C.DIM)}")
    print(color(f"  Model: {model}  Provider: {provider}", C.DIM))
    if skill:
        print(color(f"  Skill: {skill}", C.INDIGO))
    print(color('┄' * 60, C.DIM))
    print()

    if provider == "anthropic":
        return call_anthropic_stream(api_key, model, messages, system, max_tok)
    elif provider in ("openai",):
        return call_openai_stream(api_key, model, messages, system, max_tok)
    elif provider == "groq":
        return call_openai_stream(api_key, model, messages, system, max_tok, base_url="https://api.groq.com/openai")
    elif provider == "google":
        error("Gemini streaming via CLI not yet supported. Use the browser UI for Gemini models.")
    else:
        error(f"Unknown provider: {provider}")


# ─────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────

def cmd_send(args, cfg):
    """Send a one-shot or session-aware message."""
    sessions = load_sessions()
    session  = None

    if args.session:
        session = next((s for s in sessions if s["id"] == args.session or args.session in s["title"]), None)
        if not session:
            warn(f"Session '{args.session}' not found. Starting fresh.")

    messages = []
    if session:
        messages = [{"role": m["role"], "content": m["content"]} for m in session["messages"]]
        header(f"Continuing: {session['title']}")
    else:
        header("New message")

    messages.append({"role": "user", "content": args.message})

    model  = args.model or cfg["defaultModel"]
    system = args.system or (session["systemPrompt"] if session else cfg["defaultSystemPrompt"])
    skill  = args.skill

    text, usage = send_message(cfg, messages, model=model, system=system, skill=skill)

    if not text:
        warn("No response received.")
        return

    # Cost
    cost = calculate_cost(model, usage.get("input_tokens", 0), usage.get("output_tokens", 0))
    print(color(f"\n  ↑{usage.get('input_tokens',0):,} ↓{usage.get('output_tokens',0):,} tokens  ${cost:.5f}", C.DIM))

    # Save to session
    if args.save or args.session:
        if not session:
            title = args.message.strip()[:48] + ("…" if len(args.message) > 48 else "")
            session = {
                "id": uid(),
                "title": title,
                "model": model,
                "systemPrompt": system,
                "messages": [],
                "createdAt": int(time.time() * 1000),
                "updatedAt": int(time.time() * 1000),
            }
            sessions.insert(0, session)

        session["messages"].append({"role": "user",      "content": args.message,  "timestamp": int(time.time()*1000)})
        session["messages"].append({"role": "assistant", "content": text,           "timestamp": int(time.time()*1000), "usage": usage})
        session["updatedAt"] = int(time.time() * 1000)
        save_sessions(sessions)
        success(f"Saved to session: {session['id']} — {session['title'][:40]}")


def cmd_sessions_list(args, cfg):
    sessions = load_sessions()
    if not sessions:
        dim("No sessions yet. Use 'python cli.py send --save' to create one.")
        return
    header(f"Sessions ({len(sessions)})")
    for s in sessions[:20]:
        dt = datetime.fromtimestamp(s["updatedAt"] / 1000).strftime("%m/%d %H:%M")
        msg_count = len(s.get("messages", []))
        print(f"  {color(s['id'], C.INDIGO)}  {color(s['title'][:45], C.BOLD)}  {color(f'{msg_count}msg  {dt}', C.DIM)}")


def cmd_sessions_new(args, cfg):
    sessions = load_sessions()
    title    = args.name or "New Session"
    session  = {
        "id":           uid(),
        "title":        title,
        "model":        cfg["defaultModel"],
        "systemPrompt": cfg["defaultSystemPrompt"],
        "messages":     [],
        "createdAt":    int(time.time() * 1000),
        "updatedAt":    int(time.time() * 1000),
    }
    sessions.insert(0, session)
    save_sessions(sessions)
    success(f"Created session '{title}'  ID: {session['id']}")


def cmd_sessions_export(args, cfg):
    sessions = load_sessions()
    if args.session:
        session = next((s for s in sessions if s["id"] == args.session), None)
        if not session:
            error(f"Session '{args.session}' not found.")
    else:
        session = sessions[0] if sessions else None
    if not session:
        error("No sessions found.")

    lines = [f"# {session['title']}", f"*Model: {session['model']} — {len(session['messages'])} messages*\n"]
    for m in session["messages"]:
        role = "**You**" if m["role"] == "user" else "**Claude**"
        lines.append(f"{role}\n\n{m['content']}\n\n---\n")

    out = "\n".join(lines)
    filename = f"session_{session['id']}.md"
    Path(filename).write_text(out)
    success(f"Exported to {filename}")


def cmd_skills_list(args, cfg):
    header("Skill Library (sample — 72 skills total)")
    domain_filter = args.domain.lower() if args.domain else None
    for slug, domain, desc in SKILLS_SUMMARY:
        if domain_filter and domain_filter not in domain.lower():
            continue
        print(f"  {color(slug, C.INDIGO):<38} {color(domain, C.DIM):<20} {desc[:50]}")
    dim("\nUse the browser UI for the full 72-skill registry.")


def cmd_skills_search(args, cfg):
    query = args.query.lower()
    header(f"Skills matching '{args.query}'")
    found = [(s, d, desc) for s, d, desc in SKILLS_SUMMARY
             if query in s.lower() or query in d.lower() or query in desc.lower()]
    if not found:
        dim("No matches. Try a broader term.")
        return
    for slug, domain, desc in found:
        print(f"  {color(slug, C.INDIGO):<38} {desc}")


def cmd_memory_list(args, cfg):
    mems = load_memories()
    if not mems:
        dim("No memories yet. Add one with: python cli.py memory add 'Key' 'Value'")
        return
    header(f"Memory ({len(mems)} entries)")
    for m in mems:
        print(f"  {color(m['key'], C.INDIGO):<30} {m['value'][:60]}")


def cmd_memory_add(args, cfg):
    mems = load_memories()
    entry = {
        "id":        uid(),
        "key":       args.key,
        "value":     args.value,
        "source":    "cli",
        "tags":      [],
        "createdAt": int(time.time() * 1000),
        "useCount":  0,
    }
    mems.append(entry)
    save_memories(mems)
    success(f"Memory added: '{args.key}' → '{args.value[:60]}'")


def cmd_memory_delete(args, cfg):
    mems = load_memories()
    before = len(mems)
    mems = [m for m in mems if m["id"] != args.id and args.id not in m["key"]]
    save_memories(mems)
    deleted = before - len(mems)
    success(f"Deleted {deleted} memory entr{'y' if deleted == 1 else 'ies'}.")


def cmd_config_set(args, cfg):
    if args.key:
        provider = args.provider or "anthropic"
        cfg["apiKeys"][provider] = args.key
        save_config(cfg)
        success(f"API key set for provider '{provider}'.")
    if args.model:
        cfg["defaultModel"] = args.model
        save_config(cfg)
        success(f"Default model set to '{args.model}'.")
    if args.tokens:
        cfg["maxTokens"] = int(args.tokens)
        save_config(cfg)
        success(f"Max tokens set to {args.tokens}.")


def cmd_config_show(args, cfg):
    header("Configuration")
    for provider, key in cfg["apiKeys"].items():
        status = color("✓ SET", C.GREEN) if key else color("✕ NOT SET", C.YELLOW)
        masked = f"...{key[-8:]}" if key else "—"
        print(f"  {provider:<12} {status}  {masked}")
    print()
    dim(f"Default model:  {cfg['defaultModel']}")
    dim(f"Max tokens:     {cfg['maxTokens']}")
    dim(f"Config file:    {CONFIG_FILE}")
    dim(f"Sessions file:  {DATA_FILE}")


# ─────────────────────────────────────────────────────────────
# Argument parser
# ─────────────────────────────────────────────────────────────

def build_parser():
    p = argparse.ArgumentParser(
        prog="claude-cli",
        description="Async — Command Line Interface",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        Examples:
          python cli.py send "Explain TDD"
          python cli.py send "Debug this" --skill systematic-debugging --model claude-sonnet-4-5
          python cli.py send "Continue" --session abc123
          python cli.py sessions list
          python cli.py sessions new "My Project"
          python cli.py skills search "debug"
          python cli.py memory add "Tech stack" "Python 3.12, FastAPI, PostgreSQL"
          python cli.py config set --key sk-ant-... --provider anthropic
          python cli.py config set --key sk-... --provider openai
        """),
    )
    sub = p.add_subparsers(dest="command", required=True)

    # ── send ──
    sp = sub.add_parser("send", help="Send a message")
    sp.add_argument("message", help="Message to send")
    sp.add_argument("--model",   "-m", help=f"Model ID (default: {DEFAULT_CONFIG['defaultModel']})")
    sp.add_argument("--skill",   "-k", help="Skill slug to inject (e.g. tdd, systematic-debugging)")
    sp.add_argument("--session", "-s", help="Session ID or title prefix to continue")
    sp.add_argument("--system",        help="Override system prompt")
    sp.add_argument("--save",          action="store_true", help="Save exchange to a new session")

    # ── sessions ──
    ss = sub.add_parser("sessions", help="Manage sessions")
    ss_sub = ss.add_subparsers(dest="sessions_cmd", required=True)
    ss_sub.add_parser("list",   help="List sessions")
    sn = ss_sub.add_parser("new", help="Create a session")
    sn.add_argument("name", nargs="?", default="New Session")
    se = ss_sub.add_parser("export", help="Export session to markdown")
    se.add_argument("--session", "-s", help="Session ID")

    # ── skills ──
    sk = sub.add_parser("skills", help="Browse the skill library")
    sk_sub = sk.add_subparsers(dest="skills_cmd", required=True)
    sl = sk_sub.add_parser("list",   help="List skills")
    sl.add_argument("--domain", "-d", help="Filter by domain")
    sr = sk_sub.add_parser("search", help="Search skills")
    sr.add_argument("query")

    # ── memory ──
    mm = sub.add_parser("memory", help="Manage the memory store")
    mm_sub = mm.add_subparsers(dest="memory_cmd", required=True)
    mm_sub.add_parser("list", help="List all memories")
    ma = mm_sub.add_parser("add",    help="Add a memory")
    ma.add_argument("key");  ma.add_argument("value")
    md = mm_sub.add_parser("delete", help="Delete a memory by ID or key")
    md.add_argument("id")

    # ── config ──
    cf = sub.add_parser("config", help="View/edit configuration")
    cf_sub = cf.add_subparsers(dest="config_cmd", required=True)
    cf_sub.add_parser("show", help="Show current config")
    cs = cf_sub.add_parser("set",  help="Update config values")
    cs.add_argument("--key",      help="API key value")
    cs.add_argument("--provider", help="Provider for the key (anthropic/openai/google/groq)")
    cs.add_argument("--model",    help="Default model ID")
    cs.add_argument("--tokens",   help="Max tokens per request")

    return p


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    parser = build_parser()
    args   = parser.parse_args()
    cfg    = load_config()

    if args.command == "send":
        cmd_send(args, cfg)
    elif args.command == "sessions":
        if args.sessions_cmd == "list":
            cmd_sessions_list(args, cfg)
        elif args.sessions_cmd == "new":
            cmd_sessions_new(args, cfg)
        elif args.sessions_cmd == "export":
            cmd_sessions_export(args, cfg)
    elif args.command == "skills":
        if args.skills_cmd == "list":
            cmd_skills_list(args, cfg)
        elif args.skills_cmd == "search":
            cmd_skills_search(args, cfg)
    elif args.command == "memory":
        if args.memory_cmd == "list":
            cmd_memory_list(args, cfg)
        elif args.memory_cmd == "add":
            cmd_memory_add(args, cfg)
        elif args.memory_cmd == "delete":
            cmd_memory_delete(args, cfg)
    elif args.command == "config":
        if args.config_cmd == "show":
            cmd_config_show(args, cfg)
        elif args.config_cmd == "set":
            cmd_config_set(args, cfg)


if __name__ == "__main__":
    main()
