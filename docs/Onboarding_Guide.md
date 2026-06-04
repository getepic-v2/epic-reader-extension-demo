# Epic Reader Extension — Partner Onboarding Guide

> This guide walks third-party teams through the onboarding process before starting extension development.

---

## 1. Onboarding Checklist

| # | Item | Provided By | Description |
|---|------|-------------|-------------|
| 1 | GitHub Repository | Epic | A dedicated repo under the `getepic-v2` org for your extension source code |
| 2 | `manifest.json` | Epic | Pre-filled with your `id` and `globalName` |
| 3 | API Key & Secret | Epic | For accessing the [Open API](./open-api-book.md) (book data query & labData upload) |
| 4 | Book Whitelist | Epic | List of `book_id`s your team is authorized to access |
| 5 | Test Environment Account | Epic | Login credentials for the QA reader (`webqa-new.getepic.dev`) with book subscription access |
| 6 | Slack Channel Invite (Optional) | Epic | Shared channel for technical communication |

---

## 2. How to Request

Send an email or Slack message to your Epic contact (lihaitao6@getepic.com) with the following information:

| Field | Description | Example |
|-------|-------------|---------|
| Company Name | Your company/team name | Acme Interactive |
| Product Name | Name of the extension you're building | Quiz Extension |
| GitHub Usernames | GitHub accounts that need fork access | `@alice`, `@bob` |
| Technical Contact | Primary developer for technical communication | alice@acme.com |
| Target Books | Book IDs you need access to (if known) | 49524, 49528 |
| Rendering Mode | Whether you need Full Takeover Mode (reader skips rendering original page images; extension renders all page content and interactions). See [Developer Guide - Full Takeover Mode](./Epic_Reader_Extension_Developer_Guide.md#9-full-takeover-mode-custom-page-content) | Yes / No |

---

## 3. What You'll Receive

Once your request is approved, we will provide:

### 3.1 GitHub Repository

- Repo: `getepic-v2/extension-{company}-{product}` (e.g., `extension-acme-quiz`)
- Pre-filled `manifest.json` with your assigned `globalName`
- You fork the repo and develop in your fork, then submit PRs back

### 3.2 API Credentials

- **API Key** — included in the `X-Api-Key` request header
- **API Secret** — used for HMAC-SHA256 signature generation
- See [Open API Documentation](./open-api-book.md) for usage details

> **Security:** Keep your API Key and Secret confidential. Do not commit them to source code or share publicly.

### 3.3 Book Whitelist

- The specific `book_id`s your API Key is authorized to access
- Additional books can be requested at any time

### 3.4 Test Environment Account

- URL: `https://webqa-new.getepic.dev`
- A dedicated account with book subscription access for development and testing
- See the [Developer Guide](./Epic_Reader_Extension_Developer_Guide.md) for the debug workflow

### 3.5 Slack Channel

- A shared Slack channel for real-time technical communication with the Epic team

---

## 4. Development Workflow Overview

```
1. Request onboarding (this guide)
       │
       ▼
2. Receive repo, API credentials, test account
       │
       ▼
3. Fork the repo, develop your extension
   - Refer to the Developer Guide for API usage
   - Use the Open API to query book data and upload labData
   - Debug locally using the test environment
       │
       ▼
4. Submit a Pull Request to the main repo
       │
       ▼
5. Epic reviews, builds, and deploys to production
```

---

## 5. Resources

| Resource | Link |
|----------|------|
| Developer Guide (English) | [Epic_Reader_Extension_Developer_Guide.md](./Epic_Reader_Extension_Developer_Guide.md) |
| Developer Guide (Chinese) | [Epic_Reader_Extension_开发文档.md](./Epic_Reader_Extension_开发文档.md) |
| Open API Documentation | [open-api-book.md](./open-api-book.md) |
| Star Interaction Example | [Epic_Reader_Extension_Star_Interaction_Example.md](./Epic_Reader_Extension_Star_Interaction_Example.md) |
