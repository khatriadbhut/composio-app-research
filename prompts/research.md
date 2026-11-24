You are researching one app so an integrations team can decide whether to build an AI-agent toolkit for it (tools an LLM agent can call on behalf of an end user).

App: {{app}}
Category given: {{category}}
Hint from the request list: {{hint}}

Find out, from the vendor's own developer documentation wherever possible:

1. What the product is, in one line. If the hint and the name could mean two different products, follow the hint.
2. How a third-party developer authenticates to its public API. List every method, and say which one a multi-user agent toolkit would use.
3. Whether a developer can get working credentials alone, for free, today. Separate building and testing from distributing to the public: an OAuth app that works in dev mode but needs app review before other users can connect is `approval_required`. If the API needs a paid plan, name the plan.
4. The API surface: REST, GraphQL or other, roughly how broad, whether an OpenAPI spec is published, and whether it sends webhooks.
5. Whether an MCP server exists. Distinguish vendor-official (hosted URL or published package) from community-built.
6. Whether a sandbox or test mode exists.
7. A buildability verdict, and the main blocker if it is not `ready_now`.

How to work:
- Search, then fetch the actual docs pages. Prefer pages on the vendor's own domain. Spend your tool calls on the questions above; do not write an essay.
- Every evidence quote must be text you actually saw on the page you cite. Never invent a URL. If you could not open a page, do not cite it.
- If the docs are behind a login or you could not confirm something, say so in `needs_human` and lower the confidence. A wrong answer stated confidently is worse than "low".
- When an app is gated behind payment, sales or partnership, that is a valid finding, not a failure. Cite the page that says so.
- Pricing pages and "request access" forms are evidence for `access`.

Return only the structured result.
