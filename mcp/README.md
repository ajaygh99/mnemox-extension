# mnemox-mcp

Mnemox MCP server — score prompts, count tokens, save and retrieve memories.

Works with **Claude Code**, **Cowork**, **Cursor**, and any MCP-compatible AI tool.

## Install

```bash
npm install -g mnemox-mcp
```

Or run directly without installing:

```bash
npx mnemox-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `score_prompt` | Score a prompt 0-100 using 8 rules. 100% local, no API. |
| `count_tokens` | Estimate token count + cost for any model. 100% local. |
| `get_memory` | Retrieve or semantically search saved memories. |
| `save_memory` | Save a memory to the Mnemox backend. |

## Configure in Claude Code

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mnemox": {
      "command": "mnemox-mcp",
      "env": {
        "MNEMOX_API_URL": "https://mnemox-production.up.railway.app"
      }
    }
  }
}
```

Or with `npx` (no global install needed):

```json
{
  "mcpServers": {
    "mnemox": {
      "command": "npx",
      "args": ["mnemox-mcp"],
      "env": {
        "MNEMOX_API_URL": "https://mnemox-production.up.railway.app"
      }
    }
  }
}
```

## Configure in Cursor

Add to Cursor settings → MCP:

```json
{
  "mnemox": {
    "command": "mnemox-mcp"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MNEMOX_API_URL` | `https://mnemox-production.up.railway.app` | Mnemox backend URL |

`score_prompt` and `count_tokens` are 100% local — they work without any backend connection.

`get_memory` and `save_memory` require the backend to be reachable.

## Example Usage

Once configured, ask your AI assistant:

- *"Score this prompt: [your prompt]"*
- *"How many tokens is this?"*
- *"Save a memory: I prefer concise bullet-point answers"*
- *"What do I have saved in Mnemox?"*
