# Disci + Instinct: credentials and connection guide

Verified October 26, 2026. Owner notes and draft onboarding guidance.

## The short answer

Your vault currently has **three** Disci entries. They serve different purposes, rather than representing three separate Disci accounts:

- **Disci-MCP** identifies the connecting application: its OAuth client ID and client secret.
- **Disci user login** signs you into your own Disci account: your email and password.
- **Disci-MCP session** preserves the authorization from a successful sign-in: a reusable refresh credential.

The first answers "which application is connecting?" The second answers "which person is signing in?" The third lets that connection continue without repeating the full sign-in every time.

The names were checked against current vault metadata. Their roles come from the successful connection setup. No stored secret values are included here.

## What each saved item does

### Disci-MCP: application credentials

Disci uses Amazon Cognito for sign-in. Its MCP connection has a registered OAuth application, separate from the browser app's OAuth application. The MCP application has a client ID and a confidential client secret.

These credentials identify that application during token exchanges. **They are not your personal Disci password, and they are not sufficient on their own to read your budget.** A valid authorization for a particular user is also needed.

Used when establishing the authorized connection and when exchanging a refresh credential for a new access token. Changing your personal password does not replace the application credentials. Treat the client secret as confidential, not as a value to put in public setup instructions.

### Disci user login: your personal account

This is your Disci account email and password. It is used for the hosted sign-in step, including first-time authorization or a later sign-in when a session can no longer be renewed.

It is not needed for every budget request when a usable authorized session exists. Other people must use their own accounts, never your login.

### Disci-MCP session: authorization remembered after sign-in

This entry holds the reusable refresh credential saved after your successful authorization. It is not another password or another account.

A refresh credential can obtain a short-lived access token. The access token, rather than your account password, is presented to Disci when requesting budget data.

Your saved session was successfully reused for fresh budget reads on October 26. A secure-use approval was requested before its first reuse. Such an approval allows use of the saved credential; it does not create a new Disci account or prove a data request succeeded.

Treat this session credential like a password. Do not copy it into chat, documentation, screenshots, or another person's vault. Keeping the entry alone does not guarantee an indefinitely working connection.

## How authorization and a budget read fit together

1. **Find Disci.** The connection starts with Disci's MCP endpoint and its published authentication information.
2. **Identify the application.** The registered OAuth client identifies the connecting application.
3. **Sign in as a user.** Cognito authenticates that person's Disci account and issues authorization for that user.
4. **Obtain tokens.** An authorization code is exchanged for tokens. The short-lived access token authorizes requests; the refresh credential allows renewal.
5. **Read Disci data.** Disci checks the access token and uses the authenticated user's identity to look up their data.
6. **Renew when needed.** If the access token expires, a valid refresh credential can obtain another. If renewal fails, sign-in may be needed again.

Disci's current infrastructure configuration sets access and ID tokens to **60 minutes**, and refresh tokens to **30 days**. These are configured lifetimes, not a guarantee that a session remains valid for that long: expiry, revocation, or configuration changes can require reauthorization. A one-hour access-token lifetime was also observed during the connection test.

Disci's code is designed to scope API data to the authenticated user's profile. This is not a claim that multi-user isolation has been independently tested through Instinct.

## What is connected today, and what "sync" does not mean

The tested connection is an **on-demand, read-only connection**, not a demonstrated background synchronization service.

Today, the exposed capability is `get_budget_summary`. It returns budgets covering a date, with planned and actual income and expenses, budget line items, pending amounts, and remaining amounts. The date defaults to today in the user's configured timezone.

Important limits:

- No budget edits, transaction creation, or other write capability was exposed in the tests.
- The summary returns budget line items, not the underlying purchases inside a line item such as Fun Money.
- `actual` counts confirmed transactions. In this capability, `pending` means entries awaiting the user's approval.
- `remaining` is planned minus actual. It is not a bank balance or a safe-to-spend calculation.
- A successful read does not prove every outside transaction has been imported or approved.
- No automatic refresh schedule, change notifications, or ongoing background sync was set up by these tests.

## Current connection details

- **MCP endpoint:** <https://molrqp0ch5.execute-api.us-east-2.amazonaws.com/mcp>
- **Authentication:** Amazon Cognito, OAuth authorization-code flow.
- **Required scope advertised by the MCP service:** `openid`.
- **Current registered callback:** `https://claude.ai/api/mcp/auth_callback`.

The callback is where an OAuth provider returns an authorization response. It is not a user's profile URL. Your GitHub repository helped identify the configuration; your GitHub profile is not the callback.

**The current OAuth client is configured for Claude's callback, not an established Instinct-specific callback.** Your successful Instinct test does not establish a general, self-service Instinct connector. Do not tell users to select Claude's callback in Instinct, redirect authorization responses to an unrelated site, or copy a session from your account.

The web app has a separate public OAuth client with no client secret, using authorization code plus PKCE. That browser-app client is distinct from both your personal login and the confidential MCP client.

## Draft guidance for other Disci users

### Status: guided pilot, not verified self-service onboarding

Another person's complete Instinct setup has **not yet been tested**. Use this section as a pilot checklist until that has been done.

1. **Get access to Disci.** Current configuration is invite-only, not open self-signup. Accept the Disci invitation and complete the initial password setup.
2. **Sign into the Disci web app at least once.** This creates the user profile that MCP requests look up. Without it, Disci can return "Sign in to the Disci web app once first."
3. **Ask Instinct to connect to Disci.** Provide the MCP endpoint above and explain that you want read-only access to your own budget. Treat this as a request for a supported connection path, not a promise that a dedicated Disci setup screen exists.
4. **Confirm that a supported authorization path is available.** The current callback configuration is a rollout gap. If no compatible path is available, pause and ask Disci's maintainer to arrange one. Do not work around it by sharing someone else's tokens or publishing the client secret.
5. **Use only your own account.** Enter persistent secrets only through a secure credential or sign-in flow, never as plain chat text. Complete any required secure-use approval.
6. **Verify the result.** Ask for this month's budget summary and compare it with your Disci account. Check the period, a known line item, and the totals. A successful sign-in alone is not a successful data connection.
7. **Verify reuse.** Make another request after the initial access token expires to check renewal. Expect reauthorization when the session expires or is revoked.

Suggested first request:

> Connect to my Disci account for read-only budget summaries using the MCP endpoint in this guide. Tell me if authorization needs more setup, then summarize my current month's budget once connected.

### Before publishing this as a supported setup guide

- Establish and document an Instinct-compatible authorization path, including any required registered callback.
- Decide how the connecting application will securely hold its client credentials. Do not make public distribution of a confidential client secret the onboarding plan.
- Test a second user's invitation, first web sign-in, authorization, budget read, token renewal, and reauthorization.
- Test that each user sees only their own data, including failure cases and an account with no matching budget.
- Define a user-facing disconnect/revoke procedure and test that renewal stops. Do not assume deleting a local vault entry or signing out of the web app revokes every outstanding authorization.
- Describe the product as read-only budget access unless and until additional capabilities or background sync are actually available and tested.

## Troubleshooting

- **"Sign in to the Disci web app once first":** finish a web sign-in with the same account, then retry the budget request.
- **Invalid or mismatched callback:** the application and provider configuration must agree. A GitHub URL or arbitrary callback is not a substitute.
- **Session renewal fails:** reauthorize through the supported sign-in path. Do not replace the refresh credential with your account password or another user's session.
- **No budget covers the date:** check the requested date and the budget's start and end dates. This need not mean authentication failed.
- **Figures differ from expectations:** compare confirmed entries and entries awaiting approval in Disci. The summary does not establish import completeness.

## Sources and verification boundary

Checked October 26, 2026:

- [Disci MCP overview](https://github.com/connor-ruff/disci/blob/main/docs/mcp/mcp-overview.md): capability, connection prerequisites, and current rollout status.
- [Cognito configuration](https://github.com/connor-ruff/aws_iac_mngr/blob/main/controlled_resources/disci/auth.tf): separate web and MCP clients, callback, scopes, invitation policy, token lifetimes, and revocation setting.
- [Budget-summary implementation](https://github.com/connor-ruff/disci/blob/main/mcp_server/disci_mcp/finance.py): returned fields, date handling, confirmed/pending semantics, and remaining calculation.
- [Token verification](https://github.com/connor-ruff/disci/blob/main/mcp_server/disci_mcp/auth.py): token and client validation.
- [User-profile lookup](https://github.com/connor-ruff/disci/blob/main/api/app/core/db.py): first web sign-in requirement and user-scoped access.
- [Live resource discovery](https://molrqp0ch5.execute-api.us-east-2.amazonaws.com/.well-known/oauth-protected-resource/mcp) and [live identity discovery](https://cognito-idp.us-east-2.amazonaws.com/us-east-2_fNVWgEaJ5/.well-known/openid-configuration): endpoint, identity provider, and advertised authentication information.

Source revisions inspected: Disci `d91462e`; infrastructure `7971a8f`. Repository configuration is evidence of intended settings, not a complete audit of the deployed environment. Vault names were checked live; successful sign-in, renewal, and budget reads refer to your October 26 connection tests. No new authenticated budget read was needed to prepare this guide. No second-user onboarding or background sync was verified.
