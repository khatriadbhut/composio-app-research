# Labeling rubric

The same definitions are used by the research agent (src/schema.json), the verifier and the hand audit, so a disagreement means a different reading of the facts, not of the words.

**auth_methods**: every way a third-party developer can authenticate to the public API.
`oauth2`, `oauth1`, `api_key` (key in a header or query), `bearer_token` (personal access / static token), `basic`, `jwt_service_account`, `aws_sigv4`, `hmac_signature`, `bot_token`, `none`, `other`.
**auth_primary**: the one a multi-user agent toolkit would use (usually OAuth2 if offered).

**access**: can a developer get working credentials alone, today?
- `self_serve_free`: a free account or free tier gives API access.
- `self_serve_trial`: only through a time-limited trial.
- `paid_plan_required`: the API needs a paid plan.
- `approval_required`: app review, a developer token, or admin approval stands between dev mode and real use (for example public OAuth distribution needs review).
- `partner_gated`: a partnership program is required.
- `contact_sales`: enterprise or sales-only.
- `no_public_api`: none exists.

**api_styles**: `rest`, `graphql`, `soap`, `grpc`, `websocket`, `sdk_only`, `cli_only`, `library_only`, `none`.
**api_breadth**: `broad` (roughly 50+ operations across the product), `moderate` (10–50, core objects), `narrow` (a handful), `none`.

**mcp**: `official_remote` (vendor-hosted MCP URL), `official_local` (vendor-published package), `community_only`, `none_found`.

**buildability**: could an agent toolkit ship today?
- `ready_now`: public API and self-serve credentials.
- `ready_with_caveats`: buildable, but app review, a paid plan or a narrow API slows it.
- `needs_partnership_or_sales`: blocked on a business conversation.
- `not_buildable`: no usable API.

**main_blocker**: `none`, `app_review`, `paid_plan`, `partnership`, `enterprise_sales`, `no_public_api`, `local_only_tool`, `narrow_api`, `tos_or_rate_limits`, `other`.
